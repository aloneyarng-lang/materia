import {BrowserWindow} from 'electron';
import path from 'node:path';

// Keep the loading window independent of library and renderer initialization.
export async function createStartup(appRoot) {
  if (process.env.MATERIA_HEADLESS === '1') return {finish() {}, close() {}};
  const splash = new BrowserWindow({width:560,height:440,show:false,frame:false,
    resizable:false,maximizable:false,minimizable:false,skipTaskbar:true,
    backgroundColor:'#faf8f5',title:'少女祈愿中…',
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  splash.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  splash.webContents.on('will-navigate',event=>event.preventDefault());
  let started=Date.now(),finished=false,delay,fade;
  const close=()=>{clearTimeout(delay);clearTimeout(fade);if(!splash.isDestroyed())splash.destroy();};
  splash.once('ready-to-show',()=>{if(!splash.isDestroyed()){started=Date.now();splash.show();}});
  try {await splash.loadFile(path.join(appRoot,'dist','startup.html'));}
  catch {close();}
  return {close,finish(reveal){
    if(finished)return;finished=true;
    delay=setTimeout(()=>{
      if(splash.isDestroyed()){reveal();return;}
      splash.webContents.executeJavaScript("document.documentElement.classList.add('depart')").catch(()=>{});
      fade=setTimeout(()=>{reveal();close();},420);
    },Math.max(0,1350-(Date.now()-started)));
  }};
}
