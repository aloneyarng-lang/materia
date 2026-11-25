import {BrowserWindow,desktopCapturer,ipcMain,nativeImage,screen} from 'electron';
import path from 'node:path';
import {screenshotCrop} from '../dist/screenshot-selection.js';
import {NOTE_IMAGE_MAX_BYTES} from '../dist/note-model.js';

let capturing = false;

export async function captureQuickTipRegion(owner, root, labels) {
  if (capturing || owner.isDestroyed()) return null;
  capturing = true;
  let overlay;
  try {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const capture = desktopCapturer.getSources({types:['screen'],thumbnailSize:{
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    }});
    overlay = new BrowserWindow({...display.bounds,frame:false,show:false,skipTaskbar:true,resizable:false,
      backgroundColor:'#192026',webPreferences:{preload:path.join(root,'desktop','screenshot-preload.cjs'),
        contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
    const window = overlay;
    window.setAlwaysOnTop(true,'screen-saver');
    window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
    window.webContents.on('will-navigate', event => event.preventDefault());
    const channel = 'quick-tip:screenshot-overlay';
    let resolveRegion;
    const regionReady = new Promise(resolve => {resolveRegion=resolve;});
    const onOwnerClosed = () => resolveRegion(null);
    const onMessage = (event, action, region) => {
      if (window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return;
      if (action === 'ready') {window.show();window.focus();}
      if (action === 'finish') resolveRegion(region);
    };
    ipcMain.on(channel,onMessage);
    owner.once('closed',onOwnerClosed);
    window.once('closed',onOwnerClosed);
    window.webContents.once('render-process-gone',onOwnerClosed);
    let region, thumbnail;
    try {
      const [sources] = await Promise.all([capture,window.loadFile(path.join(root,'dist','screenshot-overlay.html'))]);
      if (window.isDestroyed() || owner.isDestroyed()) return null;
      const source = sources.find(item => item.display_id === String(display.id)) ?? (sources.length === 1 ? sources[0] : null);
      thumbnail = source?.thumbnail;
      if (!thumbnail || thumbnail.isEmpty()) throw Error('无法截取当前屏幕。');
      const {width,height} = thumbnail.getSize();
      const preview = Math.max(width,height) > 1920
        ? thumbnail.resize(width >= height ? {width:1920,quality:'good'} : {height:1920,quality:'good'})
        : thumbnail;
      window.webContents.send('quick-tip:screenshot-source',{source:'data:image/jpeg;base64,'+preview.toJPEG(84).toString('base64'),...labels});
      region = await regionReady;
    } finally {
      ipcMain.removeListener(channel,onMessage);
      owner.removeListener('closed',onOwnerClosed);
    }
    if (!region) return null;
    const factors = thumbnail.getScaleFactors();
    const scaleFactor = factors.length ? Math.max(...factors) : 1;
    const {width,height} = thumbnail.getSize(scaleFactor);
    const crop = screenshotCrop(region,width,height);
    if (!crop) return null;
    const bitmap = scaleFactor === 1 ? thumbnail
      : nativeImage.createFromBitmap(thumbnail.toBitmap({scaleFactor}), {width,height});
    let result = bitmap.crop(crop);
    if (crop.width > 1600 || crop.height > 1600) {
      result = result.resize(crop.width >= crop.height ? {width:1600} : {height:1600});
    }
    let bytes = result.toPNG(), type = 'image/png';
    for (const quality of [85,65,50]) {
      if (bytes.length <= NOTE_IMAGE_MAX_BYTES) break;
      bytes = result.toJPEG(quality);
      type = 'image/jpeg';
    }
    if (!bytes.length || bytes.length > NOTE_IMAGE_MAX_BYTES) throw Error('无法截取当前屏幕。');
    return {bytes,type,...result.getSize()};
  } finally {
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
    if (!owner.isDestroyed() && owner.isVisible()) owner.focus();
    capturing = false;
  }
}
