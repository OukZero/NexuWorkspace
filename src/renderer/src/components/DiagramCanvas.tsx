import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as RPE, ReactNode } from 'react'
import { EDGES, ROW_SHAPES, SHAPES, autoLayout, dims, newNode, parseModel, uid } from '../diagramModel'
import type { DEdge, DModel, DNode, VisualType } from '../diagramModel'
import { Select } from './Select'

/** Editor visual de diagramas: paleta de figuras, arrastrar, conectar y editar sin escribir código. */
interface PaneApi { svg: () => Promise<string> }
interface Props { type: VisualType; code: string; onChange: (code: string) => void; api: { current: PaneApi | null } }
type Sel = { k: 'n' | 'e'; id: string } | null
type Pt = { x: number; y: number }

const INK = '#344054'
const ACCENT = '#4f7cff'
const FONT = 'Segoe UI, Arial, sans-serif'
const FILL: Record<string, string> = {
  start: '#e6f6ea', end: '#fde8e8', process: '#eef4ff', decision: '#fff7e0', io: '#f3ecff', subprocess: '#eef4ff', doc: '#f6f6f6', db: '#e8f5f7', note: '#fffbe0',
  class: '#ffffff', interface: '#ffffff', entity: '#ffffff', state: '#eef4ff', choice: '#fff7e0', participant: '#eef4ff'
}
const HEAD: Record<string, string> = { class: '#dfe9ff', interface: '#e7f6e9', entity: '#e0f2f6' }
const SEQ_Y0 = 120
const SEQ_STEP = 48

const cx = (n: DNode): number => n.x + dims(n).w / 2
const cy = (n: DNode): number => n.y + dims(n).h / 2

/** Punto donde la recta del centro de la figura hacia `to` corta su borde. */
function clip(n: DNode, to: Pt): Pt {
  const d = dims(n)
  const x = cx(n)
  const y = cy(n)
  const dx = to.x - x
  const dy = to.y - y
  if (!dx && !dy) return { x, y }
  let t: number
  if (n.shape === 'initial' || n.shape === 'final') t = d.w / 2 / Math.hypot(dx, dy)
  else if (n.shape === 'decision' || n.shape === 'choice') t = 1 / (Math.abs(dx) / (d.w / 2) + Math.abs(dy) / (d.h / 2))
  else t = Math.min(dx ? d.w / 2 / Math.abs(dx) : Infinity, dy ? d.h / 2 / Math.abs(dy) : Infinity)
  return { x: x + dx * t, y: y + dy * t }
}

function bounds(m: DModel, type: VisualType): { x: number; y: number; w: number; h: number } {
  if (!m.nodes.length) return { x: 0, y: 0, w: 480, h: 320 }
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const n of m.nodes) {
    const d = dims(n)
    x1 = Math.min(x1, n.x)
    y1 = Math.min(y1, n.y)
    x2 = Math.max(x2, n.x + d.w)
    y2 = Math.max(y2, n.y + d.h)
  }
  if (type === 'sequence') y2 = Math.max(y2, SEQ_Y0 + m.edges.length * SEQ_STEP + 20)
  const pad = 36
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 }
}

interface Geo { d: string; mx: number; my: number; a: Pt; b: Pt }
function edgeGeo(e: DEdge, m: DModel, type: VisualType, i: number): Geo | null {
  const A = m.nodes.find((n) => n.id === e.from)
  const B = m.nodes.find((n) => n.id === e.to)
  if (!A || !B) return null
  if (type === 'sequence') {
    const y = SEQ_Y0 + i * SEQ_STEP
    const a = { x: cx(A), y }
    const b = { x: cx(B), y }
    if (A === B) return { d: `M ${a.x} ${y} h 44 v 20 h -44`, mx: a.x + 50, my: y + 10, a, b: { x: a.x, y: y + 20 } }
    return { d: `M ${a.x} ${y} L ${b.x} ${y}`, mx: (a.x + b.x) / 2, my: y - 7, a, b }
  }
  if (A === B) {
    const d = dims(A)
    const rx = A.x + d.w
    const y = cy(A)
    return { d: `M ${rx} ${y - 10} C ${rx + 54} ${y - 44} ${rx + 54} ${y + 44} ${rx} ${y + 10}`, mx: rx + 46, my: y, a: { x: rx, y: y - 10 }, b: { x: rx, y: y + 10 } }
  }
  // si existe la arista contraria, se separan en paralelo para que no se pisen
  const back = m.edges.some((o) => o.from === e.to && o.to === e.from)
  let ca = { x: cx(A), y: cy(A) }
  let cb = { x: cx(B), y: cy(B) }
  if (back) {
    const len = Math.hypot(cb.x - ca.x, cb.y - ca.y) || 1
    const ox = (-(cb.y - ca.y) / len) * 9
    const oy = ((cb.x - ca.x) / len) * 9
    ca = { x: ca.x + ox, y: ca.y + oy }
    cb = { x: cb.x + ox, y: cb.y + oy }
  }
  const a = clip(A, cb)
  const b = clip(B, ca)
  return { d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, a, b }
}

const MARK_END: Record<string, string> = { arrow: 'dg-arrow', dashed: 'dg-arrow', inherit: 'dg-tri', realize: 'dg-tri', sync: 'dg-arrow', return: 'dg-open', async: 'dg-open' }
const MARK_START: Record<string, string> = { compose: 'dg-dia-f', aggregate: 'dg-dia-o' }
const DASHED = new Set(['dashed', 'realize', 'return'])

function Lines({ text, x, y, bold, italic, anchor = 'middle', size = 13 }: { text: string; x: number; y: number; bold?: boolean; italic?: boolean; anchor?: 'start' | 'middle'; size?: number }): ReactNode {
  const lines = text.split('\n')
  const y0 = y - ((lines.length - 1) * (size + 3)) / 2
  return (
    <text x={x} y={y0} textAnchor={anchor} dominantBaseline="central" fontFamily={FONT} fontSize={size} fontWeight={bold ? 600 : 400} fontStyle={italic ? 'italic' : 'normal'} fill="#1f2430" style={{ userSelect: 'none' }}>
      {lines.map((l, i) => <tspan key={i} x={x} dy={i ? size + 3 : 0}>{l}</tspan>)}
    </text>
  )
}

/** Dibujo de una figura en coordenadas locales (0,0 = esquina superior izquierda). Todo con atributos para poder exportarlo como SVG suelto. */
function Body({ n }: { n: DNode }): ReactNode {
  const { w, h } = dims(n)
  const f = FILL[n.shape] ?? '#fff'
  const sp = { stroke: INK, strokeWidth: 1.6, fill: f }
  const label = <Lines text={n.label} x={w / 2} y={h / 2} />
  switch (n.shape) {
    case 'start':
    case 'end':
      return <><rect width={w} height={h} rx={h / 2} {...sp} />{label}</>
    case 'decision':
      return <><polygon points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} {...sp} strokeLinejoin="round" />{label}</>
    case 'choice':
      return <polygon points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} {...sp} strokeLinejoin="round" />
    case 'io':
      return <><polygon points={`16,0 ${w},0 ${w - 16},${h} 0,${h}`} {...sp} strokeLinejoin="round" />{label}</>
    case 'subprocess':
      return <><rect width={w} height={h} rx={4} {...sp} /><line x1={10} y1={0} x2={10} y2={h} stroke={INK} strokeWidth={1.4} /><line x1={w - 10} y1={0} x2={w - 10} y2={h} stroke={INK} strokeWidth={1.4} />{label}</>
    case 'doc':
      return <><path d={`M0,0 H${w} V${h - 10} Q${w * 0.75},${h - 24} ${w / 2},${h - 10} T0,${h - 10} Z`} {...sp} />{<Lines text={n.label} x={w / 2} y={(h - 8) / 2} />}</>
    case 'db':
      return <><path d={`M0,10 A${w / 2},10 0 0 1 ${w},10 V${h - 10} A${w / 2},10 0 0 1 0,${h - 10} Z`} {...sp} /><path d={`M0,10 A${w / 2},10 0 0 0 ${w},10`} fill="none" stroke={INK} strokeWidth={1.4} /><Lines text={n.label} x={w / 2} y={h / 2 + 6} /></>
    case 'note':
      return <><path d={`M0,0 H${w - 14} L${w},14 V${h} H0 Z`} {...sp} strokeLinejoin="round" /><path d={`M${w - 14},0 V14 H${w}`} fill="none" stroke={INK} strokeWidth={1.4} /><Lines text={n.label} x={w / 2} y={h / 2} /></>
    case 'initial':
      return <circle cx={w / 2} cy={h / 2} r={w / 2} fill={INK} />
    case 'final':
      return <><circle cx={w / 2} cy={h / 2} r={w / 2 - 1} fill="#fff" stroke={INK} strokeWidth={1.6} /><circle cx={w / 2} cy={h / 2} r={w / 2 - 6} fill={INK} /></>
    case 'state':
      return <><rect width={w} height={h} rx={14} {...sp} />{label}</>
    case 'participant':
      return <><rect width={w} height={h} rx={4} {...sp} />{label}</>
    case 'actor':
      return (
        <>
          <circle cx={w / 2} cy={10} r={8} fill="#fff" stroke={INK} strokeWidth={1.6} />
          <path d={`M${w / 2},18 V36 M${w / 2 - 14},25 H${w / 2 + 14} M${w / 2},36 L${w / 2 - 11},48 M${w / 2},36 L${w / 2 + 11},48`} fill="none" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
          <Lines text={n.label} x={w / 2} y={h - 6} />
        </>
      )
    case 'class':
    case 'interface':
    case 'entity': {
      const rows = n.rows?.length ? n.rows : ['']
      return (
        <>
          <rect width={w} height={h} rx={4} fill="#fff" stroke={INK} strokeWidth={1.6} />
          <path d={`M0,28 V4 Q0,0 4,0 H${w - 4} Q${w},0 ${w},4 V28 Z`} fill={HEAD[n.shape]} stroke={INK} strokeWidth={1.6} />
          <Lines text={n.label} x={w / 2} y={14} bold italic={n.shape === 'interface'} />
          {rows.map((r, i) => r.trim() === '--'
            ? <line key={i} x1={0} x2={w} y1={30 + i * 18 + 9} y2={30 + i * 18 + 9} stroke={INK} strokeWidth={1} />
            : <Lines key={i} text={r} x={9} y={30 + i * 18 + 9} anchor="start" size={12} />)}
        </>
      )
    }
    default:
      return <><rect width={w} height={h} rx={6} {...sp} />{label}</>
  }
}

function Preview({ type, shape }: { type: VisualType; shape: string }): ReactNode {
  const n = newNode(type, shape, 0, 0)
  const d = dims(n)
  const k = Math.min(1, 40 / d.w, 28 / d.h)
  return (
    <svg width={40} height={28} viewBox={`${-(40 / k - d.w) / 2} ${-(28 / k - d.h) / 2} ${40 / k} ${28 / k}`} aria-hidden>
      <Body n={{ ...n, label: '' }} />
    </svg>
  )
}

export function DiagramCanvas({ type, code, onChange, api }: Props): ReactNode {
  const [model, setModel] = useState<DModel>(() => parseModel(code, type) ?? { v: 1, nodes: [], edges: [] })
  const [sel, setSel] = useState<Sel>(null)
  const [view, setView] = useState({ x: 20, y: 20, k: 1 })
  const [link, setLink] = useState<{ from: string; p: Pt } | null>(null)
  const mref = useRef(model)
  const vref = useRef(view)
  vref.current = view
  const past = useRef<string[]>([])
  const future = useRef<string[]>([])
  const lastKey = useRef({ key: '', t: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const cb = useRef(onChange)
  cb.current = onChange

  const emit = useCallback((m: DModel): void => {
    mref.current = m
    setModel(m)
    cb.current(JSON.stringify(m))
  }, [])

  /** Cambio con historial; `coalesce` agrupa lo escrito seguido (una etiqueta) en un solo paso de «Deshacer». */
  const edit = (fn: (m: DModel) => DModel, coalesce?: string): void => {
    const now = Date.now()
    const same = coalesce && lastKey.current.key === coalesce && now - lastKey.current.t < 1200
    lastKey.current = { key: coalesce ?? '', t: now }
    if (!same) {
      past.current.push(JSON.stringify(mref.current))
      if (past.current.length > 100) past.current.shift()
      future.current = []
    }
    emit(fn(mref.current))
  }

  const pt = (ev: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect()
    const v = vref.current
    return { x: (ev.clientX - r.left - v.x) / v.k, y: (ev.clientY - r.top - v.y) / v.k }
  }

  const fit = useCallback((): void => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r || !r.width) return
    const b = bounds(mref.current, type)
    const k = Math.min(1.2, r.width / b.w, r.height / b.h)
    setView({ k, x: (r.width - b.w * k) / 2 - b.x * k, y: Math.max(8, (r.height - b.h * k) / 2) - b.y * k })
  }, [type])

  useEffect(() => {
    fit()
  }, [fit])

  // zoom con la rueda, centrado en el puntero (listener nativo: React registra wheel como pasivo)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const px = e.clientX - r.left
      const py = e.clientY - r.top
      const v = vref.current
      const k = Math.min(3, Math.max(0.2, v.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1)))
      setView({ k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // exportación: el SVG tal cual se ve, sin asas ni selección y sin el zoom del visor
  useEffect(() => {
    api.current = {
      svg: async () => {
        const el = svgRef.current!.cloneNode(true) as SVGSVGElement
        el.querySelectorAll('.ui').forEach((x) => x.remove())
        const vp = el.querySelector('#dg-vp')!
        vp.removeAttribute('transform')
        const b = bounds(mref.current, type)
        el.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`)
        el.setAttribute('width', String(b.w))
        el.setAttribute('height', String(b.h))
        el.removeAttribute('class')
        el.removeAttribute('style')
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        for (const [k, v] of Object.entries({ x: b.x, y: b.y, width: b.w, height: b.h, fill: '#ffffff' })) bg.setAttribute(k, String(v))
        vp.parentNode!.insertBefore(bg, vp)
        return new XMLSerializer().serializeToString(el)
      }
    }
    return () => { api.current = null }
  }, [api, type])

  /** Arrastre genérico: `move` devuelve el modelo nuevo; el historial guarda el estado de antes solo si algo cambió. */
  const drag = (e: RPE, move: (p: Pt, start: Pt, base: DModel) => DModel | null): void => {
    e.stopPropagation()
    const start = pt(e)
    const base = mref.current
    const snap = JSON.stringify(base)
    let moved = false
    const mv = (ev: PointerEvent): void => {
      const p = pt(ev)
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) * vref.current.k < 3) return
      const nm = move(p, start, base)
      if (nm) (moved = true, emit(nm))
    }
    const up = (): void => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
      if (moved) (past.current.push(snap), (future.current = []), (lastKey.current = { key: '', t: 0 }))
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }

  const snap10 = (v: number): number => Math.round(v / 10) * 10

  const dragNode = (e: RPE, n: DNode): void => {
    setSel({ k: 'n', id: n.id })
    wrap.current?.focus()
    drag(e, (p, s, base) => ({
      ...base,
      nodes: base.nodes.map((x) => (x.id === n.id ? { ...x, x: snap10(n.x + p.x - s.x), y: type === 'sequence' ? n.y : snap10(n.y + p.y - s.y) } : x))
    }))
  }

  const resizeNode = (e: RPE, n: DNode): void => {
    drag(e, (p, s, base) => ({
      ...base,
      nodes: base.nodes.map((x) => (x.id === n.id ? { ...x, w: Math.max(40, snap10(n.w + p.x - s.x)), h: ROW_SHAPES.has(n.shape) || type === 'sequence' ? n.h : Math.max(24, snap10(n.h + p.y - s.y)) } : x))
    }))
  }

  /** Conectar: arrastra el punto de la figura hasta otra. */
  const startLink = (e: RPE, n: DNode): void => {
    e.stopPropagation()
    setLink({ from: n.id, p: pt(e) })
    const mv = (ev: PointerEvent): void => setLink({ from: n.id, p: pt(ev) })
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
      setLink(null)
      const to = (document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-nid]') as SVGElement | null)?.dataset.nid
      if (!to || (to === n.id && type !== 'sequence' && type !== 'flow' && type !== 'state')) return
      const id = uid()
      edit((m) => ({ ...m, edges: [...m.edges, { id, from: n.id, to, style: EDGES[type][0]!.id, label: type === 'sequence' ? 'Mensaje' : undefined }] }))
      setSel({ k: 'e', id })
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }

  const pan = (e: RPE): void => {
    setSel(null)
    wrap.current?.focus()
    const sx = e.clientX
    const sy = e.clientY
    const v0 = vref.current
    const mv = (ev: PointerEvent): void => setView({ ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy })
    const up = (): void => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }

  const addShape = (shape: string, at?: Pt): void => {
    const m = mref.current
    const def = SHAPES[type].find((s) => s.id === shape)!
    const selNode = sel?.k === 'n' ? m.nodes.find((n) => n.id === sel.id) : undefined
    const probe = newNode(type, shape, 0, 0)
    const d = dims(probe)
    let x: number
    let y: number
    let from: DNode | undefined
    if (type === 'sequence') {
      x = m.nodes.length ? Math.max(...m.nodes.map((n) => n.x + dims(n).w)) + 70 : 40
      y = 20
    } else if (at) {
      x = snap10(at.x - d.w / 2)
      y = snap10(at.y - d.h / 2)
    } else if (selNode && (type === 'flow' || type === 'state') && shape !== 'note') {
      from = selNode.shape === 'end' || selNode.shape === 'final' || selNode.shape === 'note' ? undefined : selNode
      x = snap10(selNode.x + (dims(selNode).w - d.w) / 2)
      y = snap10(selNode.y + dims(selNode).h + 70)
    } else {
      const r = svgRef.current!.getBoundingClientRect()
      const v = vref.current
      x = snap10((r.width / 2 - v.x) / v.k - d.w / 2 + (m.nodes.length % 5) * 24)
      y = snap10((r.height / 2 - v.y) / v.k - d.h / 2 + (m.nodes.length % 5) * 24)
    }
    // si cae encima de otra figura se desplaza a la derecha hasta quedar libre
    const hits = (): boolean => m.nodes.some((n) => { const o = dims(n); return x < n.x + o.w + 16 && x + d.w + 16 > n.x && y < n.y + o.h + 16 && y + d.h + 16 > n.y })
    for (let i = 0; i < 60 && type !== 'sequence' && hits(); i++) x += 30
    const node = { ...probe, x, y, label: def.text }
    edit((mm) => ({
      ...mm,
      nodes: [...mm.nodes, node],
      edges: from ? [...mm.edges, { id: uid(), from: from.id, to: node.id, style: EDGES[type][0]!.id }] : mm.edges
    }))
    setSel({ k: 'n', id: node.id })
  }

  const addMessage = (): void => {
    const ns = mref.current.nodes
    if (!ns.length) return
    const i = Math.max(0, ns.findIndex((n) => sel?.k === 'n' && n.id === sel.id))
    const to = ns[i + 1] ?? ns[i - 1] ?? ns[i]!
    const id = uid()
    edit((m) => ({ ...m, edges: [...m.edges, { id, from: ns[i]!.id, to: to.id, style: 'sync', label: 'Mensaje' }] }))
    setSel({ k: 'e', id })
  }

  const remove = (): void => {
    if (!sel) return
    edit((m) => sel.k === 'n'
      ? { ...m, nodes: m.nodes.filter((n) => n.id !== sel.id), edges: m.edges.filter((e) => e.from !== sel.id && e.to !== sel.id) }
      : { ...m, edges: m.edges.filter((e) => e.id !== sel.id) })
    setSel(null)
  }

  const undo = (): void => {
    const p = past.current.pop()
    if (!p) return
    future.current.push(JSON.stringify(mref.current))
    emit(JSON.parse(p) as DModel)
    setSel(null)
  }
  const redo = (): void => {
    const p = future.current.pop()
    if (!p) return
    past.current.push(JSON.stringify(mref.current))
    emit(JSON.parse(p) as DModel)
    setSel(null)
  }

  const onKey = (e: React.KeyboardEvent): void => {
    const t = e.target as HTMLElement
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
    if (e.key === 'Delete' || e.key === 'Backspace') (e.preventDefault(), remove())
    else if (e.key === 'Escape') setSel(null)
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') (e.preventDefault(), e.shiftKey ? redo() : undo())
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') (e.preventDefault(), redo())
  }

  const selNode = sel?.k === 'n' ? model.nodes.find((n) => n.id === sel.id) : undefined
  const selEdge = sel?.k === 'e' ? model.edges.find((e) => e.id === sel.id) : undefined
  const setNode = (patch: Partial<DNode>, key: string): void => edit((m) => ({ ...m, nodes: m.nodes.map((n) => (n.id === sel?.id ? { ...n, ...patch } : n)) }), key)
  const setEdge = (patch: Partial<DEdge>, key?: string): void => edit((m) => ({ ...m, edges: m.edges.map((x) => (x.id === sel?.id ? { ...x, ...patch } : x)) }), key)
  const moveEdge = (dir: -1 | 1): void =>
    edit((m) => {
      const i = m.edges.findIndex((x) => x.id === sel?.id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= m.edges.length) return m
      const es = [...m.edges]
      ;[es[i], es[j]] = [es[j]!, es[i]!]
      return { ...m, edges: es }
    })

  const labelOf = (id: string): string => model.nodes.find((n) => n.id === id)?.label || '(sin nombre)'
  const seqBottom = SEQ_Y0 + model.edges.length * SEQ_STEP + 20

  return (
    <div className="dgv">
      <div className="dgv-pal" role="toolbar" aria-label="Figuras">
        <b>Figuras</b>
        {SHAPES[type].map((s) => (
          <button
            key={s.id}
            className="dgv-shape"
            draggable
            title={`${s.name}: haz clic o arrástrala al lienzo`}
            onClick={() => addShape(s.id)}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/dg-shape', s.id)
              e.dataTransfer.effectAllowed = 'copy'
            }}
          >
            <Preview type={type} shape={s.id} />
            <span>{s.name}</span>
          </button>
        ))}
        {type === 'sequence' && <button className="btn dgv-msg" onClick={addMessage} disabled={!model.nodes.length}>＋ Mensaje</button>}
        <small>{type === 'sequence' ? 'Los mensajes van en orden de arriba abajo.' : 'Para conectar, arrastra el punto azul de una figura hasta otra.'}</small>
      </div>

      <div className="dgv-main">
        <div className="dgv-bar">
          <button className="btn" onClick={undo} disabled={!past.current.length} title="Deshacer (Ctrl+Z)">↶</button>
          <button className="btn" onClick={redo} disabled={!future.current.length} title="Rehacer (Ctrl+Y)">↷</button>
          <button className="btn" onClick={() => { edit((m) => autoLayout(m, type)); requestAnimationFrame(fit) }} disabled={!model.nodes.length} title="Reacomoda las figuras según sus conexiones">Ordenar</button>
          <button className="btn" onClick={fit} title="Ajustar el diagrama a la ventana">Ajustar</button>
          <small>{Math.round(view.k * 100)}%</small>
          <span className="grow" />
          {sel && <button className="btn" onClick={remove} title="Suprimir">Quitar {sel.k === 'n' ? 'figura' : 'conexión'}</button>}
        </div>

        {(selNode || selEdge) && (
          <div className="dgv-props">
            {selNode && (
              <>
                {selNode.shape !== 'initial' && selNode.shape !== 'final' && selNode.shape !== 'choice' && (
                  <label>Texto<input value={selNode.label} onChange={(e) => setNode({ label: e.target.value }, 'l' + selNode.id)} aria-label="Texto de la figura" /></label>
                )}
                {ROW_SHAPES.has(selNode.shape) && (
                  <label className="wide">{selNode.shape === 'entity' ? 'Atributos' : 'Miembros'} (una línea por fila{selNode.shape === 'entity' ? '' : '; «--» dibuja una separación'})
                    <textarea rows={3} spellCheck={false} value={(selNode.rows ?? []).join('\n')} onChange={(e) => setNode({ rows: e.target.value.split('\n') }, 'r' + selNode.id)} aria-label="Filas de la figura" />
                  </label>
                )}
              </>
            )}
            {selEdge && (
              <>
                <small className="route">{labelOf(selEdge.from)} → {labelOf(selEdge.to)}</small>
                <label>{type === 'sequence' ? 'Mensaje' : 'Etiqueta'}<input value={selEdge.label ?? ''} onChange={(e) => setEdge({ label: e.target.value || undefined }, 'e' + selEdge.id)} aria-label="Etiqueta de la conexión" /></label>
                <label>Tipo
                  <Select value={selEdge.style} ariaLabel="Tipo de conexión" onChange={(v) => setEdge({ style: v })} options={EDGES[type].map((s) => ({ value: s.id, label: s.name }))} />
                </label>
                <button className="btn" onClick={() => setEdge({ from: selEdge.to, to: selEdge.from })} title="Cambia el sentido de la flecha">⇄ Invertir</button>
                {type === 'sequence' && (
                  <>
                    <button className="btn" onClick={() => moveEdge(-1)} title="Antes en el tiempo">↑</button>
                    <button className="btn" onClick={() => moveEdge(1)} title="Después en el tiempo">↓</button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        <div
          className="dg-canvas dgv-wrap"
          ref={wrap}
          tabIndex={0}
          onKeyDown={onKey}
          onDragOver={(e) => e.dataTransfer.types.includes('text/dg-shape') && (e.preventDefault(), (e.dataTransfer.dropEffect = 'copy'))}
          onDrop={(e) => {
            const s = e.dataTransfer.getData('text/dg-shape')
            if (!s) return
            e.preventDefault()
            addShape(s, pt(e))
          }}
        >
          <svg ref={svgRef} className="dgv-svg" xmlns="http://www.w3.org/2000/svg" onPointerDown={pan}>
            <defs>
              <marker id="dg-arrow" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L11,6 L1,11 Z" fill={INK} /></marker>
              <marker id="dg-open" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L11,6 L1,11" fill="none" stroke={INK} strokeWidth="1.5" /></marker>
              <marker id="dg-tri" markerWidth="14" markerHeight="14" refX="13" refY="7" orient="auto" markerUnits="userSpaceOnUse"><path d="M1,1 L13,7 L1,13 Z" fill="#fff" stroke={INK} strokeWidth="1.5" /></marker>
              <marker id="dg-dia-f" markerWidth="16" markerHeight="12" refX="0" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,6 L8,1 L16,6 L8,11 Z" fill={INK} stroke={INK} strokeWidth="1" /></marker>
              <marker id="dg-dia-o" markerWidth="16" markerHeight="12" refX="0" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,6 L8,1 L16,6 L8,11 Z" fill="#fff" stroke={INK} strokeWidth="1.2" /></marker>
            </defs>
            <g id="dg-vp" transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
              {type === 'sequence' && model.nodes.map((n) => (
                <line key={'ll' + n.id} x1={cx(n)} x2={cx(n)} y1={n.y + dims(n).h} y2={seqBottom} stroke="#98a2b3" strokeWidth={1.2} strokeDasharray="5 5" />
              ))}

              {model.edges.map((e, i) => {
                const g = edgeGeo(e, model, type, i)
                if (!g) return null
                const on = sel?.k === 'e' && sel.id === e.id
                const [c1, c2] = type === 'er' ? e.style.split('-') : []
                const ang = Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x)
                const nx = -Math.sin(ang) * 13
                const ny = Math.cos(ang) * 13
                const along = (p: Pt, s: number): Pt => ({ x: p.x + Math.cos(ang) * s + nx, y: p.y + Math.sin(ang) * s + ny })
                const cardA = along(g.a, 14)
                const cardB = along(g.b, -14)
                return (
                  <g key={e.id} data-eid={e.id}>
                    {on && <path className="ui" d={g.d} fill="none" stroke={ACCENT} strokeWidth={7} strokeOpacity={0.3} pointerEvents="none" />}
                    <path
                      d={g.d}
                      fill="none"
                      stroke={INK}
                      strokeWidth={1.6}
                      strokeDasharray={DASHED.has(e.style) ? '6 4' : undefined}
                      markerEnd={MARK_END[e.style] ? `url(#${MARK_END[e.style]})` : undefined}
                      markerStart={MARK_START[e.style] ? `url(#${MARK_START[e.style]})` : undefined}
                    />
                    {c1 && <><Lines text={c1} x={cardA.x} y={cardA.y} bold size={12} /><Lines text={c2!} x={cardB.x} y={cardB.y} bold size={12} /></>}
                    {e.label && (
                      <g>
                        <text x={g.mx} y={g.my} textAnchor="middle" dominantBaseline="central" fontFamily={FONT} fontSize={12} fill="#475467" stroke="#fff" strokeWidth={5} strokeLinejoin="round" paintOrder="stroke" style={{ userSelect: 'none' }}>{e.label}</text>
                      </g>
                    )}
                    <path className="ui" d={g.d} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: 'pointer' }} onPointerDown={(ev) => { ev.stopPropagation(); setSel({ k: 'e', id: e.id }); wrap.current?.focus() }} />
                  </g>
                )
              })}

              {model.nodes.map((n) => {
                const d = dims(n)
                const on = sel?.k === 'n' && sel.id === n.id
                return (
                  <g key={n.id} data-nid={n.id} transform={`translate(${n.x} ${n.y})`} style={{ cursor: 'move' }} onPointerDown={(ev) => dragNode(ev, n)} onDoubleClick={() => wrap.current?.parentElement?.querySelector<HTMLInputElement>('.dgv-props input')?.focus()}>
                    <Body n={n} />
                    {on && (
                      <g className="ui">
                        <rect x={-4} y={-4} width={d.w + 8} height={d.h + 8} fill="none" stroke={ACCENT} strokeWidth={1.4} strokeDasharray="4 3" pointerEvents="none" rx={4} />
                        <rect x={d.w + 1} y={d.h + 1} width={9} height={9} fill="#fff" stroke={ACCENT} strokeWidth={1.5} style={{ cursor: 'nwse-resize' }} onPointerDown={(ev) => resizeNode(ev, n)}><title>Cambiar tamaño</title></rect>
                        <g style={{ cursor: 'crosshair' }} onPointerDown={(ev) => startLink(ev, n)}>
                          <circle cx={d.w + 20} cy={d.h / 2} r={8} fill={ACCENT} />
                          <path d={`M${d.w + 16},${d.h / 2} h8 m-3,-3 l3,3 l-3,3`} stroke="#fff" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                          <title>Arrastra hasta otra figura para conectarlas</title>
                        </g>
                      </g>
                    )}
                  </g>
                )
              })}

              {link && (() => {
                const f = model.nodes.find((n) => n.id === link.from)
                return f ? <line className="ui" x1={cx(f)} y1={cy(f)} x2={link.p.x} y2={link.p.y} stroke={ACCENT} strokeWidth={2} strokeDasharray="5 4" pointerEvents="none" /> : null
              })()}
            </g>
          </svg>
          {!model.nodes.length && <p className="dgv-empty">Haz clic en una figura de la izquierda, o arrástrala hasta aquí, para empezar.</p>}
        </div>
      </div>
    </div>
  )
}
