import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {WINDOWS_APP_ID,windowsAppDetails} from '../desktop/windows-identity.mjs';

test('source pin relaunches the branded launcher, including paths with spaces',()=>{
  const root=path.resolve('workspace with spaces/material-atlas');
  const details=windowsAppDetails(root,'electron.exe',false,()=>true);
  assert.equal(details.appId,WINDOWS_APP_ID);
  assert.equal(details.relaunchDisplayName,'Materia');
  assert.equal(details.relaunchCommand,`"${path.resolve(root,'../Materia.exe')}"`);
  assert.equal(details.appIconPath,path.join(root,'desktop/materia.ico'));
});
test('unbuilt source retains its app argument; packaged app relaunches itself',()=>{
  const root=path.resolve('source');
  assert.equal(windowsAppDetails(root,'electron.exe',false,()=>false).relaunchCommand,`"electron.exe" "${root}"`);
  assert.equal(windowsAppDetails(root,'Materia.exe',true,()=>true).relaunchCommand,'"Materia.exe"');
});
