# Crea los accesos directos de Shutoki que compilan los cambios nuevos antes de abrir:
#   - Escritorio:  "Shutoki"
#   - Inicio de Windows (opcional, -Startup): arranca con el equipo, en la bandeja
# Uso:  powershell -ExecutionPolicy Bypass -File tools\install-launcher.ps1 [-Startup] [-Remove]
param([switch]$Startup, [switch]$Remove)

$root = Split-Path $PSScriptRoot -Parent
$launch = Join-Path $PSScriptRoot 'launch.ps1'
$icon = Join-Path $root 'resources\icon.ico'
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Shutoki.lnk'
$startupLnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Shutoki.lnk'

if ($Remove) {
  Remove-Item $desktop, $startupLnk -ErrorAction SilentlyContinue
  Write-Host 'Accesos directos eliminados.'
  exit 0
}

function New-Link([string]$path, [string]$extra) {
  $sh = New-Object -ComObject WScript.Shell
  $l = $sh.CreateShortcut($path)
  $l.TargetPath = (Get-Command powershell.exe).Source
  $l.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launch`" $extra"
  $l.WorkingDirectory = $root
  $l.WindowStyle = 7 # minimizada
  if (Test-Path $icon) { $l.IconLocation = $icon }
  $l.Description = 'Shutoki (compila los cambios nuevos y abre)'
  $l.Save()
  Write-Host "Creado: $path"
}

New-Link $desktop ''
if ($Startup) { New-Link $startupLnk '-Hidden' }
else { Remove-Item $startupLnk -ErrorAction SilentlyContinue }
