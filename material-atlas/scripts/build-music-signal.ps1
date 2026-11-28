$ErrorActionPreference = 'Stop'
$vendor = (Resolve-Path (Join-Path $PSScriptRoot '../../vendor')).Path
Push-Location $vendor
try {
  & npm.cmd ci --legacy-peer-deps --no-audit --no-fund
  if ($LASTEXITCODE) { throw 'Signal dependency installation failed.' }
  Push-Location 'signal-main/app'
  try {
    & (Join-Path $vendor 'node_modules/.bin/vite.cmd') build --config vite.materia.config.mts
    if ($LASTEXITCODE) { throw 'Signal renderer build failed.' }
  } finally { Pop-Location }
} finally { Pop-Location }
