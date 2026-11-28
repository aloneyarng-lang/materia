import {BrowserWindow} from 'electron';
import path from 'node:path';

// Keep the loading window independent of library and renderer initialization.
const MIN_SPLASH_DURATION = 2000;
const LUXURY_SPLASH_DURATION = 2600;
const WORKSPACE_SETTLE_DURATION = 400;
const LUXURY_STYLES = new Set(['prism','chrome']);
export const STARTUP_STYLES = ['classic','drafting','obsidian','telemetry','aperture','diffraction','telescope','monolith','horology','prism','chrome'];
export const STARTUP_ANIMATION_VALUES = [...STARTUP_STYLES,'off'];
export const DEFAULT_STARTUP_ANIMATION = 'aperture';
const FADE_DURATION = {classic:180,drafting:280,obsidian:280,telemetry:280,aperture:280,diffraction:280,telescope:280,monolith:280,horology:280,prism:560,chrome:580};

export function normalizeStartupAnimation(value) {
  return STARTUP_ANIMATION_VALUES.includes(value) ? value : DEFAULT_STARTUP_ANIMATION;
}

// minimalMode keeps its historical meaning: no splash at all.
export function startupAnimationFor(config = {}) {
  return config.minimalMode === true ? 'off' : normalizeStartupAnimation(config.startupAnimation);
}

const noop = {finish(reveal,focus) {reveal();focus();}, close() {}};

export function createStartup(appRoot, animation = DEFAULT_STARTUP_ANIMATION, {autoFinish = false} = {}) {
  // Older callers passed the minimal-mode boolean.
  if (animation === true) animation = 'off';
  else if (animation === false) animation = DEFAULT_STARTUP_ANIMATION;
  const style = normalizeStartupAnimation(animation);
  if (process.env.MATERIA_HEADLESS === '1' || style === 'off') return noop;
  const splash = new BrowserWindow({width:LUXURY_STYLES.has(style)?760:560,height:LUXURY_STYLES.has(style)?560:440,show:false,frame:false,
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
    if(autoFinish)api.finish(()=>{},()=>{});
  });
  void splash.loadFile(path.join(appRoot,'dist','startup.html'),{query:{style}}).catch(()=>{
    if(!splash.isDestroyed())splash.destroy();
  });
  const api={close,finish(reveal,focus){
    if(finished)return;finished=true;
    if(started===undefined||splash.isDestroyed()){reveal();close();focus();return;}
    delay=setTimeout(()=>{
      if(splash.isDestroyed()){reveal();focus();return;}
      splash.setAlwaysOnTop(true);
      reveal();
      splash.webContents.executeJavaScript("document.documentElement.classList.add('depart')").catch(()=>{});
      fade=setTimeout(()=>{close();focus();},FADE_DURATION[style]);
    },Math.max(WORKSPACE_SETTLE_DURATION,(LUXURY_STYLES.has(style)?LUXURY_SPLASH_DURATION:MIN_SPLASH_DURATION)-(performance.now()-started)));
  }};
  return api;
}

// Settings preview: plays one full cycle without touching the workspace window.
export function previewStartup(appRoot, animation) {
  const style = normalizeStartupAnimation(animation);
  if (style === 'off' || process.env.MATERIA_HEADLESS === '1') return false;
  createStartup(appRoot, style, {autoFinish:true});
  return true;
}
