import { APP_ID } from './appid'
import { app, globalShortcut, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import * as auth from './auth'
import * as chat from './chat'
import { commit, getDb, initDb, save } from './db'
import { registerIpc } from './ipc'
import { killPtysOf } from './pty'
import { lifecycle } from './lifecycle'
import { cleanup } from './quit'
import { registerMockupProtocol, registerMockupScheme } from './mockups'
import { registerNoteProtocol, registerNoteScheme } from './notes'
import { showSplash } from './splash'
import { pollCi } from './ci'
import { checkFocusBlocks, checkMeetings } from './calendar'
import { checkDaily, checkIdle, checkReminder, generateRecurring } from './scheduler'
import { restart as startTelegram, stop as stopTelegram } from './telegram'
import { activeEntry, stopActive } from './timer'
import { initUpdater } from './updater'
import { applyLoginItem, destroyTray, initTray } from './tray'
import { createWindows, emit, openSkills, showWin } from './windows'
import { notify } from './notify'
import { recommendedPending } from './skills'
import { openWhatsApp, registerWhatsAppIpc } from './whatsapp'
import { initWebviews } from './web'
import { initContextMenu } from './contextMenu'
import { initMeetings } from './meetings'

// La app se llamaba "mis-tareas": se conserva esa carpeta de datos para no perder tareas, horas ni chats al renombrar.
// SHUTOKI_DATA_DIR permite probar con datos descartables sin tocar los reales.
app.setPath('userData', process.env['SHUTOKI_DATA_DIR'] || path.join(app.getPath('appData'), 'mis-tareas'))
app.setAppUserModelId(APP_ID) // agrupa la app en la barra de tareas de Windows con su propio icono
registerMockupScheme() // debe registrarse antes de que la app esté lista
registerNoteScheme()

/**
 * Windows toma el nombre y el icono de las notificaciones del acceso directo del menú Inicio que tenga este AppUserModelId.
 * El instalador ya lo crea; en desarrollo (electron.exe) no existe y salía «Electron», así que se crea uno.
 */
function ensureStartMenuShortcut(): void {
  if (process.platform !== 'win32' || app.isPackaged) return
  try {
    const root = path.join(__dirname, '../..')
    const launcher = path.join(root, 'tools', 'launch.ps1')
    const icon = path.join(root, 'resources', 'nexo.ico')
    const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Nexu Workspace.lnk')
    // los accesos antiguos («Shutoki», «Shutoki One») tenían otro identificador y mantenía el icono viejo
    for (const old of ['Shutoki.lnk', 'Shutoki One.lnk']) fs.rmSync(path.join(path.dirname(lnk), old), { force: true })
    shell.writeShortcutLink(lnk, 'create', {
      target: path.join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      args: `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${launcher}"`,
      cwd: root,
      icon,
      iconIndex: 0,
      description: 'Nexu Workspace',
      appUserModelId: APP_ID
    })
  } catch {
    /* sin permiso para escribir el acceso directo: las notificaciones salen con el nombre de Electron */
  }
}

let gotLock = app.requestSingleInstanceLock()
// tras «Reiniciar la aplicación», la instancia anterior puede tardar un poco en soltar el bloqueo
for (let i = 0; !gotLock && process.argv.includes('--restarted') && i < 50; i++) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
  gotLock = app.requestSingleInstanceLock()
}
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', showWin)

  // Avisa una sola vez de las skills recomendadas que faltan; no instala nada sin que el usuario lo pida.
  const suggestSkills = (): void => {
    setTimeout(() => {
      const s = getDb().settings
      if (s.skillsPrompted) return
      const missing = recommendedPending()
      s.skillsPrompted = true
      commit()
      if (!missing.length) return
      notify({ kind: 'attention', title: 'Skills recomendadas para Claude', body: `Faltan ${missing.length}: ${missing.join(', ')}. Haz click para instalarlas.`, tg: false, onClick: openSkills })
    }, 20000)
  }

  void app.whenReady().then(async () => {
    if (!process.argv.includes('--hidden')) showSplash() // primero: lo demás tarda un poco
    ensureStartMenuShortcut()
    initDb()
    registerMockupProtocol()
    registerNoteProtocol()
    registerIpc()
    registerWhatsAppIpc()
    initWebviews()
    initContextMenu()
    initMeetings()
    const db = getDb()
    // los timers abiertos de una sesión anterior se cierran al último latido
    if (db.heartbeat) for (const e of db.entries) if (!e.end) e.end = Math.max(e.start, db.heartbeat)
    await auth.initAuth() // sin sesión válida el renderer solo muestra el login y el IPC rechaza todo lo demás
    createWindows()
    initTray(openWhatsApp)
    applyLoginItem()
    initUpdater()
    globalShortcut.register('Control+Alt+N', () => {
      showWin()
      if (!auth.isSignedIn()) return
      emit('quickadd')
    })
    // los servicios que trabajan con los datos del usuario solo corren con sesión iniciada
    let servicesOn = false
    const startServices = (): void => {
      if (servicesOn) return
      servicesOn = true
      startTelegram()
      generateRecurring()
      suggestSkills()
    }
    if (auth.isSignedIn()) startServices()
    auth.onAuthChange((s) => {
      if (s.signedIn) return startServices()
      servicesOn = false
      stopTelegram()
      stopActive() // el timer no sigue contando con la sesión cerrada
      commit()
    })
    setInterval(() => {
      if (!auth.isSignedIn()) return
      db.heartbeat = Date.now()
      checkIdle()
      checkReminder()
      checkDaily()
      void pollCi()
      checkMeetings()
      checkFocusBlocks()
    }, 30000)
    setInterval(() => {
      if (auth.isSignedIn()) generateRecurring()
    }, 10 * 60 * 1000)
    setInterval(() => {
      if (activeEntry()) save()
    }, 60000)
  })

  app.on('before-quit', () => {
    lifecycle.quitting = true
  })
  app.on('will-quit', () => {
    cleanup()
    try {
      save()
    } catch {
      /* sin datos que guardar */
    }
  })
  app.on('window-all-closed', () => app.quit())
}
