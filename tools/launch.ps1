# Compila los últimos cambios (como `npm start`) y abre Shutoki AI Workspace.
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
if (-not $running) {
  & $builder build *> $log
  if ($LASTEXITCODE -ne 0 -and -not (Test-Path (Join-Path $root 'out\main\index.js'))) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("No se pudo compilar Shutoki AI Workspace. Detalle en:`n$log", 'Shutoki AI Workspace', 'OK', 'Error') | Out-Null
    exit 1
  }
  # Si la compilación falla pero hay una anterior, se abre esa.
}

$argList = @('.')
if ($Hidden) { $argList += '--hidden' }
Start-Process -FilePath $electron -ArgumentList $argList -WorkingDirectory $root
