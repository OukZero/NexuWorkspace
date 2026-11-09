import { useSyncExternalStore } from 'react'

const KEY = 'shutoki.reviewed'
const read = (): Record<string, true> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, true>
  } catch {
    return {}
  }
}
let state = read()
const listeners = new Set<() => void>()
const set = (next: Record<string, true>): void => {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* sin storage */
  }
  listeners.forEach((l) => l())
}

/** Archivos que el usuario ya marcó como «revisados» al repasar sus cambios (clave: repositorio|ruta). */
export const useReviewed = (): Record<string, true> => useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => state)

export const reviewKey = (dir: string, path: string): string => `${dir}|${path}`

export function toggleReviewed(key: string): void {
  const next = { ...state }
  if (next[key]) delete next[key]
  else next[key] = true
  set(next)
}

/** Olvida las marcas de archivos del repositorio que ya no tienen cambios pendientes. */
export function pruneReviewed(dir: string, livePaths: string[]): void {
  const live = new Set(livePaths.map((p) => reviewKey(dir, p)))
  const next = Object.fromEntries(Object.entries(state).filter(([k]) => !k.startsWith(dir + '|') || live.has(k))) as Record<string, true>
  if (Object.keys(next).length !== Object.keys(state).length) set(next)
}
