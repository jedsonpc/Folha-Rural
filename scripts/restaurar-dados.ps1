$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backupBase = "D:\Folha Rural Backups"
$current = Join-Path $root ".wrangler"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$safety = Join-Path $backupBase "antes-restauracao-$stamp"

function Size-Of([string]$path) {
  if (!(Test-Path $path)) { return 0 }
  $files = Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in @(".sqlite", ".db", ".wal") }
  if (!$files) { return 0 }
  return ($files | Measure-Object Length -Sum).Sum
}
function Copy-All([string]$source,[string]$destination) {
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $destination -Recurse -Force
}

try { Invoke-WebRequest -Uri "http://127.0.0.1:4173/__local/shutdown" -Method Post -UseBasicParsing -TimeoutSec 3 | Out-Null; Start-Sleep -Seconds 2 } catch { }
if (!(Test-Path $backupBase)) { throw "A pasta de backups nao foi encontrada." }
$choices = Get-ChildItem -LiteralPath $backupBase -Directory -Force | ForEach-Object {
  $path = Join-Path $_.FullName ".wrangler"; $size = Size-Of $path
  if ($size -gt 0) { [PSCustomObject]@{Path=$path;Size=$size;Date=$_.LastWriteTime} }
} | Sort-Object Size,Date -Descending
$source = $choices | Select-Object -First 1
if (!$source) { throw "Nenhum banco de dados foi encontrado nos backups." }
Write-Host "Restaurando a maior base encontrada: $($source.Path)" -ForegroundColor DarkGreen
if (Test-Path $current) { Copy-All $current (Join-Path $safety ".wrangler") }
$temporary = Join-Path $root ".wrangler-restauracao"
if (Test-Path $temporary) { Remove-Item $temporary -Recurse -Force }
Copy-All $source.Path $temporary
if (Test-Path $current) { Remove-Item $current -Recurse -Force }
Move-Item $temporary $current
Write-Host "Dados restaurados. Copia de seguranca anterior: $safety" -ForegroundColor Green
