import { api } from '../../api'
import * as calendar from './service'

/** Calendario y bloques de enfoque. */
export function registerCalendarIpc(): void {
  api('calendar:status', async () => {
    await calendar.ensureLoaded() // la sesión cifrada se lee de forma asíncrona
    return calendar.getStatus()
  })
  api('calendar:save', (c) => calendar.saveSettings(c))
  api('calendar:connect', () => calendar.connect())
  api('calendar:disconnect', () => calendar.disconnect())
  api('calendar:events', (force) => calendar.listEvents(!!force))
  api('focus:save', (b) => calendar.saveFocusBlock(b))
  api('focus:delete', (id) => calendar.deleteFocusBlock(id))
}
