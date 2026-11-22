// Abre la app compilada en modo de pruebas (datos temporales, sin sesión ni integraciones) para probarla a mano.
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shutoki-test-'))
const electron = require('electron')
const p = spawn(electron, [path.resolve(__dirname, '..')], { stdio: 'inherit', env: { ...process.env, SHUTOKI_TEST: '1', SHUTOKI_DATA_DIR: dir } })
p.on('exit', (c) => {
  fs.rmSync(dir, { recursive: true, force: true })
  process.exit(c ?? 0)
})
