import type { ReactNode } from 'react'
import type { Priority } from '../../../shared/types'
import { EMPTY, isFiltering, setFilters, useFilters, type SortKey } from '../filters'
import { useDB } from '../store'
import { PRIO, isWorkTask } from '../utils'
import { Select } from './Select'

const uniq = (xs: string[]): string[] => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b))

/** Búsqueda, filtros (cliente, proyecto, prioridad, etiqueta) y orden de las listas de tareas. */
export function FilterBar(): ReactNode {
  const db = useDB()
  const f = useFilters()
  const work = db.tasks.filter(isWorkTask)
  const clients = uniq(work.map((t) => t.client))
  const projects = uniq(work.filter((t) => !f.client || t.client === f.client).map((t) => t.project))
  const tags = uniq(work.flatMap((t) => t.tags ?? []))

  return (
    <div className="filters" role="search">
      <input className="f-q" value={f.q} placeholder="Filtrar tareas…" aria-label="Filtrar tareas" onChange={(e) => setFilters({ q: e.target.value })} />
      <Select
        value={f.client}
        ariaLabel="Cliente"
        onChange={(v) => setFilters({ client: v, project: '' })}
        options={[{ value: '', label: 'Todos los clientes' }, ...clients.map((c) => ({ value: c, label: c }))]}
      />
      <Select
        value={f.project}
        ariaLabel="Proyecto"
        onChange={(v) => setFilters({ project: v })}
        options={[{ value: '', label: 'Todos los proyectos' }, ...projects.map((c) => ({ value: c, label: c }))]}
      />
      <Select
        value={f.priority}
        ariaLabel="Prioridad"
        onChange={(v) => setFilters({ priority: v as '' | Priority })}
        options={[{ value: '', label: 'Toda prioridad' }, ...Object.entries(PRIO).map(([k, v]) => ({ value: k, label: v }))]}
      />
      {tags.length > 0 && (
        <Select
          value={f.tag}
          ariaLabel="Etiqueta"
          onChange={(v) => setFilters({ tag: v })}
          options={[{ value: '', label: 'Toda etiqueta' }, ...tags.map((c) => ({ value: c, label: `#${c}` }))]}
        />
      )}
      <Select
        value={f.sort}
        ariaLabel="Ordenar"
        onChange={(v) => setFilters({ sort: v as SortKey })}
        options={[
          { value: 'priority', label: 'Orden: prioridad' },
          { value: 'recent', label: 'Orden: más recientes' },
          { value: 'name', label: 'Orden: nombre' }
        ]}
      />
      {isFiltering(f) && (
        <button className="btn sm" onClick={() => setFilters({ ...EMPTY, sort: f.sort })}>
          Limpiar
        </button>
      )}
    </div>
  )
}
