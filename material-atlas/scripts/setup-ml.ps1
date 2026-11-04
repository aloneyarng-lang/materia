$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskRuntime = Join-Path $taskRoot '.local/ml-runtime'
$taskArchive = Join-Path $taskRoot '.local/python-3.13.12.zip'
New-Item -ItemType Directory -Force $taskRuntime | Out-Null
if (-not (Test-Path -LiteralPath $taskArchive)) {
    Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.13.12/python-3.13.12-embed-amd64.zip' -OutFile $taskArchive
}
if ((Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash -ne '76f238f606250c87c6beac75dccd35ee99070a13490555936abb6cb64ecce3d0') {
    throw 'Python 官方包 SHA-256 校验失败。'
}
Expand-Archive -LiteralPath $taskArchive -DestinationPath $taskRuntime -Force
Set-Content -LiteralPath (Join-Path $taskRuntime 'python313._pth') -Encoding ascii -Value "python313.zip`n.`nLib/site-packages`nimport site"
python -m pip install --disable-pip-version-check --upgrade --only-binary=:all: --python-version 3.13 --platform win_amd64 --implementation cp --target (Join-Path $taskRuntime 'Lib/site-packages') -r (Join-Path $taskRoot 'ml/requirements.txt')
if ($LASTEXITCODE -ne 0) { throw '机器学习依赖安装失败。' }
'{"action":"status"}' | & (Join-Path $taskRuntime 'python.exe') -I -X utf8 (Join-Path $taskRoot 'ml/engine.py')
if ($LASTEXITCODE -ne 0) { throw '机器学习运行环境验证失败。' }
