import { APP_ID } from './appid'
import { app, BrowserWindow, screen } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDb, registerWindow } from './db'
import { lifecycle } from './lifecycle'
import { closeSplash } from './splash'

let win: BrowserWindow | null = null
let mini: BrowserWindow | null = null

const preload = (): string => path.join(__dirname, '../preload/index.js')

// Icono de la ventana y de la barra de tareas; se genera con `npm run icon`. Sin el archivo, se usa el de Electron.
const iconPath = path.join(__dirname, '../../resources/shutoki-ai.ico')
const icon = (): { icon?: string } => (fs.existsSync(iconPath) ? { icon: iconPath } : {})

function loadPage(w: BrowserWindow, page: 'index' | 'mini', query?: Record<string, string>): void {
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (dev) void w.loadURL(`${dev}/${page}.html${query ? `?${new URLSearchParams(query)}` : ''}`)
  else void w.loadFile(path.join(__dirname, `../renderer/${page}.html`), query ? { query } : undefined)
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

// tamaño de la ventana flotante según el formato elegido en Ajustes
const MINI_SIZE = { full: [360, 108], compact: [360, 60], timer: [210, 50] } as const
const miniSize = (): readonly [number, number] => MINI_SIZE[getDb().settings.miniFormat ?? 'full'] ?? MINI_SIZE.full

/** Muestra la ventana flotante (si no está desactivada en Ajustes). */
function showMini(): void {
  if (getDb().settings.miniEnabled === false) return
  if (mini && !mini.isDestroyed()) mini.showInactive()
}

export function hideMini(): void {
  if (mini && !mini.isDestroyed()) mini.hide()
}

/** Aplica los cambios de Ajustes a la ventana flotante: formato, encima de todo y activada. */
export function applyMini(): void {
  if (!mini || mini.isDestroyed()) return
  const s = getDb().settings
  const [w, h] = miniSize()
  const b = mini.getBounds()
  // el formato cambia el tamaño sin mover la esquina inferior derecha
  if (b.width !== w || b.height !== h) mini.setBounds({ x: b.x + b.width - w, y: b.y + b.height - h, width: w, height: h })
  mini.setAlwaysOnTop(s.miniOnTop !== false, 'screen-saver')
  if (s.miniEnabled === false) mini.hide()
  else if (win && !win.isDestroyed() && (win.isMinimized() || !win.isVisible()) && !mini.isVisible()) mini.showInactive()
}

function createMini(): void {
  const wa = screen.getPrimaryDisplay().workArea
  const [w, h] = miniSize()
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
  mini.setAlwaysOnTop(getDb().settings.miniOnTop !== false, 'screen-saver')
  registerWindow(mini)
  loadPage(mini, 'mini')
}

// ---------- ventanas sueltas (una tarea sacada de la ventana principal) ----------
const popouts = new Map<string, BrowserWindow>()

/** Abre una tarea (y su conversación) en una ventana aparte; si ya está abierta, la trae al frente. */
export function openPopout(taskId: string, convId?: string, atCursor = false): void {
  const key = taskId
  const prev = popouts.get(key)
  if (prev && !prev.isDestroyed()) {
    if (prev.isMinimized()) prev.restore()
    prev.focus()
    return
  }
  const pos = atCursor ? screen.getCursorScreenPoint() : null
  const w = new BrowserWindow({
    width: 920,
    height: 720,
    minWidth: 520,
    minHeight: 400,
    ...(pos ? { x: Math.max(0, pos.x - 460), y: Math.max(0, pos.y - 24) } : {}),
    backgroundColor: '#0f1115',
    title: 'Shutoki AI Workspace',
    ...icon(),
    autoHideMenuBar: true,
    webPreferences: { preload: preload(), contextIsolation: true, nodeIntegration: false }
  })
  registerWindow(w)
  popouts.set(key, w)
  w.on('closed', () => popouts.delete(key))
  loadPage(w, 'index', { pop: taskId, ...(convId ? { conv: convId } : {}) })
}

let skillsWin: BrowserWindow | null = null

/** Ventana aparte con el catálogo de skills oficiales. */
export function openSkills(): void {
  if (skillsWin && !skillsWin.isDestroyed()) {
    if (skillsWin.isMinimized()) skillsWin.restore()
    skillsWin.focus()
    return
  }
  const w = new BrowserWindow({
    width: 860,
    height: 680,
    minWidth: 520,
    minHeight: 400,
    backgroundColor: '#0f1115',
    title: 'Skills · Shutoki AI Workspace',
    ...icon(),
    autoHideMenuBar: true,
    webPreferences: { preload: preload(), contextIsolation: true, nodeIntegration: false }
  })
  registerWindow(w)
  skillsWin = w
  w.on('closed', () => (skillsWin = null))
  loadPage(w, 'index', { skills: '1' })
}

/** Devuelve la tarea a la ventana principal (abre su conversación allí) y cierra la ventana suelta. */
export function dockPopout(taskId: string, convId?: string): void {
  showWin()
  if (convId) emit('goto', `chat:${convId}`)
  const w = popouts.get(taskId)
  if (w && !w.isDestroyed()) w.close()
}

export function createWindows(): void {
  const hidden = process.argv.includes('--hidden') // arranque con Windows: empieza en la bandeja
  win = new BrowserWindow({
    show: false, // se muestra al terminar de cargar (mientras tanto se ve la pantalla de inicio)
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#0f1115',
    title: 'Shutoki AI Workspace',
    ...icon(),
    autoHideMenuBar: true,
    webPreferences: { preload: preload(), contextIsolation: true, nodeIntegration: false }
  })
  registerWindow(win)
  win.once('ready-to-show', () => closeSplash(() => !hidden && win?.show()))
  // Sin esto, al fijar la app en la barra de tareas (o en su menú de salto) Windows usa el icono de electron.exe.
  if (process.platform === 'win32' && fs.existsSync(iconPath)) {
    const launcher = path.join(app.getAppPath(), 'tools', 'launch.ps1')
    win.setAppDetails({
      appId: APP_ID,
      appIconPath: iconPath,
      appIconIndex: 0,
      relaunchDisplayName: 'Shutoki AI Workspace',
      // en desarrollo, fijarla en la barra la reabre compilando los últimos cambios
      ...(!app.isPackaged && fs.existsSync(launcher)
        ? { relaunchCommand: `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${launcher}"` }
        : {})
    })
  }
  loadPage(win, 'index')
  createMini()
  // al minimizar aparece la ventana flotante; al volver, se oculta
  win.on('minimize', showMini)
  win.on('restore', hideMini)
  win.on('show', hideMini)
  // oculta en la bandeja también aparece la ventana flotante (el timer sigue visible)
  win.on('hide', showMini)
  // «cerrar» manda la app a la bandeja si así se configuró; salir de verdad es desde la bandeja o el menú
  win.on('close', (e) => {
    if (!lifecycle.quitting && getDb().settings.closeToTray) {
      e.preventDefault()
      win?.hide()
    }
  })
  if (hidden) showMini()
  win.on('closed', () => {
    for (const p of popouts.values()) if (!p.isDestroyed()) p.destroy()
    if (skillsWin && !skillsWin.isDestroyed()) skillsWin.destroy()
    if (mini && !mini.isDestroyed()) mini.destroy()
    win = null
  })
}
