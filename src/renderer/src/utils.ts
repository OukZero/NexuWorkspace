import type { Task } from '../../shared/types'
import { pad } from '../../shared/util'

export { dayKey, pad } from '../../shared/util'

export const fmtDur = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
export const fmtH = (ms: number): string => (ms / 3600000).toFixed(2)
export const hhmm = (ts: number): string => {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const toTs = (day: string, hm: string): number => new Date(`${day}T${hm}:00`).getTime()
export const baseName = (p: string): string => p.split(/[\\/]/).pop() || p

export const STATUS = { next: 'Próximas', today: 'Hoy', doing: 'En curso', done: 'Hecha' } as const
export const PRIO = { high: 'Alta', med: 'Media', low: 'Baja' } as const
export const DOW = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

/** Las tareas con recurrencia son plantillas: no aparecen en las listas de trabajo. */
export const isWorkTask = (t: Task): boolean => !t.archived && (!t.recurrence || t.recurrence.type === 'none')
