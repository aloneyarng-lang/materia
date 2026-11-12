$taskAppRoot = Split-Path -Parent $PSScriptRoot
$taskElectron = Join-Path $taskAppRoot 'node_modules\electron\dist\electron.exe'
if (!(Test-Path -LiteralPath $taskElectron)) { throw 'Electron runtime is missing. Run npm install in material-atlas.' }
$env:MATERIA_PROFILE_DIR = Join-Path $env:APPDATA 'Materia'
Start-Process -FilePath $taskElectron -ArgumentList ('"' + $taskAppRoot + '"') -WorkingDirectory $taskAppRoot -WindowStyle Normal

