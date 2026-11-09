import { ipcMain, type WebContents } from 'electron'
import { withDot } from './badge'
import { notify } from './notify'
import { attachGuest } from './web'
import { emit, getMain, showWin } from './windows'
import { setUnreadBadge } from './tray'

/**
 * WhatsApp Web dentro de la ventana principal (vista «WhatsApp»), sin IA ni lectura de mensajes por parte de la app.
 * - La página es un <webview> de la interfaz (renderer/components/webHost.tsx) con sesión propia y persistente (el QR se escanea una vez).
 * - Cada aviso de la página (new Notification) pasa a la campanita y al aviso de Windows.
 * - El número de no leídos sale del título de la página, «(3) WhatsApp»: se muestra en la barra lateral, la barra de tareas y la bandeja.
 * Al salir de la vista la página sigue viva (así siguen llegando los avisos); se destruye al cerrar la ventana principal.
 */

/** Id fijo de la página de WhatsApp en la interfaz. */
export const WSP_SLOT = 'wsp'

let guest: WebContents | null = null
let unread = 0
let visible = false // la vista de WhatsApp está a la vista del usuario

/** «(3) WhatsApp» → 3; sin número → 0. */
const countOf = (title: string): number => {
  const m = /^\((\d+)\+?\)/.exec(title)
  return m ? Number(m[1]) : 0
}

function setUnread(n: number): void {
  if (n === unread) return
  unread = n
  const main = getMain()
  if (main && !main.isDestroyed()) main.setOverlayIcon(n > 0 ? withDot(null, 16) : null, n > 0 ? `${n} sin leer` : '')
  setUnreadBadge(n)
  emit('badges', getBadges())
}

export function getUnread(): number {
  return unread
}

/** Sin leer por vista de la barra lateral. */
export function getBadges(): Record<string, number> {
  return { whatsapp: unread }
}

/** El renderer avisa de que la página de WhatsApp ya está lista: se vigila su título (no leídos). */
export function attachWhatsApp(wcId: number): boolean {
  const wc = attachGuest(WSP_SLOT, wcId, 'wsp')
  if (!wc) return false
  guest = wc
  wc.on('page-title-updated', (_e, title) => setUnread(countOf(title)))
  wc.once('destroyed', () => {
    if (guest === wc) guest = null
    setUnread(0)
  })
  setUnread(countOf(wc.getTitle()))
  return true
}

/** La vista de WhatsApp se muestra u oculta (para no duplicar el aviso de Windows cuando la estás viendo). */
export function setWhatsAppVisible(v: boolean): void {
  visible = v
}

/** Lleva a la vista de WhatsApp dentro de la app (desde el menú, la bandeja o un aviso). */
export function openWhatsApp(): void {
  showWin()
  emit('goto', 'whatsapp')
}

/** Canal de los avisos de la página inyectada (src/preload/wsp.ts). */
export function registerWhatsAppIpc(): void {
  ipcMain.on('wsp:notify', (e, title: unknown, body: unknown) => {
    if (!guest || guest.isDestroyed() || e.sender !== guest) return
    const t = typeof title === 'string' ? title.slice(0, 120) : ''
    const b = typeof body === 'string' ? body.slice(0, 300) : ''
    const main = getMain()
    // con WhatsApp a la vista no hace falta el aviso de Windows; el aviso queda en la campanita igual
    const seen = visible && !!main && main.isFocused()
    notify({
      kind: 'whatsapp',
      title: t ? `WhatsApp · ${t}` : 'WhatsApp',
      body: b,
      os: !seen,
      tg: false, // los mensajes personales no se reenvían a Telegram
      onClick: openWhatsApp
    })
  })
}
