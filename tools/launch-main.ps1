# Abre Nexo Workspace SIEMPRE con lo último de la rama main del remoto.
# Cada vez: git fetch -> se actualiza una copia aparte (..\Shutoki-main, no toca tu trabajo ni tu rama actual)
# -> npm install solo si cambiaron las dependencias -> compila solo si hay commits nuevos -> abre la app.
# Uso:  launch-main.ps1            -> abre la ventana
#       launch-main.ps1 -Hidden    -> arranque con Windows: empieza en la bandeja
param([switch]$Hidden)

$ErrorActionPreference = 'Continue'
$src = Split-Path $PSScriptRoot -Parent
$root = Join-Path (Split-Path $src -Parent) 'Shutoki-main'
$log = Join-Path $env:TEMP 'nexo-main-launcher.log'

function Fail([string]$msg) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($msg, 'Nexo Workspace', 'OK', 'Error') | Out-Null
  exit 1
}

# Primera vez: crea la copia de main como worktree (comparte el repositorio, no duplica el historial).
if (-not (Test-Path $root)) {
  & git -C $src fetch origin main *> $log
  & git -C $src worktree add --detach $root origin/main *>> $log
  if ($LASTEXITCODE -ne 0) { Fail "No se pudo crear la copia de main. Detalle en:`n$log" }
}

$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$running = Get-Process -Name 'electron' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $electron }

if (-not $running) {
  # Sin red se abre lo que ya hubiera; con red se actualiza a lo último subido a main.
  $before = (& git -C $root rev-parse HEAD).Trim()
  & git -C $root fetch origin main *>> $log
  if ($LASTEXITCODE -eq 0) { & git -C $root checkout --detach --force origin/main *>> $log }
  $after = (& git -C $root rev-parse HEAD).Trim()

  $lock = Join-Path $root 'package-lock.json'
  $stampLock = Join-Path $root 'node_modules\.lock-hash'
  $hash = if (Test-Path $lock) { (Get-FileHash $lock).Hash } else { '' }
  $needInstall = (-not (Test-Path (Join-Path $root 'node_modules'))) -or (-not (Test-Path $stampLock)) -or ((Get-Content $stampLock -ErrorAction SilentlyContinue) -ne $hash)
  if ($needInstall) {
    Push-Location $root
    & npm install *>> $log
    Pop-Location
    if ($LASTEXITCODE -ne 0) { Fail "No se pudieron instalar las dependencias. Detalle en:`n$log" }
    Set-Content -Path $stampLock -Value $hash
  }

  $built = Join-Path $root 'out\main\index.js'
  $stampBuild = Join-Path $root 'out\.built-commit'
  $builtFor = if (Test-Path $stampBuild) { (Get-Content $stampBuild -ErrorAction SilentlyContinue) } else { '' }
  if ($needInstall -or $before -ne $after -or $builtFor -ne $after -or -not (Test-Path $built)) {
    Push-Location $root
    & (Join-Path $root 'node_modules\.bin\electron-vite.cmd') build *>> $log
    $ok = $LASTEXITCODE -eq 0
    Pop-Location
    if ($ok) { Set-Content -Path $stampBuild -Value $after }
    elseif (-not (Test-Path $built)) { Fail "No se pudo compilar la última versión de main. Detalle en:`n$log" }
    # Si falla pero hay una compilación anterior, se abre esa.
  }
}

$argList = @('.')
if ($Hidden) { $argList += '--hidden' }
Start-Process -FilePath $electron -ArgumentList $argList -WorkingDirectory $root
