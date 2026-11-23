import type { DiagramType } from '../../shared/types'

/** Diagramas visuales (todos menos BPMN): el modelo se guarda como JSON en `Diagram.code`. */
export type VisualType = Exclude<DiagramType, 'bpmn'>

export interface DNode { id: string; shape: string; label: string; x: number; y: number; w: number; h: number; rows?: string[] }
export interface DEdge { id: string; from: string; to: string; label?: string; style: string }
export interface DModel { v: 1; nodes: DNode[]; edges: DEdge[] }

export interface ShapeDef { id: string; name: string; w: number; h: number; text: string; rows?: string[] }
export interface EdgeDef { id: string; name: string }

export const SHAPES: Record<VisualType, ShapeDef[]> = {
  flow: [
    { id: 'start', name: 'Inicio', w: 110, h: 44, text: 'Inicio' },
    { id: 'process', name: 'Proceso', w: 140, h: 56, text: 'Proceso' },
    { id: 'decision', name: 'Decisión', w: 150, h: 90, text: '¿Condición?' },
    { id: 'io', name: 'Entrada / salida', w: 150, h: 56, text: 'Datos' },
    { id: 'subprocess', name: 'Subproceso', w: 150, h: 56, text: 'Subproceso' },
    { id: 'doc', name: 'Documento', w: 140, h: 60, text: 'Documento' },
    { id: 'db', name: 'Base de datos', w: 110, h: 74, text: 'Datos' },
    { id: 'end', name: 'Fin', w: 110, h: 44, text: 'Fin' },
    { id: 'note', name: 'Nota', w: 150, h: 60, text: 'Nota' }
  ],
  class: [
    { id: 'class', name: 'Clase', w: 170, h: 90, text: 'Clase', rows: ['+ atributo: Tipo', '--', '+ método(): void'] },
    { id: 'interface', name: 'Interfaz', w: 170, h: 90, text: 'Interfaz', rows: ['+ método(): void'] },
    { id: 'note', name: 'Nota', w: 150, h: 60, text: 'Nota' }
  ],
  state: [
    { id: 'initial', name: 'Estado inicial', w: 28, h: 28, text: '' },
    { id: 'state', name: 'Estado', w: 140, h: 54, text: 'Estado' },
    { id: 'choice', name: 'Decisión', w: 44, h: 44, text: '' },
    { id: 'final', name: 'Estado final', w: 30, h: 30, text: '' },
    { id: 'note', name: 'Nota', w: 150, h: 60, text: 'Nota' }
  ],
  er: [
    { id: 'entity', name: 'Entidad', w: 170, h: 90, text: 'ENTIDAD', rows: ['id (PK)', 'nombre'] },
    { id: 'note', name: 'Nota', w: 150, h: 60, text: 'Nota' }
  ],
  sequence: [
    { id: 'participant', name: 'Participante', w: 130, h: 40, text: 'Participante' },
    { id: 'actor', name: 'Actor', w: 90, h: 64, text: 'Actor' }
  ]
}

export const EDGES: Record<VisualType, EdgeDef[]> = {
  flow: [{ id: 'arrow', name: 'Flecha' }, { id: 'line', name: 'Línea' }, { id: 'dashed', name: 'Punteada' }],
  class: [
    { id: 'association', name: 'Asociación' }, { id: 'arrow', name: 'Asociación dirigida' }, { id: 'inherit', name: 'Herencia' },
    { id: 'realize', name: 'Implementa' }, { id: 'compose', name: 'Composición' }, { id: 'aggregate', name: 'Agregación' }, { id: 'dashed', name: 'Dependencia' }
  ],
  state: [{ id: 'arrow', name: 'Transición' }, { id: 'dashed', name: 'Punteada' }],
  er: [{ id: '1-1', name: 'Uno a uno (1:1)' }, { id: '1-N', name: 'Uno a muchos (1:N)' }, { id: 'N-1', name: 'Muchos a uno (N:1)' }, { id: 'N-N', name: 'Muchos a muchos (N:N)' }],
  sequence: [{ id: 'sync', name: 'Mensaje' }, { id: 'async', name: 'Asíncrono' }, { id: 'return', name: 'Respuesta' }]
}

export const ROW_SHAPES = new Set(['class', 'interface', 'entity'])
export const isVisual = (t: DiagramType): t is VisualType => t !== 'bpmn'
export const uid = (): string => Math.random().toString(36).slice(2, 8)

export function dims(n: DNode): { w: number; h: number } {
  if (ROW_SHAPES.has(n.shape)) return { w: n.w, h: 30 + Math.max(1, n.rows?.length ?? 0) * 18 + 8 }
  return { w: n.w, h: n.h }
}

const rowWidth = (label: string, rows: string[]): number => Math.max(150, Math.ceil(Math.max(label.length * 8, ...rows.map((r) => r.length * 7.2)) + 28))

export function newNode(type: VisualType, shape: string, x: number, y: number, label?: string): DNode {
  const def = SHAPES[type].find((s) => s.id === shape) ?? SHAPES[type][0]!
  const text = label ?? def.text
  return { id: uid(), shape: def.id, label: text, x, y, w: def.rows ? rowWidth(text, def.rows) : def.w, h: def.h, rows: def.rows ? [...def.rows] : undefined }
}

/** Posición ordenada: por capas de arriba abajo según las conexiones (secuencia: participantes en fila). */
export function autoLayout(m: DModel, type: VisualType): DModel {
  const nodes = m.nodes.map((n) => ({ ...n }))
  if (type === 'sequence') {
    let x = 40
    for (const n of nodes) {
      n.x = x
      n.y = 20
      x += dims(n).w + 70
    }
    return { ...m, nodes }
  }
  const idx = new Map(nodes.map((n, i) => [n.id, i]))
  const edges = m.edges.filter((e) => e.from !== e.to && idx.has(e.from) && idx.has(e.to))
  const rank = nodes.map(() => 0)
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false
    for (const e of edges) {
      const a = idx.get(e.from)!
      const b = idx.get(e.to)!
      if (rank[a]! + 1 > rank[b]! && rank[a]! + 1 < nodes.length) (rank[b] = rank[a]! + 1, (changed = true))
    }
    if (!changed) break
  }
  const layers: number[][] = []
  nodes.forEach((_, i) => (layers[rank[i]!] ??= []).push(i))
  const pos = new Map<number, number>() // posición dentro de su capa, para ordenar por la media de los padres
  const rows: number[][] = []
  for (const layer of layers) {
    if (!layer) continue
    const key = (i: number): number => {
      const ps = edges.filter((e) => idx.get(e.to) === i).map((e) => pos.get(idx.get(e.from)!)).filter((p): p is number => p !== undefined)
      return ps.length ? ps.reduce((s, p) => s + p, 0) / ps.length : i
    }
    layer.sort((a, b) => key(a) - key(b))
    layer.forEach((i, k) => pos.set(i, k))
    for (let k = 0; k < layer.length; k += 4) rows.push(layer.slice(k, k + 4)) // capas muy anchas se parten en filas
  }
  const GAP_X = 60
  const GAP_Y = 70
  const widths = rows.map((r) => r.reduce((s, i) => s + dims(nodes[i]!).w, 0) + GAP_X * (r.length - 1))
  const maxW = Math.max(0, ...widths)
  let y = 40
  rows.forEach((r, ri) => {
    let x = 40 + (maxW - widths[ri]!) / 2
    let rowH = 0
    for (const i of r) {
      const n = nodes[i]!
      const d = dims(n)
      n.x = Math.round(x)
      n.y = y
      x += d.w + GAP_X
      rowH = Math.max(rowH, d.h)
    }
    // centra cada figura en la fila para que las conexiones queden rectas
    for (const i of r) nodes[i]!.y = Math.round(y + (rowH - dims(nodes[i]!).h) / 2)
    y += rowH + GAP_Y
  })
  return { ...m, nodes }
}

/** Valida lo que llegue (de la IA o del disco): ids únicos, figuras y estilos conocidos, aristas con extremos que existan. */
export function normalizeModel(raw: unknown, type: VisualType, layout = false): DModel | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { nodes?: unknown; edges?: unknown }
  if (!Array.isArray(r.nodes)) return null
  const shapes = SHAPES[type]
  const fallback = shapes.find((s) => s.id !== 'note') ?? shapes[0]!
  const used = new Set<string>()
  let needLayout = layout
  const nodes: DNode[] = []
  for (const it of r.nodes as Record<string, unknown>[]) {
    if (!it || typeof it !== 'object') continue
    const def = shapes.find((s) => s.id === it.shape) ?? fallback
    let id = typeof it.id === 'string' || typeof it.id === 'number' ? String(it.id) : uid()
    if (used.has(id)) id = uid()
    used.add(id)
    const label = typeof it.label === 'string' ? it.label : def.text
    const rows = def.rows ? (Array.isArray(it.rows) ? it.rows.map(String) : [...def.rows]) : undefined
    const x = typeof it.x === 'number' ? it.x : NaN
    const y = typeof it.y === 'number' ? it.y : NaN
    if (Number.isNaN(x) || Number.isNaN(y)) needLayout = true
    nodes.push({
      id, shape: def.id, label, x: Number.isNaN(x) ? 0 : x, y: Number.isNaN(y) ? 0 : y,
      w: rows ? (typeof it.w === 'number' ? it.w : rowWidth(label, rows)) : typeof it.w === 'number' ? it.w : def.w,
      h: typeof it.h === 'number' ? it.h : def.h,
      rows
    })
  }
  const styles = EDGES[type]
  const edges: DEdge[] = []
  if (Array.isArray(r.edges)) {
    for (const e of r.edges as Record<string, unknown>[]) {
      if (!e || typeof e !== 'object') continue
      const from = String(e.from ?? '')
      const to = String(e.to ?? '')
      if (!used.has(from) || !used.has(to)) continue
      edges.push({
        id: uid(), from, to,
        label: typeof e.label === 'string' && e.label ? e.label : undefined,
        style: styles.some((s) => s.id === e.style) ? (e.style as string) : styles[0]!.id
      })
    }
  }
  const m: DModel = { v: 1, nodes, edges }
  return needLayout ? autoLayout(m, type) : m
}

export function parseModel(code: string, type: VisualType): DModel | null {
  const s = code.trim()
  if (!s.startsWith('{')) return null
  try {
    return normalizeModel(JSON.parse(s), type)
  } catch {
    return null
  }
}

const TEMPLATES: Record<VisualType, unknown> = {
  flow: {
    nodes: [{ id: 'a', shape: 'start', label: 'Inicio' }, { id: 'b', shape: 'process', label: 'Recibir solicitud' }, { id: 'c', shape: 'decision', label: '¿Es válida?' }, { id: 'd', shape: 'process', label: 'Procesar' }, { id: 'e', shape: 'process', label: 'Rechazar' }, { id: 'f', shape: 'end', label: 'Fin' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd', label: 'Sí' }, { from: 'c', to: 'e', label: 'No' }, { from: 'd', to: 'f' }, { from: 'e', to: 'f' }]
  },
  class: {
    nodes: [{ id: 'a', shape: 'class', label: 'Cliente', rows: ['+ nombre: String', '--', '+ pedir(): Pedido'] }, { id: 'b', shape: 'class', label: 'Pedido', rows: ['+ fecha: Date', '--', '+ total(): Number'] }],
    edges: [{ from: 'a', to: 'b', label: 'realiza', style: 'arrow' }]
  },
  state: {
    nodes: [{ id: 'a', shape: 'initial' }, { id: 'b', shape: 'state', label: 'Borrador' }, { id: 'c', shape: 'state', label: 'Revisión' }, { id: 'd', shape: 'state', label: 'Aprobado' }, { id: 'e', shape: 'final' }],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', label: 'enviar' }, { from: 'c', to: 'd', label: 'aprobar' }, { from: 'c', to: 'b', label: 'rechazar' }, { from: 'd', to: 'e' }]
  },
  er: {
    nodes: [{ id: 'a', shape: 'entity', label: 'CLIENTE', rows: ['id (PK)', 'nombre'] }, { id: 'b', shape: 'entity', label: 'PEDIDO', rows: ['id (PK)', 'fecha', 'cliente_id (FK)'] }],
    edges: [{ from: 'a', to: 'b', label: 'realiza', style: '1-N' }]
  },
  sequence: {
    nodes: [{ id: 'u', shape: 'actor', label: 'Usuario' }, { id: 'a', shape: 'participant', label: 'App' }, { id: 's', shape: 'participant', label: 'Servidor' }],
    edges: [{ from: 'u', to: 'a', label: 'Inicia sesión' }, { from: 'a', to: 's', label: 'POST /login' }, { from: 's', to: 'a', label: 'Token', style: 'return' }, { from: 'a', to: 'u', label: 'Bienvenido', style: 'return' }]
  }
}

export const starterModel = (t: VisualType): string => JSON.stringify(normalizeModel(TEMPLATES[t], t, true))
