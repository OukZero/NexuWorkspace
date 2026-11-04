import type { ReactNode } from 'react'
import type { Priority } from '../../../shared/types'
import { EMPTY, isFiltering, setFilters, useFilters, type SortKey } from '../filters'
import { useDB } from '../store'
import { PRIO, isWorkTask } from '../utils'

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
      <select value={f.client} aria-label="Cliente" onChange={(e) => setFilters({ client: e.target.value, project: '' })}>
        <option value="">Todos los clientes</option>
        {clients.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <select value={f.project} aria-label="Proyecto" onChange={(e) => setFilters({ project: e.target.value })}>
        <option value="">Todos los proyectos</option>
        {projects.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <select value={f.priority} aria-label="Prioridad" onChange={(e) => setFilters({ priority: e.target.value as '' | Priority })}>
        <option value="">Toda prioridad</option>
        {Object.entries(PRIO).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {tags.length > 0 && (
        <select value={f.tag} aria-label="Etiqueta" onChange={(e) => setFilters({ tag: e.target.value })}>
          <option value="">Toda etiqueta</option>
          {tags.map((c) => (
            <option key={c} value={c}>
              #{c}
            </option>
          ))}
        </select>
      )}
      <select value={f.sort} aria-label="Ordenar" onChange={(e) => setFilters({ sort: e.target.value as SortKey })}>
        <option value="priority">Orden: prioridad</option>
        <option value="recent">Orden: más recientes</option>
        <option value="name">Orden: nombre</option>
      </select>
      {isFiltering(f) && (
        <button className="btn sm" onClick={() => setFilters({ ...EMPTY, sort: f.sort })}>
          Limpiar
        </button>
      )}
    </div>
  )
}
