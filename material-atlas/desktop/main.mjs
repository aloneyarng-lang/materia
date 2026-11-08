import {CanvasFile} from './canvases.mjs';
import { app, BrowserWindow, ipcMain, dialog, shell, Menu, safeStorage, protocol } from 'electron';
import {createStartup} from './startup.mjs';
import {DesktopModuleServices} from './module-services.mjs';
import {DESKTOP_MODULES} from './modules/index.mjs';
import {MachineLearningEngine} from './ml-engine.mjs';
import { mkdir, readFile, writeFile, copyFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareLibraryLocation,portableLibraryRoot } from './library-location.mjs';
import { LocalLibrary } from './library.mjs';
import { AgentSettings, completeWithProvider,testAgentConnection,listAgentModels } from './agent.mjs';
import {AntigravityChatLinks,inspectAntigravity,findAntigravity,createAntigravityCompletion} from './agent-antigravity.mjs';
import { runResearchAgent } from '../dist/ai-agent-core.js';
import { AgentHistoryFile } from './agent-history.mjs';
import { translateText } from './translation.mjs';
import {t,setLocale,normalizeLocale} from '../dist/i18n.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
protocol.registerSchemesAsPrivileged([{scheme:'materia-figure', privileges:{standard:true, secure:true, supportFetchAPI:true}}]);
app.commandLine.appendSwitch('force-renderer-accessibility');
const profile = process.env.MATERIA_PROFILE_DIR || (app.isPackaged ? app.getPath('userData') : path.join(appRoot, '.local', 'desktop-profile'));
app.setPath('userData', profile);
let mainWindow, library, agentHistory, canvasStore, moduleServices, startup;
const mlEngine=new MachineLearningEngine({onProgress:progress=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('ml:progress',progress);}});
let preferenceQueue=Promise.resolve();
function observeLibrary(store){store.onFolderChange=result=>{if(store===library&&mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('library:changed',{path:store.root,...result});};return store;}
let canvasCloseReady=false,canvasAllowClose=false;
let agentRun = null,connectionTest=null,modelDiscovery=null;
const translationRuns=new Map();
function cancelTranslations(){for(const controller of translationRuns.values())controller.abort();connectionTest?.abort();modelDiscovery?.abort();}
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(start).catch(error => { dialog.showErrorBox('Materia 无法启动', error.message); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
let quitPending=false;
app.on('before-quit',event=>{
  if(!agentHistory||quitPending)return;
  event.preventDefault();quitPending=true;agentRun?.controller.abort();cancelTranslations();mlEngine.cancelAll();
  Promise.allSettled([agentHistory.queue,library.queue,canvasStore?.queue,moduleServices?.flush(),preferenceQueue]).then(()=>app.quit());
});

async function start() {
  startup = await createStartup(appRoot);
  await mkdir(profile, { recursive: true });
  const agentSettings = new AgentSettings(profile, safeStorage);
  const antigravityChats = new AntigravityChatLinks(profile);
  await agentSettings.load().catch(() => {});
  let config = {};
  try { config = JSON.parse(await readFile(path.join(profile, 'preferences.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await setLocale(config.locale,{persist:false});
  const savePreferences=patch=>{
    const operation=preferenceQueue.then(async()=>{
      const next={...config,...patch};
      const target=path.join(profile,'preferences.json');
      await writeFile(target+'.tmp',JSON.stringify(next,null,2));await rename(target+'.tmp',target);config=next;
    });
    preferenceQueue=operation.catch(()=>{});return operation;
  };
  const defaultRoot = process.env.MATERIA_LIBRARY_DIR || portableLibraryRoot(appRoot,path.dirname(app.getPath('exe')));
  const previousRoot = app.isPackaged ? path.resolve(path.dirname(app.getPath('exe')), '..', '..', 'Materia-win32-x64', '文献库') : '';
  const legacyRoots=[previousRoot,path.join(path.dirname(app.getPath('exe')),'文献库'),path.resolve(appRoot,'../../../../Materia-win32-x64/文献库'),path.join(appRoot,'.local','desktop-library')];
  const startupRoot = await prepareLibraryLocation({envRoot:process.env.MATERIA_LIBRARY_DIR,configuredRoot:config.libraryPath,legacyRoots,defaultRoot});
  library = await new LocalLibrary(startupRoot).init();
  observeLibrary(library);
  agentHistory = new AgentHistoryFile(library.root);
  canvasStore=new CanvasFile(library.root);
  moduleServices=new DesktopModuleServices(DESKTOP_MODULES,library.root);
  await savePreferences({libraryPath:library.root});
  mainWindow = new BrowserWindow({ show: false, width: 1440, height: 980, minWidth: 1000, minHeight: 700, title: t('Materia · 材料文献星图'), backgroundColor: '#f7f7f2', autoHideMenuBar: true, webPreferences: { preload: path.join(appRoot, 'desktop', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  const revealMain=()=>{if(!mainWindow.isDestroyed()&&process.env.MATERIA_HEADLESS!=='1'){mainWindow.show();mainWindow.focus();}};
  // Reveal initialization errors too, rather than trapping the user behind a loader.
  const startupTimeout=setTimeout(()=>startup.finish(revealMain),15000);
  mainWindow.once('closed',()=>{clearTimeout(startupTimeout);startup.close();});
  mainWindow.webContents.once('did-fail-load',()=>{clearTimeout(startupTimeout);startup.finish(revealMain);});
  mainWindow.webContents.on('render-process-gone',()=>{canvasCloseReady=false;mlEngine.cancelAll();});
  Menu.setApplicationMenu(null);
  mainWindow.on('close',event=>{if(canvasCloseReady&&!canvasAllowClose){event.preventDefault();mainWindow.webContents.send('canvas:prepare-close');}});
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (url !== mainWindow.webContents.getURL()) event.preventDefault(); });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('不受支持的请求来源。');
    return fn(...args);
  });
  handle('canvas:get',async()=>{const store=canvasStore;return{libraryKey:store.root,state:await store.load()};});
  handle('startup:ready',()=>{clearTimeout(startupTimeout);startup.finish(revealMain);return true;});
  moduleServices.register(handle);
  let figura;
  handle('figura:call', async ({action, payload, libraryKey}) => {
    figura ??= import('./figura/service.mjs').then(({createFigureService}) => createFigureService({
      appRoot,getRoot:()=>library.root,imageRoot:path.join(path.dirname(defaultRoot),'图片库'),window:mainWindow,
    }));
    return (await figura)(action, payload, libraryKey);
  });
  handle('ml:status',()=>mlEngine.run('status'));
  handle('ml:run',async({id,action,libraryKey,...payload})=>{
    if(libraryKey!==library.root)throw Error('文献库已切换，请重新打开模型页面。');
    if(!['train','predict'].includes(action))throw Error('不支持的机器学习操作。');
    const result=await mlEngine.run(action,payload,id);
    if(libraryKey!==library.root)throw Error('文献库已切换，训练结果未写入其他文献库。');
    return result;
  });
  handle('ml:cancel',id=>mlEngine.cancel(id));
  handle('canvas:save',payload=>{if(!payload||payload.libraryKey!==canvasStore.root)throw Error('文献库已切换，画布未写入其他文献库。');return canvasStore.save(payload.state);});
  handle('canvas:request-close',()=>{mainWindow.close();return true;});
  handle('canvas:ready',()=>{canvasCloseReady=true;return true;});
  handle('canvas:confirm-close',async()=>{await canvasStore.queue;canvasAllowClose=true;mainWindow.close();return true;});
  handle('preferences:get-locale',()=>normalizeLocale(config.locale));
  handle('preferences:set-locale',async value=>{
    if(normalizeLocale(value)!==value)throw Error('Invalid interface language.');
    await savePreferences({locale:value});await setLocale(value,{persist:false});return value;
  });
  handle('library:get-papers', () => library.getPapers());
  handle('library:put-papers', papers => library.putPapers(papers));
  handle('library:delete-paper', id => library.deletePaper(id));
  handle('library:delete-papers', ids => library.deletePapers(ids));
  handle('library:bulk-edit', (ids, options) => library.bulkEdit(ids, options));
  handle('library:set-reading-status',(ids,status)=>library.setReadingStatus(ids,status));
  handle('library:restore-papers', id => library.restorePapers(id));
  handle('library:get-setting', key => library.getSetting(key));
  handle('library:set-setting', (key, value) => library.setSetting(key, value));
  handle('library:merge-backup', backup => library.mergeBackup(backup));
  handle('library:read-pdf', id => library.readPdf(id));
  handle('library:info', async () => ({...await library.info(),appVersion:app.getVersion()}));
  handle('library:sync-folders',()=>library.syncFolders());
  handle('library:open-paper-folder',async id=>{const file=await library.pdfPath(id);shell.showItemInFolder(file);});
  handle('library:open-group-folder',async id=>{const relative=library.data.settings.folderSync?.paths?.[id];if(!relative)throw Error('分组不存在。');const folder=path.resolve(library.root,'papers',relative);if(!folder.startsWith(path.resolve(library.root,'papers')+path.sep))throw Error('分组路径无效。');const result=await shell.openPath(folder);if(result)throw Error(result);});
  handle('study:read',async()=>{const store=library;await store.queue;return{libraryKey:store.root,...store.getStudy()};});
  handle('study:update',payload=>{if(!payload||payload.libraryKey!==library.root)throw new Error('文献库已切换，阅读记录未写入其他文献库。');return library.updateStudy(payload.operation);});
  handle('translation:cancel',id=>translationRuns.get(id)?.abort());
  handle('translation:run',async payload=>{
    if(!payload||typeof payload.id!=='string'||!/^[a-z\d_-]{1,120}$/i.test(payload.id)||translationRuns.has(payload.id))throw new Error('翻译请求标识无效。');
    if(translationRuns.size>=3)throw new Error('翻译请求过多，请等待或停止当前翻译。');
    if(!agentSettings.config?.model&&agentSettings.config?.connection!=='antigravity')throw new Error('请先在 AI 研究助手中保存服务地址和模型。');
    const controller=new AbortController();translationRuns.set(payload.id,controller);
    try{return await translateText({...agentSettings.config},payload.request,{signal:controller.signal});}
    catch(error){return{error:controller.signal.aborted?'翻译已停止。':error.message,canceled:controller.signal.aborted};}
    finally{translationRuns.delete(payload.id);}
  });
  const publicAgentConfig=()=>({...agentSettings.publicConfig(),appVersion:app.getVersion()});
  handle('agent:get-config', publicAgentConfig);
  handle('agent:get-history', async () => { const store=agentHistory;await store.queue;return {libraryKey:store.root,state:await store.load()}; });
  handle('agent:save-history', payload => {
    if(!payload||payload.libraryKey!==agentHistory.root)throw new Error('文献库已切换，历史记录未写入其他文献库。');
    return agentHistory.save(payload.state);
  });
  handle('agent:open-link', async value => {
    if (typeof value !== 'string' || value.length > 8000) throw new Error('链接格式无效。');
    const url = new URL(value);
    if (!['https:','http:'].includes(url.protocol)) throw new Error('只支持网页链接。');
    await shell.openExternal(url.href);
  });
  handle('agent:save-config', async value => {if(value?.connection==='antigravity'){const checked=await inspectAntigravity(value);if(value.model&&!checked.models.some(model=>model.id===value.model))throw Error('所选反重力模型已不可用，请重新检测并选择。');value={...value,clientPath:checked.clientPath};}await agentSettings.save(value);return publicAgentConfig();});
  handle('agent:detect-antigravity',async value=>{
    modelDiscovery?.abort();const controller=new AbortController();modelDiscovery=controller;
    try{return await inspectAntigravity(value||{},{signal:controller.signal});}
    finally{if(modelDiscovery===controller)modelDiscovery=null;}
  });
  handle('agent:choose-antigravity',async()=>{
    const chosen=await dialog.showOpenDialog(mainWindow,{title:'选择反重力桌面客户端',properties:['openFile'],filters:[{name:'Antigravity.exe',extensions:['exe']}]});
    return chosen.canceled?null:{clientPath:await findAntigravity(chosen.filePaths[0]),message:'程序已选择，请启动反重力并登录，然后检测客户端。'};
  });
  handle('agent:open-antigravity',async value=>{const clientPath=await findAntigravity(value?.clientPath);const error=await shell.openPath(clientPath);if(error)throw Error('反重力未能启动，请手动打开。');return{clientPath,message:'已启动反重力，请完成登录后点击“检测客户端”。'};});
  handle('agent:test-antigravity',async value=>{
    if(connectionTest)throw Error('正在检测连接，请稍候。');const controller=new AbortController();connectionTest=controller;
    try{const result=await completeWithProvider({...value,connection:'antigravity'},{messages:[{role:'system',content:'仅回答“连接成功”，不使用工具。'},{role:'user',content:'测试连接'}],signal:controller.signal});return{ok:true,message:result.content};}
    finally{if(connectionTest===controller)connectionTest=null;}
  });
  handle('agent:test-connection',async value=>{
    if(connectionTest)throw new Error('正在检测连接，请稍候。');const controller=new AbortController();connectionTest=controller;
    try{await agentSettings.queue;return await testAgentConnection(value?agentSettings.resolve(value):agentSettings.config||{},{signal:controller.signal});}
    finally{if(connectionTest===controller)connectionTest=null;}
  });
  handle('agent:cancel-models',()=>{modelDiscovery?.abort();connectionTest?.abort();});
  handle('agent:list-models',async value=>{
    modelDiscovery?.abort();const controller=new AbortController();modelDiscovery=controller;
    try{await agentSettings.queue;return await listAgentModels(agentSettings.resolve(value||{},{requireModel:false}),{signal:controller.signal});}
    finally{if(modelDiscovery===controller)modelDiscovery=null;}
  });
  handle('agent:cancel', id => { if (agentRun?.id === id) agentRun.controller.abort(); });
  handle('agent:run', async payload => {
    if (agentRun) throw new Error('请先停止当前回答。');
    if (!payload || typeof payload.id !== 'string' || payload.id.length > 100) throw new Error('请求格式无效。');
    if (!agentSettings.config) throw new Error('请先配置 AI 服务。');
    const controller = new AbortController(), config = { ...agentSettings.config };
    const runSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(300000)]);
    const current = { id: payload.id, controller }; agentRun = current;
    try {
      const context = { papers: structuredClone(library.getPapers()), notes: structuredClone(library.getSetting('notes') || {}), scopeIds: payload.scopeIds ?? null };
      const complete=config.connection==='antigravity'
        ? createAntigravityCompletion(config,await antigravityChats.forChat(library.root,payload.chatId,config,context.scopeIds))
        : input=>completeWithProvider(config,input);
      return await runResearchAgent({ question: payload.question, character:payload.character, history: payload.history, context,
        signal: runSignal,
        complete,
        onProgress: progress => { if (!mainWindow.isDestroyed()) mainWindow.webContents.send('agent:progress', { id: payload.id, ...progress }); },
      });
    } catch (error) {
      return { error: controller.signal.aborted ? '已停止生成。' : runSignal.aborted ? '本次研究已超时，请缩小范围后重试。' : (error.message || 'AI 请求失败，请重试。'), canceled: controller.signal.aborted };
    } finally { if (agentRun === current) agentRun = null; }
  });
  mainWindow.on('closed', () => {agentRun?.controller.abort();cancelTranslations();});
  handle('library:open-pdf', async id => { const result = await shell.openPath(await library.pdfPath(id)); if (result) throw new Error(result); });
  handle('library:save-pdf', async id => {
    const p = library.data.papers.find(p => p.id === id); if (!p) throw new Error('找不到文献。');
    const chosen = await dialog.showSaveDialog(mainWindow, { title: t('另存 PDF'), defaultPath: p.filename, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!chosen.canceled) await copyFile(await library.pdfPath(id), chosen.filePath);
    return { canceled: chosen.canceled };
  });
  handle('library:open-folder', async () => { const result = await shell.openPath(library.root); if (result) throw new Error(result); });
  handle('library:choose-folder', async () => {
    const chosen = await dialog.showOpenDialog(mainWindow, { title: t('选择或新建文献库文件夹'), defaultPath: library.root, properties: ['openDirectory', 'createDirectory'] });
    if (chosen.canceled) return null;
    agentRun?.controller.abort();
    cancelTranslations();
    await library.queue;
    await agentHistory.queue;
    const next = await new LocalLibrary(chosen.filePaths[0]).init();
    await savePreferences({libraryPath:next.root});
    await canvasStore.queue;mlEngine.cancelAll();await moduleServices.changeLibrary(next.root);library = observeLibrary(next); agentHistory = new AgentHistoryFile(library.root);canvasStore=new CanvasFile(library.root);return library.info();
  });
  handle('library:save-backup', async json => {
    if (typeof json !== 'string' || json.length > 1024 * 1024 * 1024) throw new Error('备份内容过大。');
    const chosen = await dialog.showSaveDialog(mainWindow, { title: t('导出完整文献备份'), defaultPath: path.join(library.root, 'backups', `materia-backup-${new Date().toISOString().slice(0, 10)}.json`), filters: [{ name: t('Materia 备份'), extensions: ['json'] }] });
    if (chosen.canceled) return { canceled: true };
    await writeFile(chosen.filePath, json, 'utf8'); return { canceled: false, path: chosen.filePath };
  });
  handle('library:save-text', async ({ filename, content, type }) => {
    if (!['json', 'csv', 'md', 'svg', 'css'].includes(type) || typeof content !== 'string' || Buffer.byteLength(content,'utf8') > (type==='json'?512:30) * 1024 * 1024) throw new Error('导出格式不正确或文件超过大小限制。');
    const chosen = await dialog.showSaveDialog(mainWindow, { title: t('保存导出文件'), defaultPath: path.basename(filename), filters: [{ name: type.toUpperCase(), extensions: [type] }] });
    if (!chosen.canceled) await writeFile(chosen.filePath, content, 'utf8');
    return { canceled: chosen.canceled };
  });
  handle('library:save-image', async ({filename,bytes,type}) => {
    const image = Buffer.from(bytes || []);
    if (type !== 'png' || image.length > 128 * 1024 * 1024 || image.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error('图像格式不正确。');
    const chosen = await dialog.showSaveDialog(mainWindow,{title:'保存性能对比图',defaultPath:path.basename(filename),filters:[{name:'PNG 图像',extensions:['png']}]});
    if (!chosen.canceled) await writeFile(chosen.filePath,image);
    return {canceled:chosen.canceled,path:chosen.filePath};
  });
  let folderSyncBusy=false;
  const syncFolders=async()=>{if(folderSyncBusy||mainWindow.isDestroyed())return;folderSyncBusy=true;try{await library.syncFolders();}catch(error){console.error('文献文件夹同步：',error.message);}finally{folderSyncBusy=false;}};
  setInterval(syncFolders,4000).unref();mainWindow.on('focus',syncFolders);
  await mainWindow.loadFile(path.join(appRoot, 'dist', 'index.html'));
}
