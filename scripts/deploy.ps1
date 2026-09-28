# Production deploy/update on the server (Windows). Run from the repository root:
#   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
# Linux: the same steps work in bash (see docs/deployment.md).
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Step($name, [scriptblock]$cmd) {
  Write-Host "==> $name"
  & $cmd
  if ($LASTEXITCODE -ne 0) { throw "$name failed (exit $LASTEXITCODE)" }
}

Step 'Install database tooling' { npm ci --prefix database --no-fund --no-audit }
Step 'Install backend'          { npm ci --prefix backend --no-fund --no-audit }
Step 'Build backend'            { npm run --prefix backend build }
Step 'Run migrations'           { npm run --prefix backend db:migrate }
Step 'Install frontend'         { npm ci --prefix frontend --no-fund --no-audit }
Step 'Build frontend'           { npm run --prefix frontend build }
Step 'Start/reload PM2'         { pm2 startOrReload ecosystem.config.cjs --update-env }
Step 'Save PM2 process list'    { pm2 save }

Write-Host 'Deployed. Check: pm2 status  |  curl http://localhost:3000/health'
