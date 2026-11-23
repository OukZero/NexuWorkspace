import { useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent, ReactNode } from 'react'
import { G } from './glyphs'

/** Inicio editable: rejilla de 12 columnas con widgets que se mueven, redimensionan, añaden y quitan. */
export type WType = 'focus' | 'day' | 'line' | 'tasks' | 'ai' | 'week' | 'git' | 'bars' | 'area' | 'donut' | 'hbars' | 'kpi'
export interface WItem { id: string; type: WType; x: number; y: number; w: number; h: number; opt?: string }

type OptKind = 'range' | 'metric' | null
export const WIDGETS: Record<WType, { label: string; w: number; h: number; opt: OptKind; def?: string }> = {
  focus: { label: 'Enfoque ahora', w: 8, h: 4, opt: null },
  day: { label: 'Jornada', w: 4, h: 4, opt: null },
  line: { label: 'Línea del día', w: 12, h: 3, opt: null },
  tasks: { label: 'Tareas de hoy', w: 12, h: 4, opt: null },
  ai: { label: 'Uso de la IA', w: 4, h: 3, opt: null },
  week: { label: 'Semana', w: 4, h: 3, opt: null },
  git: { label: 'Git', w: 4, h: 3, opt: null },
  bars: { label: 'Gráfico · barras de horas', w: 6, h: 3, opt: 'range', def: '14' },
  area: { label: 'Gráfico · línea de horas', w: 6, h: 3, opt: 'range', def: '30' },
  donut: { label: 'Gráfico · dona por proyecto', w: 4, h: 4, opt: 'range', def: '7' },
  hbars: { label: 'Gráfico · ranking de proyectos', w: 4, h: 3, opt: 'range', def: '7' },
  kpi: { label: 'Indicador', w: 3, h: 3, opt: 'metric', def: 'today' },
}
const RANGES: [string, string][] = [['7', '7 días'], ['14', '14 días'], ['30', '30 días']]
const METRICS: [string, string][] = [['today', 'Horas hoy'], ['week', 'Horas semana'], ['month', 'Horas mes'], ['open', 'Tareas abiertas'], ['done', 'Hechas hoy']]

export const DEFAULT_LAYOUT: WItem[] = [
  { id: 'focus', type: 'focus', x: 0, y: 0, w: 8, h: 4 },
  { id: 'day', type: 'day', x: 8, y: 0, w: 4, h: 4 },
  { id: 'line', type: 'line', x: 0, y: 4, w: 12, h: 3 },
  { id: 'tasks', type: 'tasks', x: 0, y: 7, w: 12, h: 4 },
  { id: 'ai', type: 'ai', x: 0, y: 11, w: 4, h: 3 },
  { id: 'week', type: 'week', x: 4, y: 11, w: 4, h: 3 },
  { id: 'git', type: 'git', x: 8, y: 11, w: 4, h: 3 },
]

const KEY = 'homeLayout'
export function loadLayout(): WItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as WItem[] | null
    if (Array.isArray(v) && v.length && v.every((i) => i && WIDGETS[i.type] && Number.isFinite(i.x + i.y + i.w + i.h))) return v
  } catch { /* se usa el diseño por defecto */ }
  return DEFAULT_LAYOUT
}
export function saveLayout(items: WItem[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* sin almacenamiento */ }
}

const hit = (a: WItem, b: WItem): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
/** Coloca el widget activo donde se pidió y compacta el resto hacia arriba sin solapes. */
function settle(items: WItem[], activeId?: string): WItem[] {
  const active = items.find((i) => i.id === activeId)
  const placed: WItem[] = active ? [active] : []
  const rest = items.filter((i) => i.id !== activeId).sort((a, b) => a.y - b.y || a.x - b.x)
  for (const it of rest) {
    const n = { ...it, y: 0 }
    while (placed.some((p) => hit(n, p))) n.y++
    placed.push(n)
  }
  return items.map((i) => placed.find((p) => p.id === i.id) ?? i)
}

export function HomeGrid({ items, setItems, editing, render }: { items: WItem[]; setItems: (i: WItem[]) => void; editing: boolean; render: (i: WItem) => ReactNode }): ReactNode {
  const box = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState<WItem[] | null>(null)
  const cur = live ?? items
  const rows = Math.max(8, ...cur.map((i) => i.y + i.h))

  // arrastrar (mover) o tirar de la esquina (redimensionar): se convierte el desplazamiento en celdas
  const start = (e: RPointerEvent, it: WItem, mode: 'move' | 'size'): void => {
    if (e.button !== 0 || !box.current) return
    e.preventDefault()
    const r = box.current.getBoundingClientRect()
    const gap = 14
    const cw = (r.width + gap) / 12
    const ch = (r.height + gap) / rows
    const x0 = e.clientX, y0 = e.clientY
    let last = items
    const onMove = (m: PointerEvent): void => {
      const dx = Math.round((m.clientX - x0) / cw), dy = Math.round((m.clientY - y0) / ch)
      const n: WItem = mode === 'move'
        ? { ...it, x: Math.max(0, Math.min(12 - it.w, it.x + dx)), y: Math.max(0, it.y + dy) }
        : { ...it, w: Math.max(2, Math.min(12 - it.x, it.w + dx)), h: Math.max(2, it.h + dy) }
      last = settle(items.map((i) => (i.id === it.id ? n : i)), it.id)
      setLive(last)
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setLive(null)
      setItems(last)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const patch = (id: string, p: Partial<WItem>): void => setItems(settle(items.map((i) => (i.id === id ? { ...i, ...p } : i))))

  return (
    <div ref={box} className={`home-grid home${editing ? ' editing' : ''}`} style={{ ['--hg-rows' as string]: rows }}>
      {cur.map((it) => {
        const meta = WIDGETS[it.type]
        const opts = meta.opt === 'range' ? RANGES : meta.opt === 'metric' ? METRICS : null
        return (
          <div key={it.id} className={`hg-item${live && live.find((l) => l.id === it.id) !== items.find((l) => l.id === it.id) ? ' moving' : ''}`} style={{ gridColumn: `${it.x + 1} / span ${it.w}`, gridRow: `${it.y + 1} / span ${it.h}` }}>
            <div className="hg-body">{render(it)}</div>
            {editing && (
              <div className="hg-ov" onPointerDown={(e) => start(e, it, 'move')}>
                <div className="hg-bar">
                  <span className="hg-grip">⠿</span>
                  <b>{meta.label}</b>
                  <span className="grow" />
                  {opts && (
                    <select value={it.opt ?? meta.def} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => patch(it.id, { opt: e.target.value })} aria-label="Opciones del widget">
                      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  )}
                  <button className="hg-x" title="Quitar" aria-label="Quitar widget" onPointerDown={(e) => e.stopPropagation()} onClick={() => setItems(settle(items.filter((i) => i.id !== it.id)))}>
                    <G n="x" size={12} />
                  </button>
                </div>
                <span className="hg-size" onPointerDown={(e) => { e.stopPropagation(); start(e, it, 'size') }} title="Cambiar tamaño" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Un widget nuevo con su tamaño y opción por defecto, colocado al final. */
export function newWidget(type: WType, items: WItem[]): WItem {
  const m = WIDGETS[type]
  return { id: `${type}-${Date.now().toString(36)}`, type, x: 0, y: Math.max(0, ...items.map((i) => i.y + i.h)), w: m.w, h: m.h, opt: m.def }
}
export { settle }
