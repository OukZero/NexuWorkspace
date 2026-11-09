import type { ReactNode } from 'react'
import { closedConvs, convLabel, openConvs } from '../conversations'
import { setConvsOpen, useConvsPane } from '../convsPane'
import { useDB } from '../store'
import { useUi } from '../ui'
import { G } from './glyphs'

interface Props {
  taskId: string
  active: string | null
  unread: Set<string>
  onSelect(convId: string): void
  onClose(convId: string): void
  onNew(): void
  /** Abre el diálogo «＋» (otra tarea o conversaciones cerradas). */
  onMore(): void
}

const DAY = 86400000
const startOfDay = (ts: number): number => new Date(new Date(ts).toDateString()).getTime()

/** Etiqueta del grupo según cuándo fue lo último que pasó en la conversación. */
function bucket(ts: number, now: number): string {
  const d = startOfDay(now) - startOfDay(ts)
  if (d <= 0) return 'Hoy'
  if (d <= DAY) return 'Ayer'
  if (d <= 6 * DAY) return 'Esta semana'
  return 'Antes'
}

function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'ahora'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  if (startOfDay(ts) === startOfDay(now)) return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  return new Date(ts).toLocaleDateString('es', { weekday: 'short', day: 'numeric' })
}

/** Lista de conversaciones de la tarea (a la izquierda del chat), agrupadas por día. */
export function ConvPane({ taskId, active, unread, onSelect, onClose, onNew, onMore }: Props): ReactNode {
  const db = useDB()
  const pane = useConvsPane()
  const ui = useUi()
  if (!pane.open) return null
  const now = Date.now()
  const convs = openConvs(db, taskId)
    .map((c) => ({ ...c, last: c.chat.messages[c.chat.messages.length - 1]?.ts || c.chat.createdAt }))
    .sort((a, b) => b.last - a.last)
  const hidden = closedConvs(db, taskId).length
  const groups: Array<[string, typeof convs]> = []
  for (const c of convs) {
    const b = bucket(c.last, now)
    const g = groups.find((x) => x[0] === b)
    if (g) g[1].push(c)
    else groups.push([b, [c]])
  }

  return (
    <section className="pane sessp" aria-label="Conversaciones de la tarea">
      <div className="ph">
        <b>Conversaciones</b>
        <span className="grow" />
        <button className="mini" title="Nueva conversación en esta tarea" aria-label="Nueva conversación" onClick={onNew}>
          <G n="plus" size={15} />
        </button>
        <button className="mini" title="Abrir una conversación cerrada o de otra tarea" aria-label="Más conversaciones" onClick={onMore}>
          <G n="more" size={15} />
        </button>
        <button className="mini" title="Ocultar esta lista" aria-label="Ocultar la lista de conversaciones" onClick={() => setConvsOpen(false)}>
          <G n="list" size={15} />
        </button>
      </div>
      <div className="ss">
        {groups.map(([label, list]) => (
          <div key={label}>
            <div className="sl">{label}</div>
            {list.map(({ id, chat, last }) => (
              <div
                key={id}
                className={`sess ${active === id ? 'on' : ''}`}
                role="button"
                tabIndex={0}
                title={convLabel(chat)}
                onClick={() => onSelect(id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(id))}
                onAuxClick={(e) => e.button === 1 && onClose(id)}
              >
                <b>{convLabel(chat)}</b>
                <small>
                  <i className={`sd ${chat.running ? 'run' : unread.has(id) ? 'unread' : ''}`} aria-hidden />
                  {chat.messages.filter((m) => m.role !== 'system').length} mensajes · {chat.running ? 'respondiendo…' : unread.has(id) ? 'sin leer' : ago(last, now)}
                </small>
                <button
                  className="sess-x"
                  title="Cerrar la conversación (se puede reabrir desde «Más…»)"
                  aria-label="Cerrar la conversación"
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose(id)
                  }}
                >
                  <G n="x" size={12} stroke={2.2} />
                </button>
              </div>
            ))}
          </div>
        ))}
        {!convs.length && <div className="meta" style={{ padding: 10 }}>Sin conversaciones abiertas.</div>}
      </div>
      <div className="pf">
        <button className="btn sm" onClick={() => ui.go('history')} title={hidden > 0 ? `Hay ${hidden} conversación${hidden > 1 ? 'es' : ''} cerrada${hidden > 1 ? 's' : ''}: se reabren desde el Historial` : 'Todas tus conversaciones, abiertas y cerradas'}>
          Ver todas en Historial
        </button>
      </div>
    </section>
  )
}
