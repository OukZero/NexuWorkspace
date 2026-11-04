import { useState } from 'react'
import type { ReactNode } from 'react'
import { closedConvs, convLabel } from '../conversations'
import { findTask, useDB } from '../store'
import { isWorkTask } from '../utils'
import { useUi } from '../ui'

/** Diálogo del «＋»: nueva conversación en la tarea actual, abrir otra tarea o reabrir una conversación cerrada. */
export function NewTabModal({ onClose }: { onClose: () => void }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [q, setQ] = useState('')
  const current = findTask(db, ui.activeTask)
  const closed = current ? closedConvs(db, current.id).slice(0, 6) : []
  const tasks = db.tasks
    .filter((t) => isWorkTask(t) && t.status !== 'done' && t.id !== current?.id)
    .filter((t) => `${t.title} ${t.project} ${t.client}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 30)

  return (
    <div className="dialog">
      <h2>Abrir una pestaña</h2>
      <div className="sub">Cada conversación tiene su propio contexto, así que puedes hacer varias cosas a la vez, en la misma tarea o en tareas distintas.</div>

      {current && (
        <button
          className="choice"
          onClick={() => {
            onClose()
            ui.newConversation(current.id)
          }}
        >
          <b>＋ Nueva conversación en «{current.title}»</b>
          <span>Empieza con el contexto limpio y se suma a las pestañas de esta tarea. Útil para trabajar en paralelo en la misma tarea.</span>
        </button>
      )}

      <div className="choice static">
        <b>Abrir {current ? 'otra' : 'una'} tarea</b>
        <span>Se abre su pestaña con sus propias conversaciones.</span>
        <input value={q} placeholder="Buscar tarea…" autoFocus={!current} onChange={(e) => setQ(e.target.value)} />
        <div className="choicelist">
          {tasks.map((t) => (
            <button
              key={t.id}
              disabled={!t.folder}
              title={t.folder ? t.folder : 'Asigna una carpeta a la tarea para chatear'}
              onClick={() => {
                onClose()
                ui.openChat(t.id)
              }}
            >
              {t.title}
              <span className="meta"> {t.folder ? t.project : 'sin carpeta'}</span>
            </button>
          ))}
          {!tasks.length && <div className="meta">No hay tareas que coincidan.</div>}
        </div>
      </div>

      {closed.length > 0 && current && (
        <div className="choice static">
          <b>Reabrir una conversación anterior de esta tarea</b>
          <div className="choicelist">
            {closed.map(({ id, chat }) => (
              <button
                key={id}
                onClick={async () => {
                  onClose()
                  await ui.run('chat:reopen', id)
                  ui.openChat(current.id, id)
                }}
              >
                {convLabel(chat)}
                <span className="meta"> {new Date(chat.createdAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="foot">
        <span className="sp" />
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
