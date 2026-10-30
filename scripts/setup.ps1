$workspaceDir = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspaceDir
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
    py -3.11 -m venv .venv
}
& '.\.venv\Scripts\python.exe' -m pip install -r services/api/requirements.lock.txt
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& '.\.venv\Scripts\python.exe' data-ingestion/pipeline.py init
if (-not (Test-Path -LiteralPath 'data/staging/supplied-dump/manifest.json')) {
    & '.\.venv\Scripts\python.exe' data-ingestion/pipeline.py stage
    if ($LASTEXITCODE -ne 0) { throw 'Data staging failed.' }
}
& '.\.venv\Scripts\python.exe' data-ingestion/pipeline.py migrate-supplied
if ($LASTEXITCODE -ne 0) { throw 'Data migration failed.' }
Write-Output 'Ready. Run scripts/start.ps1 and open http://127.0.0.1:8000/docs.'
