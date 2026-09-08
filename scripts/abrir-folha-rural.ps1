$ErrorActionPreference = "Stop"

$appDirectory = "D:\App Folha Rural"
$url = "http://127.0.0.1:3000/?v=1.4.57"
$logDirectory = Join-Path $appDirectory "logs"
$stdoutLog = Join-Path $logDirectory "atalho-servidor.log"
$stderrLog = Join-Path $logDirectory "atalho-servidor-erro.log"

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

$listening = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue
if (-not $listening) {
  Start-Process `
    -FilePath "C:\Windows\System32\cmd.exe" `
    -ArgumentList "/c", "npm.cmd start" `
    -WorkingDirectory $appDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog

  foreach ($attempt in 1..30) {
    Start-Sleep -Milliseconds 500
    if (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue) {
      break
    }
  }
}

Start-Process $url
