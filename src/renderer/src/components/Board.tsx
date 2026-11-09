import { useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { taskColor, useAppearance } from '../theme'
import type { Recurrence, Status, Task } from '../../../shared/types'
import { applyFilters, isFiltering, useFilters } from '../filters'
import { taskMs, useDB, useNow } from '../store'
import { DOW, PRIO, STATUS, fmtH, isWorkTask } from '../utils'
import { useUi } from '../ui'
import { EmptyState } from './EmptyState'
import { FilterBar } from './FilterBar'
import { G } from './glyphs'

const recText = (r: Recurrence): string =>
  r.type === 'daily' ? 'todos los días' : r.type === 'weekdays' ? 'lunes a viernes' : 'semanal: ' + (r.days || []).map((d) => DOW[d]).join(' ')

export function Board(): ReactNode {
  const db = useDB()
  useAppearance()
  const ui = useUi()
  const now = useNow(30000)
  const drag = useRef<string | null>(null)
  const [over, setOver] = useState<Status | null>(null)

  const [dragging, setDragging] = useState<string | null>(null)
  const filters = useFilters()
  const [showFilters, setShowFilters] = useState(false)
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
      data-pc={taskColor(t) ? '1' : undefined}
      style={taskColor(t) ? ({ '--pc': taskColor(t) } as CSSProperties) : undefined}
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
        {t.priority === 'high' && <span className="chip high">{PRIO.high}</span>}
        {taskMs(db, t.id, now) > 0 && <span>{fmtH(taskMs(db, t.id, now)).replace('.', ',')} h</span>}
        <span className="card-hv">
          <button
            className="ib"
            title="Chat de la tarea"
            aria-label="Chat de la tarea"
            onClick={(e) => {
              e.stopPropagation()
              ui.openChat(t.id)
            }}
          >
            <G n="chat" size={15} />
          </button>
          <button
            className="ib"
            title="Editar"
            aria-label="Editar la tarea"
            onClick={(e) => {
              e.stopPropagation()
              ui.editTask(t)
            }}
          >
            <G n="edit" size={15} />
          </button>
        </span>
      </div>
    </div>
  )

  return (
    <>
      <h1 className="day-h">
        Tablero
        <span className="grow" />
        <button className={`ib ${showFilters || isFiltering(filters) ? 'on' : ''}`} title="Filtrar y ordenar" aria-label="Filtrar y ordenar" aria-pressed={showFilters} onClick={() => setShowFilters((v) => !v)}>
          <G n="filter" size={16} />
        </button>
      </h1>
      <div className="sub">Arrastra las tarjetas entre columnas</div>
      {(showFilters || isFiltering(filters)) && <FilterBar />}
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
      <div className="lbl">Rutinas recurrentes</div>
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
