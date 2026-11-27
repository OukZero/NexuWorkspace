import { app, BrowserWindow, screen } from 'electron'
import fs from 'fs'
import path from 'path'

let splash: BrowserWindow | null = null
let guard: NodeJS.Timeout | null = null
let loadedAt = 0
let pending: (() => void) | null = null
const MIN_VISIBLE_MS = 900 // una vez dibujada, se deja ver un instante para que se note la animación

const logoPath = path.join(__dirname, '../../resources/icon.png')

// marca que deja la actualización antes de cerrar la app: al reabrir, la pantalla de inicio dice que se actualizó
const markerPath = (): string => path.join(app.getPath('userData'), 'updating.json')

function html(status = ''): string {
  const logo = fs.existsSync(logoPath) ? `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}` : ''
  return `<!doctype html><html><head><meta charset="utf-8"><style>
p{font-size:12px;color:#9fb3e6;letter-spacing:.3px;margin-top:2px;text-align:center;padding:0 16px}
*{box-sizing:border-box;margin:0}
html,body{width:100%;height:100%;overflow:hidden;background:#070b18;font-family:'Segoe UI',system-ui,sans-serif;-webkit-user-select:none}
.card{position:absolute;inset:0;background:radial-gradient(120% 120% at 20% 10%,#16264d 0%,#0a1020 55%,#04060f 100%);box-shadow:inset 0 0 0 1px #1f3a6b;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;animation:in .35s ease-out}
img{width:92px;height:92px;filter:drop-shadow(0 0 18px rgba(34,211,238,.5));animation:pulse 1.8s ease-in-out infinite}
h1{font-size:22px;font-weight:700;color:#e8edff;letter-spacing:.4px}
h2{font-size:10px;font-weight:600;color:#22d3ee;letter-spacing:3px;text-transform:uppercase;margin-top:-10px}
.bar{width:150px;height:3px;border-radius:3px;background:#14224a;overflow:hidden;margin-top:6px}
.bar i{display:block;height:100%;width:40%;border-radius:3px;background:linear-gradient(90deg,#22d3ee,#8b5cf6);animation:slide 1.2s ease-in-out infinite}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes slide{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}
@keyframes in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
</style></head><body><div class="card">${logo ? `<img src="${logo}">` : ''}<h1>Nexu</h1><h2>Workspace</h2><div class="bar"><i></i></div>${status ? `<p>${status.replace(/[<>&]/g, '')}</p>` : ''}</div></body></html>`
}

/** Deja anotado que la app se cierra para actualizarse; el siguiente arranque lo muestra en su pantalla de inicio. */
function markUpdating(version?: string): void {
  try {
    fs.writeFileSync(markerPath(), JSON.stringify({ to: version ?? '' }))
  } catch {
    /* sin marca: el arranque sale normal */
  }
}

function takeMarker(): string | null {
  try {
    const m = JSON.parse(fs.readFileSync(markerPath(), 'utf8')) as { to?: string }
    fs.unlinkSync(markerPath())
    return m.to ? `Actualizado a la versión ${m.to}` : 'Actualización instalada'
  } catch {
    return null
  }
}

/** Pantalla «Actualizando…» antes de cerrar para instalar: oculta las ventanas y la deja ver `ms` milisegundos. */
export function showUpdating(version: string | undefined, ms = 2200): Promise<void> {
  markUpdating(version)
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.hide()
  return new Promise((resolve) => {
    try {
      if (splash && !splash.isDestroyed()) splash.destroy()
      openWindow(`Actualizando${version ? ` a la versión ${version}` : ''}… la app se reabrirá sola`)
    } catch {
      /* sin pantalla: se instala igualmente */
    }
    setTimeout(resolve, ms)
  })
}

/** Pantalla de inicio: aparece al instante, antes de cargar los datos y la ventana principal, para que se note que la app está abriendo. */
export function showSplash(): void {
  try {
    openWindow(takeMarker() ?? '')
    // si algo falla al abrir, la pantalla de inicio no se queda para siempre
    guard = setTimeout(() => finish(true), 20000)
  } catch {
    splash = null
  }
}

function openWindow(status: string): void {
  {
    const wa = screen.getPrimaryDisplay().workArea
    const w = 360
    const h = 300
    splash = new BrowserWindow({
      width: w,
      height: h,
      x: Math.round(wa.x + (wa.width - w) / 2),
      y: Math.round(wa.y + (wa.height - h) / 2),
      frame: false,
      backgroundColor: '#10082a',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    })
    splash.webContents.on('did-finish-load', () => {
      loadedAt = Date.now()
      tryClose()
    })
    splash.showInactive()
    void splash.loadURL(`data:text/html;charset=utf-8;base64,${Buffer.from(html(status)).toString('base64')}`)
  }
}

function finish(force = false): void {
  if (guard) clearTimeout(guard)
  guard = null
  if (splash && !splash.isDestroyed()) splash.destroy()
  splash = null
  loadedAt = 0
  const cb = pending
  pending = null
  if (force || cb) cb?.()
}

function tryClose(): void {
  if (!pending) return
  if (!splash || splash.isDestroyed()) return finish()
  if (!loadedAt) return // todavía no se dibujó: se reintenta al terminar de cargar
  const wait = MIN_VISIBLE_MS - (Date.now() - loadedAt)
  if (wait > 0) setTimeout(tryClose, wait)
  else finish()
}

/** Cierra la pantalla de inicio (tras dejarla ver un momento) y luego ejecuta `done` (mostrar la ventana principal). */
export function closeSplash(done?: () => void): void {
  pending = done ?? (() => undefined)
  tryClose()
}
