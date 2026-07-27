$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Folha Rural.lnk"
$targetPath = Join-Path $env:WINDIR "System32\wscript.exe"
$launcherPath = Join-Path $root "scripts\abrir-folha-rural.vbs"
$iconPath = Join-Path $root "public\folha-rural.ico"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.Arguments = '"' + $launcherPath + '"'
$shortcut.WorkingDirectory = $root
$shortcut.Description = "Abrir o sistema Folha Rural"
if (Test-Path $iconPath) {
  $shortcut.IconLocation = $iconPath
}
$shortcut.Save()
