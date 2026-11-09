import { useSyncExternalStore } from 'react'

let on = false
const listeners = new Set<() => void>()
let wired = false
const set = (v: boolean): void => {
  if (v === on) return
  on = v
  listeners.forEach((l) => l())
}
function wire(): void {
  if (wired) return
  wired = true
  window.api.onFullscreen(set) // también cambia al salir con Esc o desde el sistema
}

/** Si la ventana está en pantalla completa. */
export function useFullscreen(): boolean {
  wire()
  return useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => on)
}

export async function toggleFullscreen(): Promise<void> {
  wire()
  try {
    set(await window.api.call('window:fullscreen'))
  } catch {
    /* ventana sin soporte */
  }
}
