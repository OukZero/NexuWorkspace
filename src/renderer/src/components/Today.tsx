import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { Task } from '../../../shared/types'
import { applyFilters, isFiltering, useFilters } from '../filters'
import { useDB } from '../store'
import { dayKey, isWorkTask } from '../utils'
import { useUi } from '../ui'
import { EmptyState } from './EmptyState'
import { FilterBar } from './FilterBar'
import { TaskRow } from './TaskRow'

function Section({ title, tasks }: { title: string; tasks: Task[] }): ReactNode {
  if (!tasks.length) return null
  return (
    <>
      <h3>
        {title} · {tasks.length}
      </h3>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
    </>
  )
}

export function Today(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [title, setTitle] = useState('')
  const input = useRef<HTMLInputElement>(null)

  // enfoca la captura rápida al entrar y cuando llega el atajo global
  useEffect(() => {
    input.current?.focus()
  }, [ui.quickTick])

  const filters = useFilters()
  const open = applyFilters(db.tasks.filter(isWorkTask), filters)
  const list = (s: Task['status']): Task[] => open.filter((t) => t.status === s)
  const doing = list('doing')
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
    <>
      <h1>Hoy</h1>
      <div className="sub">{date} · click en una tarea abre Claude en su carpeta</div>
      <div className="quick">
        <input
          ref={input}
          value={title}
          placeholder="Nueva tarea para hoy… (Enter)"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={quickAdd}
        />
        <button className="btn primary" onClick={() => ui.editTask({ title })}>
          Detallada
        </button>
      </div>
      <FilterBar />
      <Section title="En curso" tasks={doing} />
      <Section title="Para hoy" tasks={today} />
      {!doing.length && !today.length && (
        <EmptyState
          kind="tasks"
          title={isFiltering(filters) ? 'Ninguna tarea coincide con los filtros' : 'Nada pendiente para hoy'}
          text={isFiltering(filters) ? 'Prueba con otros filtros o límpialos.' : 'Escribe una tarea arriba y pulsa Enter, o usa Ctrl+Alt+N desde cualquier programa.'}
        />
      )}
      <Section title="Próximas" tasks={next.slice(0, 8)} />
      <Section title="Completadas hoy" tasks={doneToday} />
    </>
  )
}
