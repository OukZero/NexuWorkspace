// Disposición de la ventana: anchos de los paneles, panel lateral del chat y terminal. Se puede guardar con nombre y volver a aplicar.
import { useSyncExternalStore } from 'react'
import type { LayoutPreset } from '../../shared/types'
import { layoutsOf } from '../../shared/templates'
import { call, peek } from './store'
import { getFocus, setFocusMode } from './theme'

export interface Layout {
  sideOpen: boolean
  sideTab: 'session' | 'files' | 'activity'
  sideW: number
  sidebarW: number
  dockOpen: boolean
  dockH: number
}

export const LIMITS = { sideW: [240, 720], sidebarW: [160, 360], dockH: [140, 700] } as const
const clamp = (n: number, [lo, hi]: readonly [number, number]): number => Math.min(hi, Math.max(lo, Math.round(n) || lo))
const num = (k: string): number => {
  try {
    return Number(localStorage.getItem(k)) || 0
  } catch {
    return 0
  }
}

function load(): Layout {
  // se leen también las claves de versiones anteriores (panel lateral y terminal)
  let side: { open?: boolean; tab?: Layout['sideTab'] } = {}
  let saved: Partial<Layout> = {}
  try {
    side = JSON.parse(localStorage.getItem('shutoki.sidepanel') ?? 'null') ?? {}
    saved = JSON.parse(localStorage.getItem('shutoki.layout') ?? 'null') ?? {}
  } catch {
    /* datos dañados: se usan los predeterminados */
  }
  const tab = saved.sideTab ?? side.tab
  return {
    sideOpen: saved.sideOpen ?? side.open ?? true,
    sideTab: tab && ['session', 'files', 'activity'].includes(tab) ? tab : 'session',
    sideW: clamp(saved.sideW ?? 320, LIMITS.sideW),
    sidebarW: clamp(saved.sidebarW ?? 200, LIMITS.sidebarW),
    dockOpen: saved.dockOpen ?? localStorage.getItem('shutoki.dock') === '1',
    dockH: clamp(saved.dockH ?? (num('shutoki.dockH') || 280), LIMITS.dockH)
  }
}

let state: Layout = load()
const listeners = new Set<() => void>()

function applyCss(): void {
  const st = document.documentElement.style
  st.setProperty('--side-w', `${state.sideW}px`)
  st.setProperty('--sidebar-w', `${state.sidebarW}px`)
}
applyCss()

export const getLayout = (): Layout => state

export function setLayout(patch: Partial<Layout>): void {
  const next = { ...state, ...patch }
  next.sideW = clamp(next.sideW, LIMITS.sideW)
  next.sidebarW = clamp(next.sidebarW, LIMITS.sidebarW)
  next.dockH = clamp(next.dockH, LIMITS.dockH)
  if (JSON.stringify(next) === JSON.stringify(state)) return
  state = next
  applyCss()
  try {
    localStorage.setItem('shutoki.layout', JSON.stringify(state))
  } catch {
    /* sin storage */
  }
  listeners.forEach((l) => l())
}

export function useLayout(): Layout {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state
  )
}

/** Disposiciones guardadas (las del usuario o, si nunca las tocó, las que trae la app). */
export const savedLayouts = (): LayoutPreset[] => layoutsOf(peek()?.settings ?? {})

export function applyPreset(p: LayoutPreset): void {
  setLayout({ sideOpen: p.sideOpen, sideTab: p.sideTab, sideW: p.sideW, sidebarW: p.sidebarW, dockOpen: p.dockOpen, dockH: p.dockH })
  setFocusMode(p.focus)
}

export async function savePreset(name: string): Promise<void> {
  const l = getLayout()
  const mine = savedLayouts()
  const p: LayoutPreset = { id: 'l' + Date.now().toString(36), name: name.trim().slice(0, 30) || 'Mi disposición', ...l, focus: getFocus() }
  const same = mine.findIndex((x) => x.name.toLowerCase() === p.name.toLowerCase())
  const next = same >= 0 ? mine.map((x, i) => (i === same ? { ...p, id: x.id } : x)) : [...mine, p]
  await call('settings:save', { layouts: next })
}

export async function deletePreset(id: string): Promise<void> {
  await call('settings:save', { layouts: savedLayouts().filter((p) => p.id !== id) })
}
