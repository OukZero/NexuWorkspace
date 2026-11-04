# Genera el instalador firmado con el certificado autofirmado de uso personal (ver ~/.shutoki-signing).
# La contraseña del .pfx está cifrada con DPAPI: solo se puede leer con tu usuario de Windows.
$ErrorActionPreference = 'Stop'
$dir = Join-Path $HOME '.shutoki-signing'
$pfx = Join-Path $dir 'shutoki.pfx'
if (-not (Test-Path $pfx)) { throw "No existe $pfx. Crea el certificado primero." }
$sec = Get-Content (Join-Path $dir 'password.dpapi') | ConvertTo-SecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try {
  $env:CSC_LINK = $pfx
  $env:CSC_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  Set-Location (Join-Path $PSScriptRoot '..')
  npm run dist
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Item Env:\CSC_LINK, Env:\CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
}
