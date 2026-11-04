import { app, globalShortcut } from 'electron'
import path from 'path'
import * as chat from './chat'
import { getDb, initDb, save } from './db'
import { registerIpc } from './ipc'
import { killPtysOf } from './pty'
import { lifecycle } from './lifecycle'
import { registerMockupProtocol, registerMockupScheme } from './mockups'
import { checkDaily, checkIdle, checkReminder, generateRecurring } from './scheduler'
import { activeEntry } from './timer'
import { applyLoginItem, initTray } from './tray'
import { createWindows, emit, showWin } from './windows'

// La app se llamaba "mis-tareas": se conserva esa carpeta de datos para no perder tareas, horas ni chats al renombrar.
// SHUTOKI_DATA_DIR permite probar con datos descartables sin tocar los reales.
app.setPath('userData', process.env['SHUTOKI_DATA_DIR'] || path.join(app.getPath('appData'), 'mis-tareas'))
app.setAppUserModelId('com.oukzero.shutoki') // agrupa la app en la barra de tareas de Windows con su propio icono
registerMockupScheme() // debe registrarse antes de que la app esté lista

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWin)

  void app.whenReady().then(() => {
    initDb()
    registerMockupProtocol()
    registerIpc()
    const db = getDb()
    // los timers abiertos de una sesión anterior se cierran al último latido
    if (db.heartbeat) for (const e of db.entries) if (!e.end) e.end = Math.max(e.start, db.heartbeat)
    createWindows()
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
