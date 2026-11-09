import { useSyncExternalStore } from 'react'

/** Qué muestra un panel del espacio de trabajo. */
export type PaneKind = 'empty' | 'chat' | 'git' | 'files' | 'terminal' | 'panel' | 'tasks' | 'board' | 'hours' | 'notes' | 'music' | 'whatsapp' | 'web'

export interface PaneContent {
  kind: PaneKind
  /** Tarea fija del panel; sin ella sigue a la tarea activa. */
  taskId?: string
  /** Conversación fija (solo chat); sin ella usa la última de la tarea. */
  convId?: string
  /** Última dirección abierta (solo web). */
  url?: string
}

export type WNode = { t: 'pane'; id: string; c: PaneContent } | { t: 'split'; id: string; dir: 'row' | 'col'; sizes: number[]; kids: WNode[] }

export interface WState {
  root: WNode
  /** Panel con el foco (el último en el que se hizo clic). */
  focus: string
}

export const MAX_PANES = 6
const KEY = 'shutoki.workspace'
const uid = (): string => Math.random().toString(36).slice(2, 9)
const pane = (c: PaneContent): WNode => ({ t: 'pane', id: uid(), c })
const split = (dir: 'row' | 'col', kids: WNode[], sizes?: number[]): WNode => ({ t: 'split', id: uid(), dir, kids, sizes: sizes ?? kids.map(() => 100 / kids.length) })

export const KIND_LABEL: Record<PaneKind, string> = {
  empty: 'Elegir…',
  chat: 'Chat',
  git: 'Git',
  files: 'Archivos',
  terminal: 'Terminal',
  panel: 'Panel',
  tasks: 'Tareas de hoy',
  board: 'Tablero',
  hours: 'Horas',
  notes: 'Notas',
  music: 'Música',
  whatsapp: 'WhatsApp',
  web: 'Web'
}
/** Tipos que necesitan una tarea. */
export const NEEDS_TASK: PaneKind[] = ['chat', 'git', 'files', 'terminal']

export interface LayoutDef {
  id: string
  label: string
  /** Cuántos paneles usa. */
  n: number
  build: (c: PaneContent[]) => WNode
}

const at = (c: PaneContent[], i: number): PaneContent => c[i] ?? { kind: 'empty' }
export const LAYOUTS: LayoutDef[] = [
  { id: 'solo', label: 'Un panel', n: 1, build: (c) => pane(at(c, 0)) },
  { id: 'cols2', label: 'Dos columnas', n: 2, build: (c) => split('row', [pane(at(c, 0)), pane(at(c, 1))]) },
  { id: 'rows2', label: 'Dos filas', n: 2, build: (c) => split('col', [pane(at(c, 0)), pane(at(c, 1))]) },
  { id: 'cols3', label: 'Tres columnas', n: 3, build: (c) => split('row', [pane(at(c, 0)), pane(at(c, 1)), pane(at(c, 2))]) },
  { id: 'main2', label: 'Principal + 2', n: 3, build: (c) => split('row', [pane(at(c, 0)), split('col', [pane(at(c, 1)), pane(at(c, 2))])], [58, 42]) },
  { id: 'grid4', label: 'Cuadrícula 2×2', n: 4, build: (c) => split('col', [split('row', [pane(at(c, 0)), pane(at(c, 1))]), split('row', [pane(at(c, 2)), pane(at(c, 3))])]) }
]

const firstPane = (n: WNode): WNode => (n.t === 'pane' ? n : firstPane(n.kids[0]))

function defaultState(): WState {
  const root = LAYOUTS.find((l) => l.id === 'main2')!.build([{ kind: 'chat' }, { kind: 'git' }, { kind: 'terminal' }])
  return { root, focus: firstPane(root).id }
}

function valid(n: unknown, depth = 0): n is WNode {
  if (!n || typeof n !== 'object' || depth > 6) return false
  const x = n as WNode
  if (x.t === 'pane') return typeof x.id === 'string' && !!x.c && typeof x.c.kind === 'string' && x.c.kind in KIND_LABEL
  if (x.t === 'split') return typeof x.id === 'string' && (x.dir === 'row' || x.dir === 'col') && Array.isArray(x.kids) && x.kids.length >= 2 && Array.isArray(x.sizes) && x.sizes.length === x.kids.length && x.kids.every((k) => valid(k, depth + 1))
  return false
}

function load(): WState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as WState | null
    if (s && valid(s.root)) return { root: s.root, focus: typeof s.focus === 'string' ? s.focus : firstPane(s.root).id }
  } catch {
    /* se parte del diseño por defecto */
  }
  return defaultState()
}

let state: WState = load()
const listeners = new Set<() => void>()
function set(next: WState): void {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* sin storage */
  }
  listeners.forEach((l) => l())
}

export const useWorkspace = (): WState => useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => state)

export const panesOf = (n: WNode): Array<Extract<WNode, { t: 'pane' }>> => (n.t === 'pane' ? [n] : n.kids.flatMap(panesOf))

function mapNode(n: WNode, fn: (x: WNode) => WNode): WNode {
  const r = fn(n)
  return r.t === 'split' ? { ...r, kids: r.kids.map((k) => mapNode(k, fn)) } : r
}

export function setPane(id: string, patch: Partial<PaneContent>): void {
  set({ ...state, root: mapNode(state.root, (n) => (n.t === 'pane' && n.id === id ? { ...n, c: { ...n.c, ...patch } } : n)) })
}

export function setFocus(id: string): void {
  if (state.focus !== id) set({ ...state, focus: id })
}

export function setSizes(splitId: string, sizes: number[]): void {
  set({ ...state, root: mapNode(state.root, (n) => (n.t === 'split' && n.id === splitId ? { ...n, sizes } : n)) })
}

/** Divide un panel en dos (a la derecha o abajo). Si el contenedor ya va en esa dirección, agrega un hermano. */
export function splitPane(id: string, dir: 'row' | 'col'): void {
  if (panesOf(state.root).length >= MAX_PANES) return
  const fresh = pane({ kind: 'empty' })
  const walk = (n: WNode): WNode => {
    if (n.t === 'pane') return n.id === id ? split(dir, [n, fresh]) : n
    const i = n.kids.findIndex((k) => k.t === 'pane' && k.id === id)
    if (i >= 0 && n.dir === dir) {
      const kids = [...n.kids.slice(0, i + 1), fresh, ...n.kids.slice(i + 1)]
      return { ...n, kids, sizes: kids.map(() => 100 / kids.length) }
    }
    return { ...n, kids: n.kids.map(walk) }
  }
  set({ root: walk(state.root), focus: fresh.id })
}

export function closePane(id: string): void {
  if (panesOf(state.root).length <= 1) return set({ ...state, root: pane({ kind: 'empty' }) })
  const walk = (n: WNode): WNode | null => {
    if (n.t === 'pane') return n.id === id ? null : n
    const kids: WNode[] = []
    const sizes: number[] = []
    n.kids.forEach((k, i) => {
      const r = walk(k)
      if (r) {
        kids.push(r)
        sizes.push(n.sizes[i])
      }
    })
    if (kids.length === 0) return null
    if (kids.length === 1) return kids[0]
    const sum = sizes.reduce((a, b) => a + b, 0) || 1
    return { ...n, kids, sizes: sizes.map((x) => (x / sum) * 100) }
  }
  const root = walk(state.root) ?? pane({ kind: 'empty' })
  set({ root, focus: panesOf(root).some((p) => p.id === state.focus) ? state.focus : firstPane(root).id })
}

/** Cambia la distribución conservando, en orden, lo que ya había en los paneles. */
export function applyLayout(layoutId: string): void {
  const def = LAYOUTS.find((l) => l.id === layoutId)
  if (!def) return
  const contents = panesOf(state.root).map((p) => p.c)
  const root = def.build(contents)
  set({ root, focus: firstPane(root).id })
}

export function resetWorkspace(): void {
  set(defaultState())
}

/** Distribución que mejor describe el árbol actual (para resaltar el botón activo), o '' si es personalizada. */
export function layoutIdOf(n: WNode): string {
  const sig = (x: WNode): string => (x.t === 'pane' ? 'p' : `${x.dir === 'row' ? 'r' : 'c'}(${x.kids.map(sig).join(',')})`)
  const s = sig(n)
  const map: Record<string, string> = { p: 'solo', 'r(p,p)': 'cols2', 'c(p,p)': 'rows2', 'r(p,p,p)': 'cols3', 'r(p,c(p,p))': 'main2', 'c(r(p,p),r(p,p))': 'grid4' }
  return map[s] ?? ''
}
