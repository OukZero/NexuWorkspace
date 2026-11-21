// Actualizaciones automáticas con electron-updater. Los instaladores se publican en GitHub Releases (`npm run release`).
// Solo funciona con la app instalada: en desarrollo no hay nada que actualizar.
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/types'
import { clip } from '../shared/util'
import { broadcast, commit, getDb } from './db'
import { lifecycle } from './lifecycle'
import { stopActive } from './features/time/timer'
import { cleanup } from './quit'

const HOUR = 3_600_000
let state: UpdateState = { status: app.isPackaged ? 'idle' : 'dev', current: app.getVersion() }
let wired = false

const auto = (): boolean => getDb().settings.autoUpdate !== false

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch, current: app.getVersion() }
  broadcast('update', state)
}

export const getState = (): UpdateState => state

/** Mensaje comprensible para los fallos típicos (repositorio privado, sin red, sin publicaciones). */
function explain(e: Error): string {
  const m = e.message || String(e)
  if (/401|403|Bad credentials/i.test(m)) return 'GitHub rechazó el token de actualizaciones: revísalo en Ajustes (debe tener permiso de lectura de Contents en el repositorio).'
  // el texto original (URL y código) va al final: con un 404 no se sabe qué petición falló sin verlo
  if (/404|Not Found/i.test(m)) return `No hay publicaciones accesibles en GitHub. Si el repositorio es privado, pon un token de solo lectura en Ajustes → Actualizaciones; si no, aún no se ha publicado ninguna versión. [${clip(m.split('\n')[0], 260)}]`
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|net::|getaddrinfo/i.test(m)) return 'Sin conexión con GitHub: se reintentará más tarde.'
  if (/latest\.yml/i.test(m)) return 'La publicación no incluye latest.yml: usa «npm run release» para publicarla.'
  if (/app-update\.yml/i.test(m)) return 'Esta copia no trae la configuración de actualizaciones. Instala la versión con el instalador (Nexu-Workspace-Setup) para que se actualice sola.'
  return clip(m.split('\n')[0], 220)
}

/** Token de solo lectura para repos privados: el de Ajustes, o GH_TOKEN del equipo. Nunca va en el instalador. */
function applyToken(): void {
  const t = (getDb().settings.updateToken || process.env.GH_TOKEN || '').trim()
  if (!t) return
  process.env.GH_TOKEN = t // electron-updater lo usa para pedir los assets privados
  autoUpdater.addAuthHeader(`token ${t}`)
}

function wire(): void {
  if (wired) return
  wired = true
  autoUpdater.autoInstallOnAppQuit = true // si la dejas descargada, se instala sola al cerrar
  autoUpdater.logger = null
  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: undefined }))
  autoUpdater.on('update-not-available', () => set({ status: 'none', checkedAt: Date.now(), version: undefined, percent: undefined }))
  autoUpdater.on('update-available', (i) => {
    const notes = typeof i.releaseNotes === 'string' ? i.releaseNotes.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : Array.isArray(i.releaseNotes) ? i.releaseNotes.map((n) => n.note ?? '').join(' ').replace(/<[^>]+>/g, ' ').trim() : ''
    set({ status: auto() ? 'downloading' : 'available', version: i.version, notes: clip(notes, 600), percent: 0, checkedAt: Date.now() })
  })
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => set({ status: 'ready', version: i.version, percent: 100 }))
  autoUpdater.on('error', (e) => set({ status: 'error', error: explain(e), checkedAt: Date.now() }))
}

/** Busca una versión nueva. Con la descarga automática apagada, avisa y espera a que el usuario la descargue. */
export async function check(): Promise<UpdateState> {
  if (!app.isPackaged) return state
  wire()
  if (['checking', 'downloading', 'ready'].includes(state.status)) return state
  autoUpdater.autoDownload = auto()
  applyToken()
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    if (state.status !== 'error') set({ status: 'error', error: explain(e as Error), checkedAt: Date.now() })
  }
  return state
}

export async function download(): Promise<void> {
  if (!app.isPackaged || state.status !== 'available') return
  set({ status: 'downloading', percent: 0 })
  applyToken()
  try {
    await autoUpdater.downloadUpdate()
  } catch (e) {
    set({ status: 'error', error: explain(e as Error) })
  }
}

/** Cierra la app, instala la versión descargada y la vuelve a abrir. Los datos no se tocan. */
export function install(): void {
  if (state.status !== 'ready') throw new Error('Todavía no hay una actualización descargada.')
  lifecycle.quitting = true // sin esto «cerrar a la bandeja» impediría salir
  // el instalador arranca ya, antes del cierre: se para el timer, se guarda y se matan los procesos hijo para que no bloqueen archivos
  try {
    stopActive()
    commit()
  } catch {
    /* sin datos que guardar */
  }
  cleanup()
  // isSilent=true: el Setup de NSIS corre con /S (sin asistente); el segundo true reabre la app al terminar
  autoUpdater.quitAndInstall(true, true)
}

export function initUpdater(): void {
  if (!app.isPackaged) return
  wire()
  // primera comprobación con la app ya arrancada, y luego cada 4 horas
  setTimeout(() => auto() && void check(), 30_000)
  setInterval(() => auto() && void check(), 4 * HOUR)
}
