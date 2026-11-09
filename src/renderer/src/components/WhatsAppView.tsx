import type { ReactNode } from 'react'
import { WebAnchor } from './webHost'

const SLOT = { id: 'wsp', partition: 'persist:whatsapp', kind: 'wsp', url: 'https://web.whatsapp.com/' } as const

/**
 * Vista «WhatsApp»: reserva el hueco; la página (un <webview> con sesión propia, ver webHost.tsx) se coloca encima y sigue
 * viva al salir de la vista, así siguen llegando los avisos y el contador de no leídos.
 */
export function WhatsAppView(): ReactNode {
  return <WebAnchor slot={SLOT} className="wsp-host" onActive={(v) => void window.api.call('whatsapp:visible', v).catch(() => undefined)} />
}
