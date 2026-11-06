import { app, globalShortcut, shell } from 'electron'
import path from 'path'
import * as chat from './chat'
import { getDb, initDb, save } from './db'
import { registerIpc } from './ipc'
import { killPtysOf } from './pty'
import { lifecycle } from './lifecycle'
import { registerMockupProtocol, registerMockupScheme } from './mockups'
import { checkDaily, checkIdle, checkReminder, generateRecurring } from './scheduler'
import { restart as startTelegram, stop as stopTelegram } from './telegram'
import { activeEntry } from './timer'
import { applyLoginItem, initTray } from './tray'
import { createWindows, emit, showWin } from './windows'

// La app se llamaba "mis-tareas": se conserva esa carpeta de datos para no perder tareas, horas ni chats al renombrar.
// SHUTOKI_DATA_DIR permite probar con datos descartables sin tocar los reales.
app.setPath('userData', process.env['SHUTOKI_DATA_DIR'] || path.join(app.getPath('appData'), 'mis-tareas'))
app.setAppUserModelId('com.oukzero.shutoki') // agrupa la app en la barra de tareas de Windows con su propio icono
registerMockupScheme() // debe registrarse antes de que la app esté lista

/**
 * Windows toma el nombre y el icono de las notificaciones del acceso directo del menú Inicio que tenga este AppUserModelId.
 * El instalador ya lo crea; en desarrollo (electron.exe) no existe y salía «Electron», así que se crea uno.
 */
function ensureStartMenuShortcut(): void {
  if (process.platform !== 'win32' || app.isPackaged) return
  try {
    const root = path.join(__dirname, '../..')
    const launcher = path.join(root, 'tools', 'launch.ps1')
    const icon = path.join(root, 'resources', 'icon.ico')
    const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Shutoki.lnk')
    shell.writeShortcutLink(lnk, 'create', {
      target: path.join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      args: `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${launcher}"`,
      cwd: root,
      icon,
      iconIndex: 0,
      description: 'Shutoki',
      appUserModelId: 'com.oukzero.shutoki'
    })
  } catch {
    /* sin permiso para escribir el acceso directo: las notificaciones salen con el nombre de Electron */
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWin)

  void app.whenReady().then(() => {
    ensureStartMenuShortcut()
    initDb()
    registerMockupProtocol()
    registerIpc()
    const db = getDb()
    // los timers abiertos de una sesión anterior se cierran al último latido
    if (db.heartbeat) for (const e of db.entries) if (!e.end) e.end = Math.max(e.start, db.heartbeat)
    createWindows()
    startTelegram()
    initTray()
    applyLoginItem()
    generateRecurring()
    globalShortcut.register('Control+Alt+N', () => {
      showWin()
      emit('quickadd')
    })
    setInterval(() => {
      db.heartbeat = Date.now()
      checkIdle()
      checkReminder()
      checkDaily()
    }, 30000)
    setInterval(generateRecurring, 10 * 60 * 1000)
    setInterval(() => {
      if (activeEntry()) save()
    }, 60000)
  })

  app.on('before-quit', () => {
    lifecycle.quitting = true
  })
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    stopTelegram()
    chat.killAll()
    killPtysOf()
    try {
      save()
    } catch {
      /* sin datos que guardar */
    }
  })
  app.on('window-all-closed', () => app.quit())
}
