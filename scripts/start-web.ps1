param([switch]$SkipBuild)
$workspaceDir = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspaceDir
$bundledNodeDir = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin'
$bundledPnpm = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
if (Test-Path -LiteralPath $bundledNodeDir) { $env:PATH = "$bundledNodeDir;$env:PATH" }
$pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
if ($pnpmCommand) { $projectPnpm = $pnpmCommand.Source }
elseif (Test-Path -LiteralPath $bundledPnpm) { $projectPnpm = $bundledPnpm }
else { throw 'Install Node.js 22+ and pnpm, then run this script again.' }
if (-not (Test-Path -LiteralPath 'apps/web/node_modules/next')) {
    & $projectPnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
}
if (-not $SkipBuild) {
    & $projectPnpm --filter @careerquest/web build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend production build failed.' }
}
& $projectPnpm --filter @careerquest/web start
