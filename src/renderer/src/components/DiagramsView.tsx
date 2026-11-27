import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import BpmnModeler from 'bpmn-js/lib/Modeler'
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'
import type { Diagram, DiagramType } from '../../../shared/types'
import { useDB } from '../store'
import { useUi } from '../ui'
import { isVisual, normalizeModel, starterModel } from '../diagramModel'
import { ChatView } from './Chat'
import { DiagramCanvas } from './DiagramCanvas'
import { ProfileSelect } from './ChatSafety'
import { Select } from './Select'

const TYPE_LABEL: Record<DiagramType, string> = {
  flow: 'Diagrama de flujo',
  sequence: 'UML · Secuencia',
  class: 'UML · Clases',
  state: 'UML · Estados',
  er: 'Entidad-relación (ER)',
  bpmn: 'BPMN'
}

const BPMN_EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="Start_1" name="Inicio" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Start_1_di" bpmnElement="Start_1">
        <dc:Bounds x="180" y="160" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

const starter = (t: DiagramType): string => (t === 'bpmn' ? BPMN_EMPTY : starterModel(t))
/** Diagrama visual (figuras, JSON) frente al antiguo en código Mermaid. */
const isModel = (type: DiagramType, code: string): boolean => type !== 'bpmn' && code.trim().startsWith('{')

/** Último bloque de código de una respuesta de la IA (```mermaid o ```xml). */
function lastBlock(text: string): string | null {
  let out: string | null = null
  for (const m of text.matchAll(/```[a-zA-Z]*\s*\n([\s\S]*?)```/g)) out = m[1]!.trim()
  return out
}

type Mermaid = typeof import('mermaid').default
let mermaidP: Promise<Mermaid> | null = null
/** Mermaid pesa bastante: se carga solo al abrir esta ventana. Etiquetas SVG puras para poder exportar a PNG. */
function loadMermaid(): Promise<Mermaid> {
  mermaidP ??= import('mermaid').then((m) => {
    m.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', htmlLabels: false, flowchart: { htmlLabels: false } })
    return m.default
  })
  return mermaidP
}

interface PaneApi { svg: () => Promise<string> }

function MermaidPane({ code, api }: { code: string; api: { current: PaneApi | null } }): ReactNode {
  const [svg, setSvg] = useState('')
  const [err, setErr] = useState('')
  const seq = useRef(0)
  useEffect(() => {
    const n = ++seq.current
    const t = setTimeout(() => {
      void (async () => {
        try {
          const mm = await loadMermaid()
          await mm.parse(code)
          const r = await mm.render(`dg-${n}`, code)
          if (n !== seq.current) return
          setSvg(r.svg)
          setErr('')
        } catch (e) {
          if (n === seq.current) setErr((e as Error).message.split('\n').slice(0, 4).join('\n'))
        } finally {
          document.getElementById(`ddg-${n}`)?.remove() // mermaid deja nodos de error sueltos en el body
        }
      })()
    }, 300)
    return () => clearTimeout(t)
  }, [code])
  useEffect(() => {
    api.current = { svg: async () => svg }
    return () => { api.current = null }
  }, [svg, api])
  return (
    <div className="dg-canvas">
      {svg ? <div className="dg-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : !err && <p className="dg-hint">Dibujando…</p>}
      {err && <pre className="dg-err">{err}</pre>}
    </div>
  )
}

function BpmnPane({ xml, onChange, api }: { xml: string; onChange: (x: string) => void; api: { current: PaneApi | null } }): ReactNode {
  const box = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState('')
  const cb = useRef(onChange)
  cb.current = onChange
  useEffect(() => {
    if (!box.current) return
    const modeler = new BpmnModeler({ container: box.current, keyboard: { bindTo: box.current } })
    let alive = true
    modeler.importXML(xml).then(
      () => { if (alive) (modeler.get('canvas') as { zoom: (z: string) => void }).zoom('fit-viewport') },
      (e: Error) => alive && setErr(`El XML no es BPMN válido: ${e.message}`)
    )
    ;(modeler as unknown as { on: (ev: string, fn: () => void) => void }).on('commandStack.changed', () => {
      void modeler.saveXML({ format: true }).then((r) => { if (alive && r.xml) cb.current(r.xml) })
    })
    api.current = { svg: async () => (await modeler.saveSVG()).svg }
    return () => {
      alive = false
      api.current = null
      modeler.destroy()
    }
    // el XML inicial solo se importa al montar: los cambios manuales llegan por onChange y la IA remonta el panel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="dg-canvas dg-bpmn">
      <div ref={box} className="dg-bpmn-box" tabIndex={0} />
      {err && <pre className="dg-err">{err}</pre>}
    </div>
  )
}

/** SVG → PNG (fondo blanco, ×2) dibujándolo en un canvas; devuelve base64. */
async function svgToPng(svg: string): Promise<string> {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
  const vb = doc.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  const w = vb && vb[2] ? vb[2] : parseFloat(doc.getAttribute('width') ?? '') || 800
  const h = vb && vb[3] ? vb[3] : parseFloat(doc.getAttribute('height') ?? '') || 600
  doc.setAttribute('width', String(w))
  doc.setAttribute('height', String(h))
  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(doc))
  const img = new Image()
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = () => rej(new Error('No se pudo convertir el diagrama a imagen'))
    img.src = src
  })
  const c = document.createElement('canvas')
  c.width = w * 2
  c.height = h * 2
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/png').split(',')[1]!
}

export function DiagramsView(): ReactNode {
  const ui = useUi()
  const db = useDB()
  const [list, setList] = useState<Diagram[]>([])
  const [curId, setCurId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [rev, setRev] = useState(0) // se incrementa cuando el código cambia desde fuera (IA) para remontar el modelador
  const [aiOpen, setAiOpen] = useState(false)
  const [taskId, setTaskId] = useState(() => localStorage.getItem('dgTask') ?? '')
  const api = useRef<PaneApi | null>(null)
  const cur = list.find((d) => d.id === curId) ?? null
  const legacy = !!cur && cur.type !== 'bpmn' && !isModel(cur.type, code)

  useEffect(() => {
    void ui.run('diagram:list').then((l) => {
      if (!l) return
      setList(l)
      if (l[0]) open(l[0])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const open = (d: Diagram): void => {
    setCurId(d.id)
    setTitle(d.title)
    setCode(d.code)
    setRev((r) => r + 1)
    setAiOpen(!!d.convId)
  }

  // guardado automático: espera a que se deje de editar
  useEffect(() => {
    if (!cur || (cur.title === title && cur.code === code)) return
    const t = setTimeout(() => {
      void ui.run('diagram:save', { id: cur.id, title, type: cur.type, code }).then((d) => d && setList((l) => l.map((x) => (x.id === d.id ? d : x))))
    }, 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, code, cur?.id])

  const create = async (type: DiagramType): Promise<void> => {
    const d = await ui.run('diagram:save', { title: `${TYPE_LABEL[type]} nuevo`, type, code: starter(type) })
    if (!d) return
    setList((l) => [d, ...l])
    open(d)
  }

  const remove = async (): Promise<void> => {
    if (!cur) return
    const msg = `Se eliminará «${cur.title}» (${TYPE_LABEL[cur.type]})${cur.convId ? ' junto con su conversación con la IA' : ''}. No se puede deshacer.`
    if (!(await ui.confirm(msg, { title: 'Eliminar diagrama', confirmLabel: 'Eliminar', danger: true }))) return
    const l = await ui.run('diagram:delete', cur.id)
    if (!l) return
    setList(l)
    setCurId(null)
    if (l[0]) open(l[0])
  }

  const tasks = useMemo(() => db.tasks.filter((t) => !t.archived && t.status !== 'done'), [db.tasks])
  const effTask = taskId && db.tasks.some((t) => t.id === taskId) ? taskId : (tasks[0]?.id ?? '')
  const convId = cur?.convId && db.chats[cur.convId] ? cur.convId : ''

  const askAi = async (): Promise<void> => {
    if (!cur) return
    if (!effTask) return ui.toast('Necesitas al menos una tarea abierta para usar la IA', true)
    if (!convId) {
      // guarda lo que haya antes de crear la conversación: la IA lo recibe como diagrama actual
      await ui.run('diagram:save', { id: cur.id, title, type: cur.type, code })
      const id = await ui.run('diagram:chat', cur.id, effTask)
      if (!id) return
      setList((l) => l.map((x) => (x.id === cur.id ? { ...x, convId: id, taskId: effTask } : x)))
    }
    setAiOpen(true)
  }

  // última propuesta de la IA que se pueda aplicar
  const proposal = useMemo(() => {
    const msgs = convId ? db.chats[convId]?.messages ?? [] : []
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i]!.role === 'assistant') return lastBlock(msgs[i]!.text)
    return null
  }, [db.chats, convId])

  const [applied, setApplied] = useState<string | null>(null)
  const apply = (): void => {
    if (!proposal || !cur) return
    let next = proposal
    if (isVisual(cur.type) && proposal.trim().startsWith('{')) {
      // la IA entrega figuras y conexiones sin coordenadas: se validan y se colocan aquí
      let m = null
      try {
        m = normalizeModel(JSON.parse(proposal), cur.type, true)
      } catch { /* JSON mal formado */ }
      if (!m || !m.nodes.length) return ui.toast('La respuesta de la IA no es un diagrama válido', true)
      next = JSON.stringify(m)
    }
    setApplied(proposal)
    setCode(next)
    setRev((r) => r + 1)
  }

  const exportAs = useCallback(async (f: 'svg' | 'png' | 'mmd' | 'bpmn'): Promise<void> => {
    if (!cur) return
    try {
      if (f === 'mmd' || f === 'bpmn') return void (await ui.run('diagram:export', title, f, code))
      const svg = await api.current?.svg()
      if (!svg) return ui.toast('El diagrama aún no se ha dibujado', true)
      const p = await ui.run('diagram:export', title, f, f === 'svg' ? svg : await svgToPng(svg))
      if (p) ui.toast('Diagrama exportado')
    } catch (e) {
      ui.toast((e as Error).message, true)
    }
  }, [cur, title, code, ui])

  return (
    <div className={'dg' + (aiOpen && cur ? ' ai' : '')}>
      <aside className="dg-list">
        <Select
          className="dg-new"
          value=""
          ariaLabel="Nuevo diagrama"
          onChange={(v) => void create(v as DiagramType)}
          options={[{ value: '', label: '＋ Nuevo diagrama…', disabled: true }, ...(Object.keys(TYPE_LABEL) as DiagramType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))]}
        />
        {list.map((d) => (
          <button key={d.id} className={'dg-item' + (d.id === curId ? ' on' : '')} onClick={() => open(d)}>
            <b>{d.title}</b>
            <span>{TYPE_LABEL[d.type]}</span>
          </button>
        ))}
        {!list.length && <p className="dg-hint">Crea tu primer diagrama: BPMN, flujo, UML o ER.</p>}
      </aside>

      <section className="dg-main">
        {cur ? (
          <>
            <header className="dg-head">
              <input className="dg-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título del diagrama" />
              <small>{TYPE_LABEL[cur.type]}</small>
              <span className="grow" />
              <Select
                className="mini-sel"
                value=""
                ariaLabel="Exportar"
                onChange={(v) => void exportAs(v as 'svg' | 'png' | 'mmd' | 'bpmn')}
                options={[
                  { value: '', label: 'Exportar…', disabled: true },
                  { value: 'png', label: 'Imagen PNG' },
                  { value: 'svg', label: 'Vector SVG' },
                  ...(cur.type === 'bpmn' ? [{ value: 'bpmn', label: 'Archivo .bpmn (XML)' }] : legacy ? [{ value: 'mmd', label: 'Código Mermaid (.mmd)' }] : [])
                ]}
              />
              <button className={'btn' + (aiOpen ? ' primary' : '')} onClick={() => (aiOpen ? setAiOpen(false) : void askAi())}>✦ IA</button>
              <button className="btn" onClick={() => void remove()}>Eliminar</button>
            </header>
            {legacy && <p className="dg-hint dg-legacy">Este diagrama está en código Mermaid. Pídele a la IA «pasa este diagrama a figuras» (✦ IA) para editarlo con la paleta de figuras.</p>}
            <div className={'dg-work' + (cur.type === 'bpmn' || !legacy ? ' bpmn' : '')}>
              {cur.type === 'bpmn' ? (
                <BpmnPane key={`${cur.id}-${rev}`} xml={code} onChange={setCode} api={api} />
              ) : !legacy ? (
                <DiagramCanvas key={`${cur.id}-${rev}`} type={cur.type} code={code} onChange={setCode} api={api} />
              ) : (
                <>
                  <textarea className="dg-code" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Código Mermaid" />
                  <MermaidPane code={code} api={api} />
                </>
              )}
            </div>
          </>
        ) : (
          <div className="dg-empty">
            <h2>Diagramas</h2>
            <p>Dibuja BPMN, diagramas de flujo, UML (secuencia, clases, estados) y entidad-relación. Edítalos a mano o pídele a la IA que los genere y los retoque.</p>
          </div>
        )}
      </section>

      {aiOpen && cur && (
        <aside className="dg-ai">
          {!convId ? (
            <div className="dg-ai-start">
              <p>La IA verá el diagrama actual y responderá con uno nuevo que podrás aplicar.</p>
              <label>Tarea (da el contexto y la carpeta de trabajo)
                <Select
                  value={effTask}
                  ariaLabel="Tarea"
                  onChange={(v) => { setTaskId(v); localStorage.setItem('dgTask', v) }}
                  options={tasks.map((t) => ({ value: t.id, label: t.title }))}
                />
              </label>
              <button className="btn primary" onClick={() => void askAi()}>Empezar conversación</button>
            </div>
          ) : (
            <>
              <div className="dg-ai-bar">
                <ProfileSelect convId={convId} />
                {proposal && proposal !== code && proposal !== applied && <button className="btn primary" onClick={apply} title="Reemplaza el diagrama por el último bloque de código de la IA">Aplicar al diagrama</button>}
              </div>
              <div className="dg-ai-chat"><ChatView key={convId} convId={convId} embedded /></div>
            </>
          )}
        </aside>
      )}
    </div>
  )
}
