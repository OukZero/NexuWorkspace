import { api } from '../../api'
import { attachWhatsApp, WSP_SLOT } from '../whatsapp/service'
import { attachGuest, markActive } from './service'

/** Páginas <webview> del navegador y de WhatsApp (que comparte el mismo canal de enganche). */
export function registerWebIpc(): void {
  api('web:attach', (id, wcId, kind) => (id === WSP_SLOT && kind === 'wsp' ? attachWhatsApp(wcId) : kind === 'web' && id !== WSP_SLOT ? !!attachGuest(id, wcId, 'web') : false))
  api('web:active', (id) => markActive(id))
}
