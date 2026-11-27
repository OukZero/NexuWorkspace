import { APP_ID } from './appid'
import { app, BrowserWindow, screen } from 'electron'
import fs from 'fs'
import path from 'path'
import { commit, getDb, registerWindow } from './db'
import { lifecycle } from './lifecycle'
import { isSignedIn } from './auth'
import { closeSplash } from './splash'

let win: BrowserWindow | null = null
let mini: BrowserWindow | null = null

const preload = (): string => path.join(__dirname, '../preload/index.js')

// Icono de la ventana y de la barra de tareas; se genera con `npm run icon`. Sin el archivo, se usa el de Electron.
const iconPath = path.join(__dirname, '../../resources/nexo.ico')
const icon = (): { icon?: string } => (fs.existsSync(iconPath) ? { icon: iconPath } : {})

function loadPage(w: BrowserWindow, page: 'index' | 'mini', query?: Record<string, string>): void {
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (dev) void w.loadURL(`${dev}/${page}.html${query ? `?${new URLSearchParams(query)}` : ''}`)
  else void w.loadFile(path.join(__dirname, `../renderer/${page}.html`), query ? { query } : undefined)
}

export const getMain = (): BrowserWindow | null => win

/** Tamaño inicial y mínimos que caben en la pantalla donde se abrirá la ventana (área de trabajo, sin barra de tareas). */
function fitSize(w: number, h: number, minW: number, minH: number): { width: number; height: number; minWidth: number; minHeight: number } {
  const a = screen.getPrimaryDisplay().workArea
  return { width: Math.min(w, a.width), height: Math.min(h, a.height), minWidth: Math.min(minW, a.width), minHeight: Math.min(minH, a.height) }
}

/** Mantiene la ventana dentro de la pantalla en que está: la reduce si no cabe y la mueve si queda fuera (cambio de resolución, monitor desconectado). */
function keepOnScreen(w: BrowserWindow): void {
  if (w.isDestroyed() || w.isMaximized() || w.isFullScreen() || w.isMinimized()) return
  const b = w.getBounds()
  const a = screen.getDisplayMatching(b).workArea
  const width = Math.min(b.width, a.width)
  const height = Math.min(b.height, a.height)
  const x = Math.min(Math.max(b.x, a.x), a.x + a.width - width)
  const y = Math.min(Math.max(b.y, a.y), a.y + a.height - height)
  if (x !== b.x || y !== b.y || width !== b.width || height !== b.height) w.setBounds({ x, y, width, height })
}

/** Aplica `keepOnScreen` ahora y cada vez que cambia la pantalla (resolución, escala o monitores). */
function autoFit(w: BrowserWindow): void {
  const run = (): void => keepOnScreen(w)
  screen.on('display-metrics-changed', run)
  screen.on('display-removed', run)
  w.once('closed', () => {
    screen.removeListener('display-metrics-changed', run)
    screen.removeListener('display-removed', run)
  })
  w.once('ready-to-show', run)
}

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
const MINI_SIZE = { full: [360, 108], compact: [360, 60], timer: [210, 50], edge: [8, 160] } as const
// en formato «full» y «edge» el renderer pide su tamaño (píldora o vista expandida; en «edge», franja → menú → chat)
let miniWant: [number, number] | null = null
const miniSize = (): readonly [number, number] => {
  const f = getDb().settings.miniFormat ?? 'full'
  return (f === 'full' || f === 'edge') && miniWant ? miniWant : (MINI_SIZE[f] ?? MINI_SIZE.full)
}

export function resizeMini(w: number, h: number): void {
  if ((getDb().settings.miniFormat ?? 'full') === 'edge') miniWant = [Math.min(520, Math.max(10, Math.round(w))), Math.min(720, Math.max(60, Math.round(h)))]
  else miniWant = [Math.min(520, Math.max(300, Math.round(w))), Math.min(560, Math.max(44, Math.round(h)))]
  applyMini()
}

/** Muestra la ventana flotante (si no está desactivada en Ajustes). */
function showMini(): void {
  if (getDb().settings.miniEnabled === false || !isSignedIn()) return
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
  if (s.miniFormat === 'edge') {
    // barra pegada al borde derecho (como la barra de tareas oculta), centrada en vertical; crece hacia la izquierda
    const a = screen.getDisplayMatching(b).workArea
    const hh = Math.min(h, a.height)
    const x = a.x + a.width - w
    const y = Math.round(a.y + (a.height - hh) / 2)
    if (b.x !== x || b.y !== y || b.width !== w || b.height !== hh) mini.setBounds({ x, y, width: w, height: hh })
  } else if (b.width !== w || b.height !== h) {
    // y sin salirse del área de trabajo: si no, al crecer (vista expandida) el input queda tapado por la barra de tareas o fuera de la pantalla
    const a = screen.getDisplayMatching(b).workArea
    const x = Math.min(Math.max(b.x + b.width - w, a.x), a.x + a.width - w)
    const y = Math.min(Math.max(b.y + b.height - h, a.y), a.y + a.height - h - 8)
    mini.setBounds({ x, y, width: w, height: h })
  }
  mini.setAlwaysOnTop(s.miniOnTop !== false, 'screen-saver')
  mini.setOpacity(Math.min(1, Math.max(0.4, (s.miniOpacity ?? 100) / 100)))
  if (s.miniEnabled === false) mini.hide()
  else if (win && !win.isDestroyed() && (win.isMinimized() || !win.isVisible()) && !mini.isVisible()) mini.showInactive()
}

function createMini(): void {
  const wa = screen.getPrimaryDisplay().workArea
  const [w, h] = miniSize()
  const edge = getDb().settings.miniFormat === 'edge'
  // posición recordada, si sigue dentro de alguna pantalla; si no, esquina inferior derecha
  const saved = getDb().settings.miniPos
  const onScreen = saved && screen.getAllDisplays().some((d) => saved.x >= d.bounds.x && saved.y >= d.bounds.y && saved.x + w <= d.bounds.x + d.bounds.width && saved.y + h <= d.bounds.y + d.bounds.height)
  mini = new BrowserWindow({
    width: w,
    height: h,
    x: edge ? wa.x + wa.width - w : onScreen ? saved.x : wa.x + wa.width - w - 16,
    y: edge ? Math.round(wa.y + (wa.height - h) / 2) : onScreen ? saved.y : wa.y + wa.height - h - 16,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minWidth: 1,
    minHeight: 1,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: '#171a21',
    webPreferences: { preload: preload(), contextIsolation: true, nodeIntegration: false }
  })
  mini.setAlwaysOnTop(getDb().settings.miniOnTop !== false, 'screen-saver')
  mini.setOpacity(Math.min(1, Math.max(0.4, (getDb().settings.miniOpacity ?? 100) / 100)))
  // recordar dónde la deja el usuario (con retardo: 'moved' se dispara al soltar, pero en Windows puede repetirse)
  let t: NodeJS.Timeout | undefined
  mini.on('moved', () => {
    clearTimeout(t)
    t = setTimeout(() => {
      if (!mini || mini.isDestroyed()) return
      const [x, y] = mini.getPosition()
      getDb().settings.miniPos = { x, y }
      commit()
    }, 400)
  })
  registerWindow(mini)
  // si la posición guardada queda bajo la barra de tareas o cambia la pantalla, se vuelve a meter en el área visible
  const refit = (): void => {
    if (!mini || mini.isDestroyed()) return
    const b = mini.getBounds()
    const a = screen.getDisplayMatching(b).workArea
    const x = Math.min(Math.max(b.x, a.x), a.x + a.width - b.width)
    const y = Math.min(Math.max(b.y, a.y), a.y + a.height - b.height - 8)
    if (x !== b.x || y !== b.y) mini.setPosition(x, y)
  }
  mini.once('ready-to-show', refit)
  screen.on('display-metrics-changed', refit)
  mini.once('closed', () => screen.removeListener('display-metrics-changed', refit))
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
    ...fitSize(920, 720, 520, 400),
    ...(pos ? { x: Math.max(0, pos.x - 460), y: Math.max(0, pos.y - 24) } : {}),
    backgroundColor: '#0f1115',
    title: 'Nexu Workspace',
    ...icon(),
    autoHideMenuBar: true,
    webPreferences: { preload: preload(), contextIsolation: true, nodeIntegration: false }
  })
  registerWindow(w)
  autoFit(w)
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
    ...fitSize(860, 680, 520, 400),
    backgroundColor: '#0f1115',
    title: 'Skills · Nexu Workspace',
    ...icon(),
    autoHideMenuBar: true,
    webPreferences: { preload: preload(), contextIsolation: true, nodeIntegration: false }
  })
  registerWindow(w)
  autoFit(w)
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
    ...fitSize(1200, 780, 900, 560),
    backgroundColor: '#0f1115',
    title: 'Nexu Workspace',
    ...icon(),
    autoHideMenuBar: true,
    webPreferences: { preload: preload(), contextIsolation: true, nodeIntegration: false, webviewTag: true }
  })
  registerWindow(win)
  autoFit(win)
  let ready = false
  win.once('ready-to-show', () => {
    ready = true
    closeSplash(() => !hidden && win?.show())
  })
  // si el renderer no llega a cargar, la ventana no se queda oculta para siempre (pantalla en negro sin nada visible)
  setTimeout(() => {
    if (!ready && !hidden && win && !win.isDestroyed()) win.show()
  }, 15000).unref()
  // Sin esto, al fijar la app en la barra de tareas (o en su menú de salto) Windows usa el icono de electron.exe.
  if (process.platform === 'win32' && fs.existsSync(iconPath)) {
    const launcher = path.join(app.getAppPath(), 'tools', 'launch.ps1')
    win.setAppDetails({
      appId: APP_ID,
      appIconPath: iconPath,
      appIconIndex: 0,
      relaunchDisplayName: 'Nexu Workspace',
      // en desarrollo, fijarla en la barra la reabre compilando los últimos cambios
      ...(!app.isPackaged && fs.existsSync(launcher)
        ? { relaunchCommand: `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${launcher}"` }
        : {})
    })
  }
  loadPage(win, 'index')
  createMini()
  // al minimizar aparece la ventana flotante; al volver, se oculta
  win.on('enter-full-screen', () => emit('fullscreen', true))
  win.on('leave-full-screen', () => emit('fullscreen', false))
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
