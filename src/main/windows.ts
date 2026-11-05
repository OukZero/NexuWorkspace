import { app, BrowserWindow, screen } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDb, registerWindow } from './db'
import { lifecycle } from './lifecycle'

let win: BrowserWindow | null = null
let mini: BrowserWindow | null = null

const preload = (): string => path.join(__dirname, '../preload/index.js')

// Icono de la ventana y de la barra de tareas; se genera con `npm run icon`. Sin el archivo, se usa el de Electron.
const iconPath = path.join(__dirname, '../../resources/icon.ico')
const icon = (): { icon?: string } => (fs.existsSync(iconPath) ? { icon: iconPath } : {})

function loadPage(w: BrowserWindow, page: 'index' | 'mini'): void {
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (dev) void w.loadURL(`${dev}/${page}.html`)
  else void w.loadFile(path.join(__dirname, `../renderer/${page}.html`))
}

export const getMain = (): BrowserWindow | null => win

/** Envía un evento a la ventana principal. */
export function emit(channel: string, payload?: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

export function showWin(): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createMini(): void {
  const wa = screen.getPrimaryDisplay().workArea
  const w = 360
  const h = 108
  mini = new BrowserWindow({
    width: w,
    height: h,
    x: wa.x + wa.width - w - 16,
    y: wa.y + wa.height - h - 16,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: '#171a21',
    webPreferences: { preload: preload(), contextIsolation: true, nodeIntegration: false }
  })
  mini.setAlwaysOnTop(true, 'screen-saver')
  registerWindow(mini)
  loadPage(mini, 'mini')
}

export function createWindows(): void {
  const hidden = process.argv.includes('--hidden') // arranque con Windows: empieza en la bandeja
  win = new BrowserWindow({
    show: !hidden,
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#0f1115',
    title: 'Shutoki',
    ...icon(),
    autoHideMenuBar: true,
    webPreferences: { preload: preload(), contextIsolation: true, nodeIntegration: false }
  })
  registerWindow(win)
  // Sin esto, al fijar la app en la barra de tareas (o en su menú de salto) Windows usa el icono de electron.exe.
  if (process.platform === 'win32' && fs.existsSync(iconPath)) {
    const launcher = path.join(app.getAppPath(), 'tools', 'launch.ps1')
    win.setAppDetails({
      appId: 'com.oukzero.shutoki',
      appIconPath: iconPath,
      appIconIndex: 0,
      relaunchDisplayName: 'Shutoki',
      // en desarrollo, fijarla en la barra la reabre compilando los últimos cambios
      ...(!app.isPackaged && fs.existsSync(launcher)
        ? { relaunchCommand: `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${launcher}"` }
        : {})
    })
  }
  loadPage(win, 'index')
  createMini()
  // al minimizar aparece la ventana flotante; al volver, se oculta
  win.on('minimize', () => {
    if (mini && !mini.isDestroyed()) mini.showInactive()
  })
  const hideMini = (): void => {
    if (mini && !mini.isDestroyed()) mini.hide()
  }
  win.on('restore', hideMini)
  win.on('show', hideMini)
  // oculta en la bandeja también aparece la ventana flotante (el timer sigue visible)
  win.on('hide', () => {
    if (mini && !mini.isDestroyed()) mini.showInactive()
  })
  // «cerrar» manda la app a la bandeja si así se configuró; salir de verdad es desde la bandeja o el menú
  win.on('close', (e) => {
    if (!lifecycle.quitting && getDb().settings.closeToTray) {
      e.preventDefault()
      win?.hide()
    }
  })
  if (hidden) mini?.showInactive()
  win.on('closed', () => {
    if (mini && !mini.isDestroyed()) mini.destroy()
    win = null
  })
}
