// Run with Electron after building the root launcher; does not open the library.
const {app,shell}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path');
const {pathToFileURL}=require('node:url');
app.setPath('userData',path.resolve(__dirname,'../.local/shortcut-profile'));
app.whenReady().then(async()=>{
  const root=path.resolve(__dirname,'..'),folder=path.dirname(root);
  const {WINDOWS_APP_ID}=await import(pathToFileURL(path.join(root,'desktop/windows-identity.mjs')).href);
  const shortcut=path.join(folder,'Materia.lnk'),target=path.join(folder,'Materia.exe');
  await fs.access(target);
  try {
    await fs.access(shortcut);
    const backup=path.join(root,'.local','shortcut-backups');await fs.mkdir(backup,{recursive:true});
    await fs.copyFile(shortcut,path.join(backup,`Materia-${Date.now()}.lnk`));
  } catch(e){if(e.code!=='ENOENT')throw e;}
  const details={target,cwd:folder,args:'',description:'Materia · 材料文献星图',icon:path.join(root,'desktop/materia.ico'),iconIndex:0,appUserModelId:WINDOWS_APP_ID};
  if(!shell.writeShortcutLink(shortcut,'create',details))throw Error('Could not write Materia shortcut');
  const saved=shell.readShortcutLink(shortcut);
  for(const [key,value] of Object.entries(details))if(saved[key]!==value)throw Error(`Shortcut verification failed: ${key}`);
  console.log(JSON.stringify({shortcut,...saved}));app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
