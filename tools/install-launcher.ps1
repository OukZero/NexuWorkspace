# Crea los accesos directos de Shutoki AI Workspace apuntando al ejecutable empaquetado (arranque rápido, sin compilar):
#   - Escritorio:  "Shutoki AI Workspace"  -> release\win-unpacked\Shutoki AI Workspace.exe
#   - Inicio de Windows (-Startup): mismo .exe con --hidden, arranca en la bandeja
# Uso:  powershell -ExecutionPolicy Bypass -File tools\install-launcher.ps1 [-Startup] [-Remove] [-Dev]
#   -Dev  : en vez del .exe, el acceso directo usa tools\launch.ps1 (compila los cambios nuevos antes de abrir; para desarrollar)
# Antes de usarlo: npm run pack  (genera release\win-unpacked con los cambios actuales)
param([switch]$Startup, [switch]$Remove, [switch]$Dev)

$root = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $root 'release\win-unpacked\Shutoki AI Workspace.exe'
$launch = Join-Path $PSScriptRoot 'launch.ps1'
$icon = Join-Path $root 'resources\shutoki-ai.ico'
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Shutoki AI Workspace.lnk'
$startupLnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Shutoki AI Workspace.lnk'

if ($Remove) {
  Remove-Item $desktop, $startupLnk -ErrorAction SilentlyContinue
  Write-Host 'Accesos directos eliminados.'
  exit 0
}

if (-not $Dev -and -not (Test-Path $exe)) {
  Write-Host "No existe $exe. Ejecuta primero: npm run pack"
  exit 1
}

function New-Link([string]$path, [bool]$hidden) {
  $sh = New-Object -ComObject WScript.Shell
  $l = $sh.CreateShortcut($path)
  if ($Dev) {
    $l.TargetPath = (Get-Command powershell.exe).Source
    $l.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launch`"" + $(if ($hidden) { ' -Hidden' } else { '' })
    $l.WorkingDirectory = $root
    $l.WindowStyle = 7 # minimizada
    $l.Description = 'Shutoki AI Workspace (compila los cambios nuevos y abre)'
  } else {
    $l.TargetPath = $exe
    $l.Arguments = $(if ($hidden) { '--hidden' } else { '' })
    $l.WorkingDirectory = Split-Path $exe -Parent
    $l.Description = 'Shutoki AI Workspace'
  }
  if (Test-Path $icon) { $l.IconLocation = $icon }
  $l.Save()
  Write-Host "Creado: $path"
}

New-Link $desktop $false
if ($Startup) { New-Link $startupLnk $true }
else { Remove-Item $startupLnk -ErrorAction SilentlyContinue }
