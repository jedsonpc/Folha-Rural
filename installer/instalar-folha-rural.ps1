$ErrorActionPreference = "Stop"
$target = "D:\App Folha Rural"
$payload = Join-Path $PSScriptRoot "pacote"
$backupBase = "D:\Folha Rural Backups"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $backupBase $stamp
$staging = "D:\App Folha Rural - nova"
$old = "D:\App Folha Rural - anterior-$stamp"

function Stop-WithMessage([string]$message) {
  Write-Host "ERRO: $message" -ForegroundColor Red
  exit 1
}

function Get-DatabaseSize([string]$wranglerPath) {
  if (!(Test-Path $wranglerPath)) { return 0 }
  $files = Get-ChildItem -LiteralPath $wranglerPath -Recurse -Force -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in @(".sqlite", ".db", ".wal") }
  if (!$files) { return 0 }
  return ($files | Measure-Object -Property Length -Sum).Sum
}

function Copy-All([string]$source, [string]$destination) {
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $destination -Recurse -Force
}

Write-Host "Folha Rural - instalacao limpa" -ForegroundColor DarkGreen
Write-Host "Destino: $target"
Write-Host "Os dados existentes serao copiados antes da substituicao."
if ((Read-Host "Digite SIM para continuar") -ne "SIM") { Stop-WithMessage "Instalacao cancelada." }
if (!(Test-Path (Join-Path $payload "package.json"))) { Stop-WithMessage "O pacote do aplicativo nao foi encontrado." }
if (!(Get-Command node -ErrorAction SilentlyContinue)) { Stop-WithMessage "Instale o Node.js LTS 22 ou superior e tente novamente." }
$major = [int](& node -p "process.versions.node.split('.')[0]")
if ($major -lt 22) { Stop-WithMessage "O Node.js precisa ser atualizado para a versao 22 ou superior." }

try { Invoke-WebRequest -Uri "http://127.0.0.1:4173/__local/shutdown" -Method Post -UseBasicParsing -TimeoutSec 3 | Out-Null; Start-Sleep -Seconds 2 } catch { }
New-Item -ItemType Directory -Path $backup -Force | Out-Null
if (Test-Path (Join-Path $target ".wrangler")) {
  Write-Host "Fazendo backup dos dados importados..."
  Copy-Item (Join-Path $target ".wrangler") (Join-Path $backup ".wrangler") -Recurse -Force
  "Backup criado em $(Get-Date) a partir de $target" | Set-Content (Join-Path $backup "LEIA-ME.txt")
} else {
  "Nenhum banco local anterior foi encontrado em $(Get-Date)." | Set-Content (Join-Path $backup "LEIA-ME.txt")
}

$candidates = @()
if (Test-Path $backupBase) {
  Get-ChildItem -LiteralPath $backupBase -Directory -Force | ForEach-Object {
    $candidate = Join-Path $_.FullName ".wrangler"
    $size = Get-DatabaseSize $candidate
    if ($size -gt 0) { $candidates += [PSCustomObject]@{ Path=$candidate; Size=$size; Date=$_.LastWriteTime } }
  }
}
$currentData = Join-Path $target ".wrangler"
$currentSize = Get-DatabaseSize $currentData
if ($currentSize -gt 0) { $candidates += [PSCustomObject]@{ Path=$currentData; Size=$currentSize; Date=(Get-Item $currentData).LastWriteTime } }
$selector = Join-Path $payload "scripts\escolher-banco.mjs"
$dataSource = $null
if (Test-Path $selector) {
  try {
    $selection = (& node $selector $currentData $backupBase 2>$null | Out-String) | ConvertFrom-Json
    if ($selection.selected -and (Test-Path $selection.selected.root)) {
      $selectedPath = [string]$selection.selected.root
      $dataSource = [PSCustomObject]@{ Path=$selectedPath; Size=(Get-DatabaseSize $selectedPath); Date=(Get-Item $selectedPath).LastWriteTime; Users=[int]$selection.selected.users; Rows=[int]$selection.selected.data }
    }
    $authSource = if ($selection.authSource) { [string]$selection.authSource.root } else { $null }
  } catch { Write-Host "A verificacao detalhada dos backups falhou; usando a base atual." -ForegroundColor Yellow }
}
if (!$dataSource -and $currentSize -gt 0) { $dataSource = [PSCustomObject]@{ Path=$currentData; Size=$currentSize; Date=(Get-Item $currentData).LastWriteTime; Users=0; Rows=0 } }
if (!$dataSource) { $dataSource = $candidates | Sort-Object Date -Descending | Select-Object -First 1 }
if ($dataSource) {
  Write-Host "Base preservada: $($dataSource.Path) ($($dataSource.Size) bytes; usuarios: $($dataSource.Users))"
} else {
  Write-Host "Nenhuma base anterior com dados foi encontrada. Sera criada uma base nova." -ForegroundColor Yellow
}

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null
Write-Host "Copiando arquivos novos..."
Get-ChildItem -LiteralPath $payload -Force | Copy-Item -Destination $staging -Recurse -Force
if ($dataSource) { Copy-All $dataSource.Path (Join-Path $staging ".wrangler") }
if ($authSource -and $dataSource -and $authSource -ne $dataSource.Path) {
  try {
    $recovery = (& node (Join-Path $payload "scripts\recuperar-usuarios.mjs") (Join-Path $staging ".wrangler") $authSource 2>$null | Out-String) | ConvertFrom-Json
    if ([int]$recovery.recovered -gt 0) { Write-Host "$($recovery.recovered) usuario(s) local(is) recuperado(s) do backup anterior." -ForegroundColor Green }
  } catch { Write-Host "Nao foi possivel recuperar usuarios de um backup anterior." -ForegroundColor Yellow }
}

Push-Location $staging
try {
  Write-Host "Instalando componentes. Isso pode levar alguns minutos..."
  & npm.cmd ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar os componentes." }
} finally { Pop-Location }

Write-Host "Testando a nova instalacao antes de substituir a anterior..."
$testLog = Join-Path $backup "teste-instalacao.log"
$vite = Join-Path $staging "node_modules\.bin\vite.cmd"
if (!(Test-Path $vite)) { Stop-WithMessage "O Vite nao foi instalado corretamente. A versao anterior nao foi alterada." }
$testProcess = Start-Process -FilePath $vite -ArgumentList @("--host", "127.0.0.1", "--port", "4183") -WorkingDirectory $staging -WindowStyle Hidden -RedirectStandardOutput $testLog -RedirectStandardError (Join-Path $backup "teste-instalacao-erros.log") -PassThru
$ready = $false
for ($attempt = 1; $attempt -le 90; $attempt++) {
  Start-Sleep -Seconds 1
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:4183/" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { $ready = $true; break }
  } catch {
    if ($testProcess.HasExited) { break }
  }
}
if (!$ready) {
  if (!$testProcess.HasExited) { Stop-Process -Id $testProcess.Id -Force -ErrorAction SilentlyContinue }
  Stop-WithMessage "A nova instalacao nao passou no teste. A versao anterior nao foi alterada. Consulte $testLog"
}
try { Invoke-WebRequest -Uri "http://127.0.0.1:4183/__local/shutdown" -Method Post -UseBasicParsing -TimeoutSec 3 | Out-Null } catch { }
Start-Sleep -Seconds 2

if (Test-Path $old) { Remove-Item $old -Recurse -Force }
if (Test-Path $target) { Move-Item $target $old }
try {
  Move-Item $staging $target
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $target "scripts\criar-atalho.ps1")
  if ($LASTEXITCODE -ne 0) { throw "Falha ao criar o atalho." }
  if (Test-Path $old) { Remove-Item $old -Recurse -Force }
} catch {
  if (Test-Path $target) { Remove-Item $target -Recurse -Force }
  if (Test-Path $old) { Move-Item $old $target }
  throw
}

Write-Host ""
Write-Host "Instalacao concluida com sucesso." -ForegroundColor Green
Write-Host "Backup dos dados: $backup"
exit 0
