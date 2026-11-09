import { useSyncExternalStore } from 'react'

const KEY = 'shutoki.convsOpen'
const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}
let state = { open: read() }
const listeners = new Set<() => void>()

/** Si el panel de conversaciones (lista a la izquierda del chat) está visible. */
export const useConvsPane = (): { open: boolean } => useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => state)

export function setConvsOpen(open: boolean): void {
  state = { open }
  try {
    localStorage.setItem(KEY, open ? '1' : '0')
  } catch {
    /* sin storage */
  }
  listeners.forEach((l) => l())
}
