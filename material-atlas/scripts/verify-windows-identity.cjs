const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {_electron,chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

(async()=>{
  const root=path.resolve(__dirname,'..'),workspace=path.dirname(root),output=path.join(root,'.local/windows-identity-verification');
  await fs.mkdir(output,{recursive:true});
  const run=await fs.mkdtemp(path.join(output,'run-')),profile=path.join(run,'profile'),library=path.join(run,'library');
  const catalog=path.join(workspace,'文献库/library.json');
  const hash=async()=>crypto.createHash('sha256').update(await fs.readFile(catalog)).digest('hex');
  const before=await hash();
  const env={...process.env,MATERIA_HEADLESS:'1',MATERIA_PROFILE_DIR:profile,MATERIA_LIBRARY_DIR:library};delete env.ELECTRON_RUN_AS_NODE;
  let electron,browser;
  try {
    electron=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root],env,timeout:30000});
    const page=await electron.firstWindow();
    await page.waitForFunction(()=>document.querySelector('.import-main')?.disabled===false);
    const identity=await electron.evaluate(({app,BrowserWindow,shell},shortcutPath)=>({
      name:app.getName(),profile:app.getPath('userData'),hidden:BrowserWindow.getAllWindows().every(w=>!w.isVisible()),
      shortcut:shell.readShortcutLink(shortcutPath),
    }),path.join(workspace,'Materia.lnk'));
    assert.equal(identity.name,'Materia');assert.equal(identity.profile,profile);assert.equal(identity.hidden,true);
    assert.equal(identity.shortcut.appUserModelId,'com.materia.desktop');
    assert.equal(identity.shortcut.target,path.join(workspace,'Materia.exe'));
    assert.equal(identity.shortcut.icon,path.join(root,'desktop/materia.ico'));
    await electron.close();electron=null;
    const check=spawn(path.join(workspace,'Materia.exe'),['--check-install'],{env,windowsHide:true,stdio:'ignore'});
    assert.equal(await new Promise(resolve=>check.on('exit',resolve)),0);
    assert.equal(await hash(),before);
    const report={passed:true,name:identity.name,appId:identity.shortcut.appUserModelId,shortcut:identity.shortcut.target,brandedLauncherInstallCheck:true,isolatedLibrary:true,userLibraryUnchanged:true};
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  } finally {
    await electron?.close();
    if(browser){const session=await browser.newBrowserCDPSession();await session.send('Browser.close').catch(()=>{});await browser.close();}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
