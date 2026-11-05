import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Chat, Provider } from '../../../shared/types'
import { clip } from '../../../shared/util'
import { convLabel } from '../conversations'
import { findTask, useDB } from '../store'
import { useUi } from '../ui'
import { EmptyState } from './EmptyState'
import { Select } from './Select'

const MAX_SHOWN = 200

const when = (ts: number): string => {
  const d = new Date(ts)
  const today = new Date()
  const same = d.toDateString() === today.toDateString()
  const hm = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  return same ? `Hoy ${hm}` : `${d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })} ${hm}`
}

/** Última actividad de la conversación (último mensaje o, si no hay, su creación). */
const lastTs = (c: Chat): number => c.messages[c.messages.length - 1]?.ts || c.createdAt

/** Fragmento del mensaje que coincide con la búsqueda, o el último mensaje si no hay búsqueda. */
function snippet(c: Chat, q: string): string {
  const real = c.messages.filter((m) => m.role !== 'system')
  if (q) {
    const hit = real.find((m) => m.text.toLowerCase().includes(q))
    if (hit) {
      const i = hit.text.toLowerCase().indexOf(q)
      const from = Math.max(0, i - 50)
      return (from > 0 ? '…' : '') + clip(hit.text.slice(from).replace(/\s+/g, ' '), 140)
    }
  }
  const last = real[real.length - 1]
  return last ? `${last.role === 'user' ? 'Tú: ' : ''}${clip(last.text.replace(/\s+/g, ' '), 140)}` : 'Sin mensajes'
}

/** Todas las conversaciones de todas las tareas, abiertas y cerradas, con búsqueda en su contenido. */
export function History(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [query, setQuery] = useState('')
  const [task, setTask] = useState('')
  const [prov, setProv] = useState('')
  const [state, setState] = useState('')

  const all = useMemo(
    () =>
      Object.entries(db.chats)
        .filter(([, c]) => c.messages.some((m) => m.role !== 'system') || c.running)
        .map(([id, chat]) => ({ id, chat, task: findTask(db, chat.taskId) }))
        .sort((a, b) => lastTs(b.chat) - lastTs(a.chat)),
    [db]
  )

  const taskOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of all) if (r.task) seen.set(r.task.id, r.task.title)
    return [{ value: '', label: 'Todas las tareas' }, ...[...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([v, label]) => ({ value: v, label }))]
  }, [all])

  const q = query.trim().toLowerCase()
  const rows = all.filter(({ chat, task: t }) => {
    if (task && chat.taskId !== task) return false
    if (prov && (chat.provider ?? 'claude') !== prov) return false
    if (state === 'open' && chat.closed) return false
    if (state === 'closed' && !chat.closed) return false
    if (!q) return true
    return (
      convLabel(chat).toLowerCase().includes(q) ||
      (t?.title ?? '').toLowerCase().includes(q) ||
      chat.messages.some((m) => m.text.toLowerCase().includes(q))
    )
  })

  const open = async (id: string, taskId: string, closed?: boolean): Promise<void> => {
    if (!findTask(db, taskId)) return ui.toast('La tarea de esta conversación ya no existe', true)
    if (closed) await ui.run('chat:reopen', id)
    ui.openChat(taskId, id)
  }

  return (
    <>
      <h1>Historial</h1>
      <div className="sub">Todas tus conversaciones, abiertas y cerradas. La búsqueda mira también dentro de los mensajes.</div>
      <div className="filters" role="search">
        <input className="f-q" value={query} placeholder="Buscar en conversaciones…" aria-label="Buscar en conversaciones" onChange={(e) => setQuery(e.target.value)} />
        <Select value={task} ariaLabel="Tarea" searchable onChange={setTask} options={taskOptions} menuMinWidth={260} />
        <Select
          value={prov}
          ariaLabel="Proveedor"
          onChange={setProv}
          options={[
            { value: '', label: 'Claude y Copilot' },
            { value: 'claude', label: 'Solo Claude' },
            { value: 'copilot', label: 'Solo Copilot' }
          ]}
        />
        <Select
          value={state}
          ariaLabel="Estado"
          onChange={setState}
          options={[
            { value: '', label: 'Abiertas y cerradas' },
            { value: 'open', label: 'Abiertas' },
            { value: 'closed', label: 'Cerradas' }
          ]}
        />
        {(query || task || prov || state) && (
          <button
            className="btn sm"
            onClick={() => {
              setQuery('')
              setTask('')
              setProv('')
              setState('')
            }}
          >
            Limpiar
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState kind="chart" title={all.length ? 'Nada coincide con tu búsqueda' : 'Aún no hay conversaciones'} text={all.length ? 'Prueba con otras palabras o quita los filtros.' : 'Aparecen aquí cuando chateas desde una tarea.'} />
      ) : (
        <div className="hist">
          {rows.slice(0, MAX_SHOWN).map(({ id, chat, task: t }) => {
            const p: Provider = chat.provider ?? 'claude'
            return (
              <button key={id} className="hist-row" onClick={() => void open(id, chat.taskId, chat.closed)}>
                <div className="hist-h">
                  <b className="hist-t">{convLabel(chat)}</b>
                  <span className={`chip prov-${p}`}>{p === 'copilot' ? 'Copilot' : 'Claude'}</span>
                  {chat.model && <span className="chip">{chat.model}</span>}
                  {chat.closed && <span className="chip">cerrada</span>}
                  {chat.running && <span className="chip">respondiendo…</span>}
                  <span className="hist-d">{when(lastTs(chat))}</span>
                </div>
                <div className="meta">
                  {t?.title ?? '(tarea borrada)'}
                  {t?.client ? ` · ${t.client}` : ''} · {chat.messages.filter((m) => m.role !== 'system').length} mensajes
                </div>
                <div className="hist-s">{snippet(chat, q)}</div>
              </button>
            )
          })}
          {rows.length > MAX_SHOWN && <div className="meta" style={{ padding: 8 }}>Mostrando las {MAX_SHOWN} más recientes de {rows.length}. Afina la búsqueda para ver el resto.</div>}
        </div>
      )}
    </>
  )
}
