# Compila los últimos cambios (como `npm start`) y abre Nexu Workspace.
# Uso:  launch.ps1            -> abre la ventana
#       launch.ps1 -Hidden    -> arranque con Windows: empieza en la bandeja
param([switch]$Hidden)

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$log = Join-Path $env:TEMP 'shutoki-launcher.log'
$builder = Join-Path $root 'node_modules\.bin\electron-vite.cmd'
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'

# Si ya está abierta, no se recompila (los archivos de out/ pueden estar en uso): solo se le avisa con una segunda instancia.
$running = Get-Process -Name 'electron' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $electron }
# Solo se compila si hay cambios nuevos en el código (así abrir la app es casi instantáneo).
$built = Join-Path $root 'out\main\index.js'
$needBuild = $true
if (Test-Path $built) {
  $stamp = (Get-Item $built).LastWriteTime
  $newer = Get-ChildItem (Join-Path $root 'src') -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $stamp } | Select-Object -First 1
  $cfg = Get-Item (Join-Path $root 'package.json'), (Join-Path $root 'electron.vite.config.ts') | Where-Object { $_.LastWriteTime -gt $stamp } | Select-Object -First 1
  $needBuild = [bool]($newer -or $cfg)
}
if (-not $running -and $needBuild) {
  & $builder build *> $log
  if ($LASTEXITCODE -ne 0 -and -not (Test-Path (Join-Path $root 'out\main\index.js'))) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("No se pudo compilar Nexu Workspace. Detalle en:`n$log", 'Nexu Workspace', 'OK', 'Error') | Out-Null
    exit 1
  }
  # Si la compilación falla pero hay una anterior, se abre esa.
}

$argList = @('.')
if ($Hidden) { $argList += '--hidden' }
Start-Process -FilePath $electron -ArgumentList $argList -WorkingDirectory $root
