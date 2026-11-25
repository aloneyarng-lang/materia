import {BrowserWindow} from 'electron';
import path from 'node:path';

// Keep the loading window independent of library and renderer initialization.
const MIN_SPLASH_DURATION = 2000;
const WORKSPACE_SETTLE_DURATION = 400;
const FADE_DURATION = 180;

export function createStartup(appRoot, minimalMode = false) {
  if (process.env.MATERIA_HEADLESS === '1' || minimalMode) return {finish(reveal,focus) {reveal();focus();}, close() {}};
  const splash = new BrowserWindow({width:560,height:440,show:false,frame:false,
    resizable:false,maximizable:false,minimizable:false,skipTaskbar:true,
    transparent:true,backgroundColor:'#00000000',title:'Materia',
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  splash.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  splash.webContents.on('will-navigate',event=>event.preventDefault());
  let started,finished=false,delay,fade;
  const close=()=>{clearTimeout(delay);clearTimeout(fade);if(!splash.isDestroyed())splash.destroy();};
  splash.once('ready-to-show',()=>{
    if(finished||splash.isDestroyed())return;
    started=performance.now();
    splash.show();
    splash.webContents.executeJavaScript("document.documentElement.classList.add('playing')").catch(()=>{});
  });
  void splash.loadFile(path.join(appRoot,'dist','startup.html')).catch(()=>{
    if(!splash.isDestroyed())splash.destroy();
  });
  return {close,finish(reveal,focus){
    if(finished)return;finished=true;
    if(started===undefined||splash.isDestroyed()){reveal();close();focus();return;}
    delay=setTimeout(()=>{
      if(splash.isDestroyed()){reveal();focus();return;}
      splash.setAlwaysOnTop(true);
      reveal();
      splash.webContents.executeJavaScript("document.documentElement.classList.add('depart')").catch(()=>{});
      fade=setTimeout(()=>{close();focus();},FADE_DURATION);
    },Math.max(WORKSPACE_SETTLE_DURATION,MIN_SPLASH_DURATION-(performance.now()-started)));
  }};
}
