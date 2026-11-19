import path from 'node:path';
import {existsSync} from 'node:fs';

export const WINDOWS_APP_ID = 'com.materia.desktop';
export const WINDOWS_APP_NAME = 'Materia';

export function windowsAppDetails(appRoot, executable, isPackaged, exists = existsSync) {
  const launcher = path.resolve(appRoot, '..', 'Materia.exe');
  // Development uses the same branded entry point as its desktop shortcut.
  const target = !isPackaged && exists(launcher) ? launcher : executable;
  const command = `"${target}"${!isPackaged && target === executable ? ` "${appRoot}"` : ''}`;
  return {
    appId: WINDOWS_APP_ID,
    appIconPath: path.join(appRoot, 'desktop', 'materia.ico'),
    appIconIndex: 0,
    relaunchCommand: command,
    relaunchDisplayName: WINDOWS_APP_NAME,
  };
}
