import {BrowserWindow} from 'electron';
import path from 'node:path';

// Keep the loading window independent of library and renderer initialization.
const SPLASH_DURATION = 1000;
const FADE_DURATION = 180;

export function createStartup(appRoot, minimalMode = false) {
  if (process.env.MATERIA_HEADLESS === '1') return {finish(reveal) {reveal();}, close() {}};
  if (minimalMode) return {finish(reveal) {reveal();}, close() {}};
  const splash = new BrowserWindow({width:560,height:440,show:false,frame:false,
    resizable:false,maximizable:false,minimizable:false,skipTaskbar:true,
    transparent:true,backgroundColor:'#00000000',title:'Materia',
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  splash.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  splash.webContents.on('will-navigate',event=>event.preventDefault());
  let started,finished=false,delay,fade;
  const close=()=>{clearTimeout(delay);clearTimeout(fade);if(!splash.isDestroyed())splash.destroy();};
  splash.once('ready-to-show',()=>{if(!finished&&!splash.isDestroyed()){started=performance.now();splash.show();}});
  void splash.loadFile(path.join(appRoot,'dist','startup.html')).catch(close);
  return {close,finish(reveal){
    if(finished)return;finished=true;
    if(started===undefined||splash.isDestroyed()){reveal();close();return;}
    delay=setTimeout(()=>{
      if(splash.isDestroyed()){reveal();return;}
      splash.webContents.executeJavaScript("document.documentElement.classList.add('depart')").catch(()=>{});
      fade=setTimeout(()=>{reveal();close();},FADE_DURATION);
    },Math.max(0,SPLASH_DURATION-FADE_DURATION-(performance.now()-started)));
  }};
}
