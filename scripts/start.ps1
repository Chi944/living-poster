$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24 or newer, then run this script again.' }
$livingPosterNodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($livingPosterNodeMajor -lt 24) { throw 'Living Poster requires Node.js 24 or newer.' }
if (-not (Test-Path -LiteralPath 'node_modules')) { & npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' } }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed. Review the error above.' }
Write-Host 'Open http://127.0.0.1:4317 after the server starts. Press Ctrl+C to stop.'
& npm.cmd start
