$ErrorActionPreference = "SilentlyContinue"
$url = "http://127.0.0.1:4173/"

for ($attempt = 1; $attempt -le 90; $attempt++) {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      Start-Process $url
      exit 0
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show(
  "O Folha Rural nao conseguiu iniciar em 90 segundos. Consulte o arquivo logs\inicializacao.log na pasta do aplicativo e execute INSTALAR.bat novamente.",
  "Folha Rural - Falha ao iniciar",
  "OK",
  "Error"
) | Out-Null
exit 1
