import { app, session, shell, webContents as allWebContents, type WebContents } from 'electron'
import path from 'path'
import { normalizeWebUrl } from '../shared/util'
import { getMain } from './windows'

/**
 * Páginas web dentro de la app (paneles y pestañas «Web», WhatsApp). Cada una es un <webview> que vive en la interfaz
 * (renderer/components/webHost.tsx): al estar dentro del propio documento, los menús y diálogos de la app se dibujan encima
 * sin trucos y no hay que sincronizar posiciones. Este módulo solo endurece y configura cada página cuando se crea.
 */

export const normalizeUrl = normalizeWebUrl

/** Particiones permitidas: sesión persistente propia para los sitios web y otra para WhatsApp. */
const PARTITIONS = new Set(['persist:web', 'persist:whatsapp'])
const WSP_PRELOAD = path.join(__dirname, '../preload/wsp.js')
const ID = /^[A-Za-z0-9_-]{1,40}$/

const guests = new Map<string, WebContents>()
let lastActive: string | null = null

/** User-Agent de Chrome con la versión de Chromium de Electron y sin la marca «Electron» (algunos sitios rechazan el por defecto). */
export const chromeUserAgent = (): string => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`

/** Endurece cada <webview> antes de que se cree: solo particiones conocidas, solo http(s), sin Node, y el preload lo decide la app. */
export function initWebviews(): void {
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (e, prefs, params) => {
      const partition = String(params.partition ?? '')
      const src = normalizeWebUrl(String(params.src ?? ''))
      if (!PARTITIONS.has(partition) || !src) return e.preventDefault()
      delete (prefs as { preloadURL?: string }).preloadURL
      delete prefs.preload
      if (partition === 'persist:whatsapp') prefs.preload = WSP_PRELOAD
      prefs.nodeIntegration = false
      prefs.nodeIntegrationInSubFrames = false
      prefs.contextIsolation = true
      prefs.sandbox = true
      prefs.webSecurity = true
      params.src = src
      params.allowpopups = undefined as never
    })
  })
  // sin cámara, micrófono, ubicación ni notificaciones nativas (las de WhatsApp se reenvían por el preload); solo copiar y pantalla completa
  session.fromPartition('persist:web').setPermissionRequestHandler((_wc, p, cb) => cb(p === 'clipboard-sanitized-write' || p === 'fullscreen'))
}

export interface GuestPolicy {
  /** Qué hacer con una dirección que intenta abrir una ventana nueva o salir de la página. */
  external: (url: string) => boolean
}

/** Registra la página de un <webview> ya creado (el renderer manda su id al estar lista). Devuelve su WebContents o null si no es válida. */
export function attachGuest(slotId: string, wcId: number, kind: 'web' | 'wsp'): WebContents | null {
  const main = getMain()
  const wc = allWebContents.fromId(wcId)
  if (!ID.test(slotId) || !main || main.isDestroyed() || !wc || wc.isDestroyed()) return null
  // solo se aceptan páginas incrustadas en la ventana principal
  if (wc.getType() !== 'webview' || wc.hostWebContents?.id !== main.webContents.id) return null
  guests.set(slotId, wc)
  wc.setUserAgent(chromeUserAgent())
  wc.setWindowOpenHandler(({ url }) => {
    if (kind === 'wsp') {
      if (!isWhatsApp(url)) {
        const n = normalizeWebUrl(url)
        if (n) void shell.openExternal(n)
      }
    } else {
      const n = normalizeWebUrl(url)
      if (n) void wc.loadURL(n).catch(() => undefined) // las ventanas emergentes se abren en la misma página
    }
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    if (kind === 'wsp' && isWhatsApp(url)) return
    if (kind === 'web' && normalizeWebUrl(url)) return
    e.preventDefault() // nada de file:, javascript: ni protocolos propios
    const n = normalizeWebUrl(url)
    if (kind === 'wsp' && n) void shell.openExternal(n)
  })
  wc.once('destroyed', () => {
    if (guests.get(slotId) === wc) guests.delete(slotId)
  })
  return wc
}

export const isWhatsApp = (url: string): boolean => {
  try {
    const h = new URL(url).hostname
    return h === 'whatsapp.com' || h.endsWith('.whatsapp.com')
  } catch {
    return false
  }
}

export const guestOf = (slotId: string): WebContents | undefined => guests.get(slotId)

/** La página que se acaba de mostrar es la que el usuario está viendo (la que Claude lee con el contexto «Página web abierta»). */
export function markActive(slotId: string): void {
  if (guests.has(slotId)) lastActive = slotId
}

/** Texto sin procesar de la página de un panel (o de la última que estuvo a la vista). */
export async function pageTextOf(id?: string): Promise<{ url: string; title: string; text: string } | null> {
  const key = id && guests.has(id) ? id : lastActive && guests.has(lastActive) ? lastActive : null
  const wc = key ? guests.get(key) : undefined
  if (!wc || wc.isDestroyed()) return null
  try {
    const text = String(await wc.executeJavaScript('(() => { const b = document.body; return b ? (b.innerText || "") : "" })()'))
    return { url: wc.getURL(), title: wc.getTitle(), text }
  } catch {
    return null
  }
}
