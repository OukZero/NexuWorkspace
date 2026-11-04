import { useSyncExternalStore } from 'react'
import type { Priority, Task } from '../../shared/types'

export type SortKey = 'priority' | 'recent' | 'name'

export interface Filters {
  q: string
  client: string
  project: string
  priority: '' | Priority
  tag: string
  sort: SortKey
}

const KEY = 'shutoki.filters'
export const EMPTY: Filters = { q: '', client: '', project: '', priority: '', tag: '', sort: 'priority' }

function load(): Filters {
  try {
    return { ...EMPTY, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Filters>) }
  } catch {
    return EMPTY
  }
}

let state = load()
const listeners = new Set<() => void>()

export function setFilters(p: Partial<Filters>): void {
  state = { ...state, ...p }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* sin storage */
  }
  listeners.forEach((l) => l())
}

export function useFilters(): Filters {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state
  )
}

export const isFiltering = (f: Filters): boolean => !!(f.q || f.client || f.project || f.priority || f.tag)

const PRI = { high: 0, med: 1, low: 2 }

/** Filtra por texto, cliente, proyecto, prioridad y etiqueta, y ordena según el criterio elegido. */
export function applyFilters(tasks: Task[], f: Filters): Task[] {
  const q = f.q.trim().toLowerCase()
  const out = tasks.filter(
    (t) =>
      (!q || `${t.title} ${t.description} ${t.client} ${t.project} ${(t.tags ?? []).join(' ')}`.toLowerCase().includes(q)) &&
      (!f.client || t.client === f.client) &&
      (!f.project || t.project === f.project) &&
      (!f.priority || t.priority === f.priority) &&
      (!f.tag || (t.tags ?? []).includes(f.tag))
  )
  return out.sort((a, b) =>
    f.sort === 'name' ? a.title.localeCompare(b.title) : f.sort === 'recent' ? b.createdAt - a.createdAt : PRI[a.priority] - PRI[b.priority] || b.createdAt - a.createdAt
  )
}
