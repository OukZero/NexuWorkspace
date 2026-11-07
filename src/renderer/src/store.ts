import { useEffect, useState, useSyncExternalStore } from 'react'
import type { DB, Entry, IpcChannels, Task } from '../../shared/types'

let state: DB | null = null
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((l) => l())

/** Carga el estado inicial y se suscribe a los cambios que empuja el proceso principal. */
export async function initStore(): Promise<void> {
  state = await window.api.call('state')
  window.api.onState((s) => {
    state = s
    emit()
  })
}

/** Estado actual sin suscribirse (para código fuera de React). */
export const peek = (): DB | null => state

export function useDB(): DB {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state as DB
  )
}

/** Reloj que fuerza un re-render cada `ms` (para contadores en vivo). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

export const activeEntry = (db: DB): Entry | undefined => db.entries.find((e) => !e.end)
export const findTask = (db: DB, id: string | null | undefined): Task | undefined => db.tasks.find((t) => t.id === id)

export function msToday(db: DB, now: number): number {
  const st = new Date()
  st.setHours(0, 0, 0, 0)
  let ms = 0
  for (const e of db.entries) {
    const end = e.end || now
    const s = Math.max(e.start, st.getTime())
    if (end > s) ms += end - s
  }
  return ms
}

export const taskMs = (db: DB, id: string, now: number): number =>
  db.entries.filter((e) => e.taskId === id).reduce((a, e) => a + ((e.end || now) - e.start), 0)

export type Call = <K extends keyof IpcChannels>(name: K, ...args: IpcChannels[K]['args']) => Promise<IpcChannels[K]['ret']>
export const call: Call = (name, ...args) => window.api.call(name, ...args)
