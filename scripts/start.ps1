param([int]$Port = 8000)
$workspaceDir = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $workspaceDir '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw 'Run scripts/setup.ps1 first.'
}
Set-Location -LiteralPath $workspaceDir
& $pythonPath -m uvicorn app.main:app --app-dir services/api --host 127.0.0.1 --port $Port --no-access-log
