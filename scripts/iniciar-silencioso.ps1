$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
$logPath = Join-Path $logDir "inicializacao.log"
$starter = Join-Path $root "INICIAR-FOLHA-RURAL.bat"
$url = "http://127.0.0.1:4173/"

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
"Folha Rural - inicio em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Set-Content -Path $logPath -Encoding UTF8

try {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200) { Start-Process $url; exit 0 }
  } catch { }

  $arguments = '/d /c ""' + $starter + '" >> "' + $logPath + '" 2>&1"'
  $process = Start-Process -FilePath $env:ComSpec -ArgumentList $arguments -WindowStyle Hidden -PassThru
  for ($attempt = 1; $attempt -le 120; $attempt++) {
    Start-Sleep -Milliseconds 750
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Start-Process $url
        exit 0
      }
    } catch {
      if ($process.HasExited) { throw "O servidor encerrou antes de ficar pronto. Codigo: $($process.ExitCode)." }
    }
  }
  throw "O servidor nao respondeu dentro do tempo esperado."
} catch {
  $_ | Out-String | Add-Content -Path $logPath -Encoding UTF8
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(
    "O Folha Rural nao conseguiu iniciar. Execute TESTAR-FOLHA-RURAL.bat para ver o diagnostico ou consulte logs\inicializacao.log.",
    "Folha Rural - Falha ao iniciar",
    "OK",
    "Error"
  ) | Out-Null
}
