import { useEffect, useSyncExternalStore } from 'react'
import type { CiStatus } from '../../shared/types'

let state: Record<string, CiStatus> = {}
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

async function load(): Promise<void> {
  try {
    const next = await window.api.call('ci:all')
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      state = next
      listeners.forEach((l) => l())
    }
  } catch {
    /* sin CI: no se muestra nada */
  }
}

/** Estado de CI/PR de las tareas con rama (la caché del proceso principal, que consulta GitHub). */
export function useCi(): Record<string, CiStatus> {
  useEffect(() => {
    if (listeners.size === 0 || !timer) {
      void load()
      timer = setInterval(() => document.visibilityState === 'visible' && void load(), 20000)
    }
    return () => undefined
  }, [])
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
        if (!listeners.size && timer) {
          clearInterval(timer)
          timer = null
        }
      }
    },
    () => state
  )
}

export const ciLabel = { success: 'CI en verde', failure: 'CI falló', pending: 'CI en curso…', none: 'Sin CI' } as const
