import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { Task } from '../../../shared/types'
import { applyFilters, isFiltering, useFilters } from '../filters'
import { msToday, useDB, useNow } from '../store'
import { dayKey, fmtH, isWorkTask } from '../utils'
import { useUi } from '../ui'
import { EmptyState } from './EmptyState'
import { FilterBar } from './FilterBar'
import { G } from './glyphs'
import { TaskRow } from './TaskRow'
import { MeetingsCard } from './MeetingsCard'

function Section({ title, tasks }: { title: string; tasks: Task[] }): ReactNode {
  if (!tasks.length) return null
  return (
    <>
      <div className="lbl">
        {title} · {tasks.length}
      </div>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
    </>
  )
}

/** Anillo con las horas registradas hoy frente al objetivo diario. */
function DayProgress(): ReactNode {
  const db = useDB()
  const now = useNow(30000)
  const ms = msToday(db, now)
  const target = db.settings.targetHours
  const p = Math.min(1, target ? ms / (target * 3600000) : 0)
  const c = 2 * Math.PI * 15
  return (
    <>
      <svg className="ring" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15" stroke="var(--line)" />
        <circle cx="18" cy="18" r="15" stroke="var(--accent2)" strokeDasharray={`${p * c} ${c}`} strokeLinecap="round" />
      </svg>
      <span className="ring-l">
        {fmtH(ms).replace('.', ',')} h de {target} h
      </span>
    </>
  )
}

export function Today(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [title, setTitle] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const filters = useFilters()
  const [showFilters, setShowFilters] = useState(() => isFiltering(filters))

  // enfoca la captura rápida al entrar y cuando llega el atajo global
  useEffect(() => {
    input.current?.focus()
  }, [ui.quickTick])

  const open = applyFilters(db.tasks.filter(isWorkTask), filters)
  const list = (s: Task['status']): Task[] => open.filter((t) => t.status === s)
  const doing = list('doing')
  const review = list('review')
  const today = list('today')
  const next = list('next')
  const todayKey = dayKey(new Date())
  const doneToday = open.filter((t) => t.status === 'done' && t.doneAt && dayKey(new Date(t.doneAt)) === todayKey)
  const date = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

  const quickAdd = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter' || !title.trim()) return
    const t = title.trim()
    setTitle('')
    void ui.run('task:save', { title: t, status: 'today' })
  }

  return (
    <div className="wrap">
      <h1 className="day-h">
        Hoy
        <DayProgress />
      </h1>
      <div className="sub">{date}</div>
      <div className="add">
        <G n="plus" />
        <input ref={input} value={title} placeholder="Nueva tarea…  Intro para añadir" aria-label="Nueva tarea para hoy" onChange={(e) => setTitle(e.target.value)} onKeyDown={quickAdd} />
        <button className="ib" title="Tarea detallada: descripción, carpeta, estimación…" aria-label="Crear tarea detallada" onClick={() => ui.editTask({ title })}>
          <G n="edit" size={16} />
        </button>
        <button className={`ib ${showFilters || isFiltering(filters) ? 'on' : ''}`} title="Filtrar y ordenar" aria-label="Filtrar y ordenar" aria-pressed={showFilters} onClick={() => setShowFilters((v) => !v)}>
          <G n="filter" size={16} />
        </button>
        <kbd>↵</kbd>
      </div>
      {(showFilters || isFiltering(filters)) && <FilterBar />}
      <MeetingsCard />
      <Section title="En curso" tasks={doing} />
      <Section title="Para hoy" tasks={today} />
      <Section title="En revisión" tasks={review} />
      {!doing.length && !today.length && (
        <EmptyState
          kind="tasks"
          title={isFiltering(filters) ? 'Ninguna tarea coincide con los filtros' : 'Nada pendiente para hoy'}
          text={isFiltering(filters) ? 'Prueba con otros filtros o límpialos.' : 'Escribe una tarea arriba y pulsa Intro, o usa Ctrl+Alt+N desde cualquier programa.'}
        />
      )}
      <Section title="Próximas" tasks={next.slice(0, 8)} />
      <Section title="Completadas hoy" tasks={doneToday} />
    </div>
  )
}
