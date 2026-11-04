import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Recurrence, Status, Task } from '../../../shared/types'
import { applyFilters, useFilters } from '../filters'
import { taskMs, useDB, useNow } from '../store'
import { DOW, PRIO, STATUS, fmtH, isWorkTask } from '../utils'
import { useUi } from '../ui'
import { EmptyState } from './EmptyState'
import { FilterBar } from './FilterBar'

const recText = (r: Recurrence): string =>
  r.type === 'daily' ? 'todos los días' : r.type === 'weekdays' ? 'lunes a viernes' : 'semanal: ' + (r.days || []).map((d) => DOW[d]).join(' ')

export function Board(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const now = useNow(30000)
  const drag = useRef<string | null>(null)
  const [over, setOver] = useState<Status | null>(null)

  const [dragging, setDragging] = useState<string | null>(null)
  const filters = useFilters()
  const open = applyFilters(db.tasks.filter(isWorkTask), filters)
  const cutoff = Date.now() - 7 * 86400000
  const routines = db.tasks.filter((t) => t.recurrence && t.recurrence.type !== 'none')
  const statuses = Object.keys(STATUS) as Status[]

  const drop = (status: Status): void => {
    setOver(null)
    const id = drag.current
    drag.current = null
    setDragging(null)
    if (!id) return
    if (status === 'done' && db.tasks.find((t) => t.id === id)?.status !== 'done') ui.celebrate()
    void ui.run('task:save', { id, status })
  }

  const card = (t: Task): ReactNode => (
    <div
      key={t.id}
      className={`card p-${t.priority} ${dragging === t.id ? 'dragging' : ''}`}
      draggable
      onDragStart={() => {
        drag.current = t.id
        setDragging(t.id)
      }}
      onDragEnd={() => {
        drag.current = null
        setDragging(null)
        setOver(null)
      }}
      onClick={() => ui.openTask(t)}
    >
      <div className="title">{t.title}</div>
      <div className="meta">
        {t.project && <span className="chip">{t.project}</span>}
        <span className={`chip ${t.priority}`}>{PRIO[t.priority]}</span>
        {taskMs(db, t.id, now) > 0 && <span>⏱ {fmtH(taskMs(db, t.id, now))} h</span>}
        <button
          className="icon"
          style={{ marginLeft: 'auto' }}
          onClick={(e) => {
            e.stopPropagation()
            ui.openChat(t.id)
          }}
        >
          💬
        </button>
        <button
          className="icon"
          onClick={(e) => {
            e.stopPropagation()
            ui.editTask(t)
          }}
        >
          ✎
        </button>
      </div>
    </div>
  )

  return (
    <>
      <h1>Tablero</h1>
      <div className="sub">Arrastra las tarjetas entre columnas · el borde de color indica la prioridad</div>
      <FilterBar />
      <div className="board">
        {statuses.map((st) => {
          const arr = open.filter((t) => t.status === st && (st !== 'done' || (t.doneAt || 0) > cutoff))
          return (
            <div
              key={st}
              className={`col ${over === st ? 'over' : ''}`}
              onDragOver={(e) => {
                if (!drag.current) return
                e.preventDefault()
                setOver(st)
              }}
              onDragLeave={() => setOver((o) => (o === st ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                drop(st)
              }}
            >
              <h4>
                <span>{STATUS[st]}</span>
                <span>{arr.length}</span>
              </h4>
              {arr.map(card)}
            </div>
          )
        })}
      </div>
      <h3>Rutinas recurrentes</h3>
      {routines.length ? (
        routines.map((t) => (
          <div key={t.id} className="row" onClick={() => ui.editTask(t)}>
            <div className="main">
              <div className="title">{t.title}</div>
              <div className="meta">
                <span className="chip">↻ {recText(t.recurrence)}</span>
                {t.project && <span className="chip">{t.project}</span>}
              </div>
            </div>
          </div>
        ))
      ) : (
        <EmptyState kind="routines" title="Sin rutinas todavía" text="Crea una tarea y márcala como recurrente: el daily, el reporte, la imputación de horas…" />
      )}
    </>
  )
}
