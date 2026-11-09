# Abre Shutoki AI Workspace en MODO EN VIVO: mientras está abierta, cada cambio que se haga al código se ve solo.
#   - Cambios en la interfaz (src/renderer): se actualizan al instante, sin recargar la ventana y sin perder lo que estás haciendo.
#   - Cambios en el proceso principal o en el preload (src/main, src/preload): la app se reinicia sola (unos segundos).
# Usa los mismos datos que la app normal. Para cerrar: «Salir» desde la bandeja o cerrar la ventana de consola.
$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
# Dos instancias no pueden compartir los datos: si ya hay una abierta, hay que cerrarla antes.
$running = Get-Process -Name 'electron' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $electron }
if ($running) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("Shutoki AI Workspace ya está abierta.`n`nCiérrala del todo (clic derecho en su icono de la bandeja → Salir) y vuelve a abrir este acceso para usar el modo en vivo.", 'Shutoki AI Workspace', 'OK', 'Information') | Out-Null
  exit 1
}

if (-not (Test-Path (Join-Path $root 'node_modules'))) { & npm install }
# Una consola minimizada mantiene vivo el servidor de desarrollo; al salir de la app, termina sola.
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'title Shutoki en vivo && npm run dev:live' -WorkingDirectory $root -WindowStyle Minimized
