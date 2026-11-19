$taskAppRoot = Split-Path -Parent $PSScriptRoot
$taskElectron = Join-Path $taskAppRoot 'node_modules\electron\dist\electron.exe'
$taskLauncher = Join-Path (Split-Path -Parent $taskAppRoot) 'Materia.exe'
if (!(Test-Path -LiteralPath $taskElectron)) { throw 'Electron runtime is missing. Run npm install in material-atlas.' }
$env:MATERIA_PROFILE_DIR = Join-Path $env:APPDATA 'Materia'
if (Test-Path -LiteralPath $taskLauncher) {
    Start-Process -FilePath $taskLauncher -WorkingDirectory (Split-Path -Parent $taskAppRoot) -WindowStyle Hidden
} else {
    Start-Process -FilePath $taskElectron -ArgumentList ('"' + $taskAppRoot + '"') -WorkingDirectory $taskAppRoot -WindowStyle Hidden
}

