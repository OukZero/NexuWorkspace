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

/** Color de cada columna (borde superior), según el estado. */
const COL: Partial<Record<Status, string>> = {
  next: 'var(--muted)',
  today: 'var(--warn)',
  doing: 'var(--accent)',
  review: 'var(--pink, #ff7ab6)',
  done: 'var(--ok)'
}

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
      className={`kb-card p-${t.priority} ${dragging === t.id ? 'dragging' : ''}`}
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
      <div className="t">{t.title}</div>
      <div className="m">
        <span className="kb-meta">
          {t.project && <span className="chip">{t.project}</span>}
          {t.priority === 'high' && <span className="chip prio">{PRIO.high}</span>}
          {taskMs(db, t.id, now) > 0 && <span>{fmtH(taskMs(db, t.id, now)).replace('.', ',')} h</span>}
        </span>
        <span className="kb-actions">
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
      <div className="kb-bar">
        <span className="grow" />
        <button className={`btn sm ${showFilters || isFiltering(filters) ? 'on' : ''}`} aria-pressed={showFilters} onClick={() => setShowFilters((v) => !v)}>
          <G n="filter" size={15} /> Filtrar
        </button>
        <button className="btn p sm" onClick={() => ui.editTask({})}>
          <G n="plus" size={15} /> Nueva tarea
        </button>
      </div>
      {(showFilters || isFiltering(filters)) && <FilterBar />}
      <div className="kb">
        {statuses.map((st) => {
          const arr = open.filter((t) => t.status === st && (st !== 'done' || (t.doneAt || 0) > cutoff))
          return (
            <div
              key={st}
              className={`kb-col ${over === st ? 'over' : ''}`}
              style={{ '--c': COL[st] ?? 'var(--accent)' } as CSSProperties}
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
              <header>
                <b>{STATUS[st]}</b>
                <span>{arr.length}</span>
              </header>
              <div className="kb-cards">{arr.map(card)}</div>
            </div>
          )
        })}
      </div>
      <section className="bc kb-routines">
        <div className="kb-routines-h">
          <span className="eyebrow">Rutinas recurrentes</span>
          <button className="btn sm" onClick={() => ui.editTask({})}>
            Crear rutina
          </button>
        </div>
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
          <EmptyState kind="routines" title="Sin rutinas todavía" text="Marca una tarea como recurrente: el daily, el reporte semanal o la imputación de horas se crean solos cada día." />
        )}
      </section>
    </>
  )
}
