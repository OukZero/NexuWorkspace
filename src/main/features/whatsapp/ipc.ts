import { api } from '../../api'
import { getBadges, openWhatsApp, setWhatsAppVisible } from './service'

export function registerWhatsAppApi(): void {
  api('badges:get', () => getBadges())
  api('whatsapp:open', () => openWhatsApp())
  api('whatsapp:visible', (v) => setWhatsAppVisible(v))
}
