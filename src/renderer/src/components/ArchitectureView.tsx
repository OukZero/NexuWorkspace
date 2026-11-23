import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ArchDoc } from '../../../shared/types'
import { useUi } from '../ui'
import { Markdown } from './Markdown'

const KINDS = ['App web', 'API / backend', 'App de escritorio', 'Integración entre sistemas', 'Datos / analítica', 'Automatización', 'Móvil', 'Otro']
const SCOPES: { id: ArchDoc['scope']; label: string; hint: string }[] = [
  { id: 'small', label: 'Pequeño', hint: 'Prototipo o herramienta interna: simplicidad primero' },
  { id: 'medium', label: 'Mediano', hint: 'Producto con equipo pequeño: equilibrio' },
  { id: 'large', label: 'Grande', hint: 'Producción crítica: escala y operación' }
]
// los botones guían el orden natural: aclarar → opciones → comparar → detallar → ADR
const STEPS: { id: string; label: string; hint: string }[] = [
  { id: 'start', label: '1 · Aclarar', hint: 'Claude resume y pregunta lo que falta' },
  { id: 'options', label: '2 · Proponer opciones', hint: '2-3 arquitecturas según tipo y alcance' },
  { id: 'compare', label: '3 · Comparar', hint: 'Tabla de criterios y veredicto' },
  { id: 'decide', label: '4 · Elegir y detallar', hint: 'Componentes, datos, carpetas y fases' },
  { id: 'adr', label: '5 · Generar ADR', hint: 'Registro de la decisión' }
]

interface Form { id?: string; title: string; kind: string; scope: ArchDoc['scope']; dir: string; brief: string }
const EMPTY: Form = { title: '', kind: KINDS[0]!, scope: 'medium', dir: '', brief: '' }

export function ArchitectureView(): ReactNode {
  const ui = useUi()
  const [docs, setDocs] = useState<ArchDoc[]>([])
  const [curId, setCurId] = useState<string | null>(null)
  const [form, setForm] = useState<Form | null>(null) // formulario de alta/edición
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const cur = docs.find((d) => d.id === curId) ?? null

  useEffect(() => {
    void ui.run('arch:list').then((l) => {
      if (!l) return
      setDocs(l)
      if (l[0]) setCurId(l[0].id)
      else setForm({ ...EMPTY })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // con llaves: un efecto no debe devolver nada que no sea su limpieza, o React falla al desmontar
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [cur?.messages.length, busy])

  const upsert = (d: ArchDoc): void => setDocs((l) => [d, ...l.filter((x) => x.id !== d.id)])

  const save = async (): Promise<void> => {
    if (!form || !form.title.trim()) return ui.toast('Ponle un título al diseño', true)
    const d = await ui.run('arch:save', form)
    if (!d) return
    upsert(d)
    setCurId(d.id)
    setForm(null)
  }

  const ask = async (step: string, msg?: string): Promise<void> => {
    if (!cur || busy) return
    setBusy(true)
    try {
      const d = await ui.run('arch:ask', cur.id, step, msg)
      if (d) {
        upsert(d)
        if (msg) setText('')
      }
    } finally {
      setBusy(false)
    }
  }

  const remove = async (d: ArchDoc): Promise<void> => {
    if (!window.confirm(`¿Eliminar «${d.title}»?`)) return
    const l = await ui.run('arch:delete', d.id)
    if (!l) return
    setDocs(l)
    setCurId(l[0]?.id ?? null)
    if (!l.length) setForm({ ...EMPTY })
  }

  const set = (p: Partial<Form>): void => setForm((f) => (f ? { ...f, ...p } : f))

  return (
    <div className="arch">
      <aside className="arch-list">
        <button className="btn primary" onClick={() => setForm({ ...EMPTY })}>＋ Nuevo diseño</button>
        {docs.map((d) => (
          <button key={d.id} className={'arch-item' + (d.id === curId && !form ? ' on' : '')} onClick={() => { setCurId(d.id); setForm(null) }}>
            <b>{d.title}</b>
            <span>{d.kind} · {SCOPES.find((s) => s.id === d.scope)?.label}</span>
          </button>
        ))}
      </aside>

      <section className="arch-main">
        {form ? (
          <div className="arch-form">
            <h2>{form.id ? 'Editar diseño' : 'Nuevo diseño de arquitectura'}</h2>
            <label>Título<input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Ej.: Portal de clientes con facturación" autoFocus /></label>
            <label>Tipo de solución
              <select value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
                {KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
            <div className="arch-scope" role="radiogroup" aria-label="Alcance">
              {SCOPES.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={form.scope === s.id} className={form.scope === s.id ? 'on' : ''} onClick={() => set({ scope: s.id })}>
                  <b>{s.label}</b><span>{s.hint}</span>
                </button>
              ))}
            </div>
            <label>Describe el problema (qué hay que resolver, quién lo usa, restricciones)
              <textarea rows={6} value={form.brief} onChange={(e) => set({ brief: e.target.value })} placeholder="Ej.: Los clientes deben ver y pagar sus facturas. Unos 2.000 usuarios, integra con el ERP actual, equipo de 3 devs en TypeScript…" />
            </label>
            <label>Proyecto existente (opcional: Claude lo lee para ser coherente con lo que ya hay)
              <span className="arch-dir">
                <input value={form.dir} onChange={(e) => set({ dir: e.target.value })} placeholder="Sin carpeta: diseño desde cero" />
                <button type="button" className="btn" onClick={() => void ui.run('folder:pick').then((p) => p && set({ dir: p }))}>Elegir…</button>
              </span>
            </label>
            <div className="arch-actions">
              <button className="btn primary" onClick={() => void save()}>{form.id ? 'Guardar' : 'Crear y empezar'}</button>
              {docs.length > 0 && <button className="btn" onClick={() => setForm(null)}>Cancelar</button>}
            </div>
          </div>
        ) : cur ? (
          <>
            <header className="arch-head">
              <div>
                <h2>{cur.title}</h2>
                <small>{cur.kind} · alcance {SCOPES.find((s) => s.id === cur.scope)?.label.toLowerCase()}{cur.dir ? ` · ${cur.dir}` : ''}</small>
              </div>
              <div className="arch-actions">
                <button className="btn" onClick={() => setForm({ id: cur.id, title: cur.title, kind: cur.kind, scope: cur.scope, dir: cur.dir, brief: cur.brief })}>Editar</button>
                <button className="btn" disabled={!cur.messages.length} onClick={() => void navigator.clipboard.writeText(cur.messages.filter((m) => m.role === 'assistant').map((m) => m.text).join('\n\n---\n\n')).then(() => ui.toast('Copiado en Markdown'))}>Copiar todo</button>
                <button className="btn" onClick={() => void remove(cur)}>Eliminar</button>
              </div>
            </header>

            <div className="arch-steps">
              {STEPS.map((s) => (
                <button key={s.id} className="btn" title={s.hint} disabled={busy} onClick={() => void ask(s.id)}>{s.label}</button>
              ))}
            </div>

            <div className="arch-chat">
              {!cur.messages.length && !busy && <p className="arch-empty">Pulsa <b>1 · Aclarar</b> para que Claude te haga las preguntas clave, o salta a <b>Proponer opciones</b> si ya describiste todo.</p>}
              {cur.messages.map((m, i) => (
                <div key={i} className={'arch-msg ' + m.role}>
                  {m.role === 'user' ? <p>{m.text}</p> : <Markdown text={m.text} />}
                </div>
              ))}
              {busy && <div className="arch-msg assistant arch-busy">Claude está pensando{cur.dir ? ' y leyendo el proyecto' : ''}…</div>}
              <div ref={end} />
            </div>

            <form className="arch-input" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void ask('free', text) }}>
              <textarea rows={2} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} placeholder="Responde a Claude, elige una opción («voy con la B») o pregunta lo que quieras…"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) void ask('free', text) } }} />
              <button className="btn primary" disabled={busy || !text.trim()}>Enviar</button>
            </form>
          </>
        ) : null}
      </section>
    </div>
  )
}
