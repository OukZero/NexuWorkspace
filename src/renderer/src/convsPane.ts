import { useSyncExternalStore } from 'react'

const KEY = 'shutoki.convsOpen'
// null = automático: solo se muestra la lista cuando la tarea tiene más de una conversación abierta.
const read = (): boolean | null => {
  try {
    const v = localStorage.getItem(KEY)
    return v === '1' ? true : v === '0' ? false : null
  } catch {
    return null
  }
}
let state: { open: boolean | null } = { open: read() }
const listeners = new Set<() => void>()

/** Si el panel de conversaciones (lista a la izquierda del chat) está visible (null = según cuántas haya). */
export const useConvsPane = (): { open: boolean | null } => useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => state)

export function setConvsOpen(open: boolean): void {
  state = { open }
  try {
    localStorage.setItem(KEY, open ? '1' : '0')
  } catch {
    /* sin storage */
  }
  listeners.forEach((l) => l())
}
