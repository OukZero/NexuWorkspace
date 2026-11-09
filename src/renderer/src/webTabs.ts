import { useSyncExternalStore } from 'react'

/** Pestañas de la vista «Web». Cada pestaña tiene su propia página nativa (id «t-<id>» en el proceso principal) y se recuerdan entre sesiones. */

export interface WebTab {
  id: string
  url?: string
}
interface State {
  tabs: WebTab[]
  active: string
}

const KEY = 'shutoki.webtabs'
export const MAX_TABS = 8
const uid = (): string => Math.random().toString(36).slice(2, 8)

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as State | null
    if (s && Array.isArray(s.tabs) && s.tabs.every((t) => t && /^[A-Za-z0-9]{1,12}$/.test(t.id) && (t.url === undefined || typeof t.url === 'string'))) {
      const tabs = s.tabs.slice(0, MAX_TABS)
      return { tabs, active: tabs.some((t) => t.id === s.active) ? s.active : (tabs[0]?.id ?? '') }
    }
  } catch {
    /* se parte de cero */
  }
  return { tabs: [], active: '' }
}

let state = load()
const subs = new Set<() => void>()
const set = (s: State): void => {
  state = s
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* sin espacio */
  }
  subs.forEach((f) => f())
}

export const useWebTabs = (): State =>
  useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => state
  )

/** Abre una pestaña nueva (con la dirección si se da) y la activa. Si ya hay MAX_TABS, reutiliza la activa. */
export function addTab(url?: string): string {
  if (state.tabs.length >= MAX_TABS) {
    setTabUrl(state.active, url)
    return state.active
  }
  const t: WebTab = { id: uid(), url }
  set({ tabs: [...state.tabs, t], active: t.id })
  return t.id
}
export function closeTab(id: string): void {
  const i = state.tabs.findIndex((t) => t.id === id)
  if (i < 0) return
  const tabs = state.tabs.filter((t) => t.id !== id)
  set({ tabs, active: state.active === id ? (tabs[Math.min(i, tabs.length - 1)]?.id ?? '') : state.active })
}
export const selectTab = (id: string): void => {
  if (state.active !== id && state.tabs.some((t) => t.id === id)) set({ ...state, active: id })
}
export function setTabUrl(id: string, url: string | undefined): void {
  if (state.tabs.some((t) => t.id === id && t.url !== url)) set({ ...state, tabs: state.tabs.map((t) => (t.id === id ? { ...t, url } : t)) })
}

/** Dirección que otra vista pide abrir (p. ej. un sitio guardado desde Ctrl+K). */
let wanted: string | null = null
export const requestWeb = (url: string): void => {
  wanted = url
}
export const takeWebRequest = (): string | null => {
  const u = wanted
  wanted = null
  return u
}

/** Id de la pestaña activa en el proceso principal (para pedirle a Claude que lea esa página). */
export const activeWebId = (): string | null => (state.active ? `t-${state.active}` : null)
