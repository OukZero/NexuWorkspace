import * as Popover from '@radix-ui/react-popover'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { NotificationKind } from '../../../shared/types'
import { useDB, useNow } from '../store'
import { useUi } from '../ui'
import { G } from './glyphs'

const ICON: Record<NotificationKind, string> = { daily: '☀', reminder: '⏱', done: '✓', attention: '!', permission: '🔐', idle: '⏸', ci: '⚙', whatsapp: '💬', calendar: '📅' }
const TONE: Record<NotificationKind, string> = { daily: 'accent', reminder: 'warn', done: 'ok', attention: 'danger', permission: 'warn', idle: 'muted', ci: 'accent', whatsapp: 'ok', calendar: 'warn' }

function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'ahora'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

/** Campanita con el centro de notificaciones: todo lo que la app avisó, para volver a verlo y abrir su destino. */
export function NotificationBell({ variant = 'rail' }: { variant?: 'rail' | 'top' }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const now = useNow(60000)
  const [open, setOpen] = useState(false)
  const list = db.notifications ?? []
  const unread = list.filter((n) => !n.read).length

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className={variant === 'top' ? 'ib' : 'rb'} title={unread ? `Notificaciones · ${unread} sin leer` : 'Notificaciones'} data-tip={unread ? `Notificaciones · ${unread} sin leer` : 'Notificaciones'} aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}>
          <G n="bell" />
          {unread > 0 && <span className={variant === 'top' ? 'bd' : 'rb-badge'}>{variant === 'top' ? '' : unread > 9 ? '9+' : unread}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="notif-pop" side={variant === 'top' ? 'bottom' : 'right'} align="end" sideOffset={10} collisionPadding={12}>
          <div className="notif-head">
            <b>Notificaciones</b>
            <span className="grow" />
            <button disabled={!unread} onClick={() => void ui.run('notif:read', 'all')}>
              Marcar leídas
            </button>
            <button disabled={!list.length} onClick={() => void ui.run('notif:clear')}>
              Vaciar
            </button>
          </div>
          <div className="notif-list">
            {list.length ? (
              list.map((n) => (
                <button
                  key={n.id}
                  className={`notif-item ${n.read ? '' : 'unread'}`}
                  onClick={() => {
                    if (!n.read) void ui.run('notif:read', n.id)
                    setOpen(false)
                    if (n.goto) ui.goto(n.goto)
                  }}
                >
                  <span className={`notif-ico t-${TONE[n.kind]}`}>{ICON[n.kind]}</span>
                  <span className="notif-txt">
                    <b>{n.title}</b>
                    <span>{n.body}</span>
                    <small>
                      {ago(n.ts, now)}
                      {n.goto ? ' · ' + (n.goto.startsWith('chat:') ? 'abrir conversación' : 'abrir') : ''}
                    </small>
                  </span>
                  {!n.read && <i className="notif-dot" />}
                </button>
              ))
            ) : (
              <div className="notif-empty">Sin notificaciones por ahora.</div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
