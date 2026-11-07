// Registro de terminales integradas. Cada terminal (xterm.js) vive aquí, no en un componente: así sigue viva y conserva
// su historial al cambiar de tarea o de vista; el panel solo la monta y desmonta del DOM.
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useSyncExternalStore } from 'react'

export interface TermEntry {
  id: string
  taskId: string
  title: string
  term: Terminal
  fit: FitAddon
  el: HTMLDivElement
  opened: boolean
  exited: boolean
}

const entries = new Map<string, TermEntry>()
const early = new Map<string, string[]>() // salida que llega antes de que exista la terminal en la interfaz
const activeByTask = new Map<string, string>() // terminal visible de cada tarea
let handledRequest = 0 // última petición de terminal ya atendida (sobrevive a ocultar/mostrar el panel)
const creating = new Map<string, number>() // terminales en creación por tarea (evita duplicar la automática y la pedida)
const autoDone = new Set<string>() // tareas a las que ya se les abrió su primera terminal automática
let snapshot: TermEntry[] = []
const listeners = new Set<() => void>()
let wired = false

const notify = (): void => {
  snapshot = [...entries.values()]
  listeners.forEach((l) => l())
}

function wire(): void {
  if (wired) return
  wired = true
  window.api.onPtyData(({ id, data }) => {
    const e = entries.get(id)
    if (e) e.term.write(data)
    else early.set(id, [...(early.get(id) ?? []), data])
  })
  window.api.onPtyExit(({ id, code }) => {
    const e = entries.get(id)
    if (!e) return
    e.exited = true
    e.term.write(`\r\n\x1b[2m[proceso terminado, código ${code}]\x1b[0m\r\n`)
    notify()
  })
}

/** Últimas líneas de la terminal de la tarea (la visible o, si no, la primera), para anexarlas como contexto. */
export function readTerminal(taskId: string, maxLines = 60): string {
  const id = activeByTask.get(taskId)
  const e = (id ? entries.get(id) : undefined) ?? [...entries.values()].find((x) => x.taskId === taskId)
  if (!e) return ''
  const buf = e.term.buffer.active
  const lines: string[] = []
  for (let i = Math.max(0, buf.length - 400); i < buf.length; i++) lines.push(buf.getLine(i)?.translateToString(true) ?? '')
  return lines.join('\n').trimEnd().split('\n').slice(-maxLines).join('\n')
}

export const getActive = (taskId: string): string | undefined => activeByTask.get(taskId)

export function setActive(taskId: string, id: string): void {
  activeByTask.set(taskId, id)
  notify()
}

/** True una sola vez por petición (nonce): evita crear otra terminal al volver a montar el panel. */
export function claimRequest(nonce: number): boolean {
  if (nonce <= handledRequest) return false
  handledRequest = nonce
  return true
}

export function useTerminals(): TermEntry[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => snapshot
  )
}

/** Colores de la terminal tomados del tema actual de la app. */
function themeFromCss(): Record<string, string> {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string, d: string): string => css.getPropertyValue(n).trim() || d
  const accent = v('--accent', '#7c8cff')
  return { background: v('--bg', '#0f1115'), foreground: v('--text', '#e6e8ee'), cursor: accent, selectionBackground: accent + '55' }
}

export const isCreating = (taskId: string): boolean => (creating.get(taskId) ?? 0) > 0

export async function createTerminal(taskId: string, sessionId?: string): Promise<string> {
  wire()
  creating.set(taskId, (creating.get(taskId) ?? 0) + 1)
  let r: { id: string; title: string }
  try {
    r = await window.api.call('pty:create', taskId, 100, 24, sessionId)
  } finally {
    creating.set(taskId, (creating.get(taskId) ?? 1) - 1)
  }
  const term = new Terminal({
    fontFamily: "'Cascadia Mono', Consolas, 'Courier New', monospace",
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    theme: themeFromCss()
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.onData((d) => void window.api.call('pty:write', r.id, d).catch(() => {}))
  term.onResize(({ cols, rows }) => void window.api.call('pty:resize', r.id, cols, rows).catch(() => {}))
  // Ctrl+C con texto seleccionado copia (sin selección, sigue siendo la interrupción de siempre)
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type === 'keydown' && ev.ctrlKey && (ev.key === 'c' || ev.key === 'C') && (term.hasSelection() || ev.shiftKey)) {
      void navigator.clipboard.writeText(term.getSelection())
      return false
    }
    return true
  })
  const el = document.createElement('div')
  el.className = 'xterm-host'
  entries.set(r.id, { id: r.id, taskId, title: r.title, term, fit, el, opened: false, exited: false })
  for (const chunk of early.get(r.id) ?? []) term.write(chunk)
  early.delete(r.id)
  notify()
  return r.id
}

/** Monta la terminal en el contenedor del panel y ajusta su tamaño. */
export function attachTerminal(e: TermEntry, host: HTMLElement): void {
  if (e.el.parentElement !== host) host.replaceChildren(e.el)
  if (!e.opened) {
    e.term.open(e.el)
    e.opened = true
  }
  e.term.options.theme = themeFromCss()
  requestAnimationFrame(() => {
    refit(e)
    e.term.refresh(0, e.term.rows - 1) // repinta el historial tras volver a montar el panel
    e.term.focus()
  })
}

export function refit(e: TermEntry): void {
  try {
    if (e.el.offsetWidth > 0 && e.el.offsetHeight > 0) e.fit.fit()
  } catch {
    /* aún sin dimensiones */
  }
}

export function closeTerminal(id: string): void {
  const e = entries.get(id)
  void window.api.call('pty:kill', id).catch(() => {})
  if (e) {
    autoDone.delete(e.taskId)
    e.term.dispose()
    e.el.remove()
  }
  entries.delete(id)
  notify()
}

/** La primera terminal de una tarea se abre sola al mostrar el panel; devuelve false si ya se hizo. */
export function claimAutoTerminal(taskId: string): boolean {
  if (autoDone.has(taskId)) return false
  autoDone.add(taskId)
  return true
}
