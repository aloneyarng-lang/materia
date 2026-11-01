@echo off
setlocal
if exist "%~dp0material-atlas\release\current\Materia-win32-x64\Materia.exe" (
  start "" /D "%~dp0material-atlas\release\current\Materia-win32-x64" "%~dp0material-atlas\release\current\Materia-win32-x64\Materia.exe"
  exit /b 0
)
if exist "%~dp0material-atlas\release\Materia-win32-x64\Materia.exe" (
  start "" /D "%~dp0material-atlas\release\Materia-win32-x64" "%~dp0material-atlas\release\Materia-win32-x64\Materia.exe"
  exit /b 0
)
if exist "%~dp0Materia-win32-x64\Materia.exe" (
  start "" /D "%~dp0Materia-win32-x64" "%~dp0Materia-win32-x64\Materia.exe"
  exit /b 0
)
if exist "%~dp0..\Materia-win32-x64\Materia.exe" (
  start "" /D "%~dp0..\Materia-win32-x64" "%~dp0..\Materia-win32-x64\Materia.exe"
  exit /b 0
)
echo Materia program not found. Run npm run deploy:local in material-atlas first.
pause
exit /b 1
