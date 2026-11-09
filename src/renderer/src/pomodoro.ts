import { useSyncExternalStore } from 'react'

export interface PomoConfig {
  on: boolean
  focusMin: number
  breakMin: number
  /** Pausa el timer de horas durante los descansos (así no se imputan). */
  pauseTimer: boolean
}
export interface PomoState extends PomoConfig {
  phase: 'focus' | 'break'
  /** Instante en que termina la fase actual. */
  endsAt: number
  /** Pomodoros de foco completados hoy. */
  done: number
  day: string
}

const KEY = 'shutoki.pomodoro'
const DEF: PomoConfig = { on: false, focusMin: 25, breakMin: 5, pauseTimer: true }
const today = (): string => new Date().toDateString()

function load(): PomoState {
  let saved: Partial<PomoState> = {}
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<PomoState>
  } catch {
    /* valores por defecto */
  }
  const clamp = (n: unknown, d: number, lo: number, hi: number): number => (typeof n === 'number' && n >= lo && n <= hi ? Math.round(n) : d)
  const cfg: PomoConfig = { on: !!saved.on, focusMin: clamp(saved.focusMin, DEF.focusMin, 5, 120), breakMin: clamp(saved.breakMin, DEF.breakMin, 1, 60), pauseTimer: saved.pauseTimer !== false }
  const sameDay = saved.day === today()
  return { ...cfg, phase: 'focus', endsAt: 0, done: sameDay && typeof saved.done === 'number' ? saved.done : 0, day: today() }
}

let state = load()
const listeners = new Set<() => void>()
const emit = (): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* sin storage */
  }
  listeners.forEach((l) => l())
}

export const usePomodoro = (): PomoState => useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => state)

export function setPomo(patch: Partial<PomoConfig>): void {
  state = { ...state, ...patch }
  if (patch.on === false) state = { ...state, phase: 'focus', endsAt: 0 }
  emit()
}

/** Arranca una fase nueva (o la reinicia). */
export function startPhase(phase: 'focus' | 'break', now = Date.now()): void {
  const day = today()
  state = { ...state, phase, endsAt: now + (phase === 'focus' ? state.focusMin : state.breakMin) * 60000, day, done: state.day === day ? state.done : 0 }
  emit()
}

export function completeFocus(): void {
  state = { ...state, done: state.done + 1 }
  emit()
}
