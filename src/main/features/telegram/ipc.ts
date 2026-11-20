import { api } from '../../api'
import { commit, getDb } from '../../db'
import * as telegram from './service'

export function registerTelegramIpc(): void {
  api('telegram:status', () => telegram.getStatus())
  api('telegram:save', (c) => {
    const s = getDb().settings
    const token = c.token.trim()
    if (token !== (s.telegramToken ?? '')) delete s.telegramChat // otro bot: hay que vincular de nuevo
    s.telegramToken = token
    s.telegramOn = c.on && !!token
    s.telegramDetails = c.details
    commit()
    telegram.restart()
    return telegram.getStatus()
  })
  api('telegram:link', () => telegram.newLinkCode())
  api('telegram:unlink', () => {
    telegram.unlink()
    return telegram.getStatus()
  })
  api('telegram:test', () => telegram.test())
}
