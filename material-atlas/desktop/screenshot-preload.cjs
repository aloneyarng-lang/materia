const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('materiaScreenshot',{
  receive: callback => {ipcRenderer.once('quick-tip:screenshot-source',(_event, data)=>callback(data));},
  ready: () => ipcRenderer.send('quick-tip:screenshot-overlay','ready'),
  finish: region => ipcRenderer.send('quick-tip:screenshot-overlay','finish',region),
});
