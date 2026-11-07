import { useState } from 'react'
import type { ReactNode } from 'react'
import type { ContextKind, PromptTemplate } from '../../../shared/types'
import { ALL_CONTEXT, CONTEXT_HINT, CONTEXT_LABEL, DEFAULT_TEMPLATES, TEMPLATE_VARS } from '../../../shared/templates'

const newId = (): string => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

/** Edita las plantillas de prompts: nombre, texto, si salen como botón rápido, el contexto que traen y si se envían solas. */
export function TemplatesEditor({ value, onChange }: { value: PromptTemplate[]; onChange: (t: PromptTemplate[]) => void }): ReactNode {
  const [sel, setSel] = useState<string>(value[0]?.id ?? '')
  const cur = value.find((t) => t.id === sel) ?? value[0]

  const patch = (p: Partial<PromptTemplate>): void => cur && onChange(value.map((t) => (t.id === cur.id ? { ...t, ...p } : t)))
  const toggleCtx = (k: ContextKind): void => {
    const has = cur?.ctx?.includes(k)
    patch({ ctx: has ? cur?.ctx?.filter((x) => x !== k) : [...(cur?.ctx ?? []), k] })
  }
  const add = (): void => {
    const t: PromptTemplate = { id: newId(), name: 'Nueva plantilla', text: '', pinned: false }
    onChange([...value, t])
    setSel(t.id)
  }
  const dup = (): void => {
    if (!cur) return
    const t = { ...cur, id: newId(), name: cur.name + ' (copia)' }
    onChange([...value, t])
    setSel(t.id)
  }
  const del = (): void => {
    if (!cur) return
    const rest = value.filter((t) => t.id !== cur.id)
    onChange(rest)
    setSel(rest[0]?.id ?? '')
  }
  const move = (d: -1 | 1): void => {
    if (!cur) return
    const i = value.findIndex((t) => t.id === cur.id)
    const j = i + d
    if (j < 0 || j >= value.length) return
    const a = [...value]
    ;[a[i], a[j]] = [a[j], a[i]]
    onChange(a)
  }

  return (
    <div className="tpl-ed">
      <div className="tpl-list" role="listbox" aria-label="Plantillas">
        {value.map((t) => (
          <button key={t.id} role="option" aria-selected={t.id === cur?.id} className={t.id === cur?.id ? 'on' : ''} onClick={() => setSel(t.id)}>
            {t.pinned && <span title="Botón rápido">★ </span>}
            {t.name || '(sin nombre)'}
          </button>
        ))}
        <div className="tpl-list-b">
          <button className="btn sm" onClick={add}>
            ＋ Nueva
          </button>
          <button
            className="btn sm"
            title="Volver a las plantillas que trae la app (se pierden los cambios)"
            onClick={() => {
              onChange(DEFAULT_TEMPLATES.map((t) => ({ ...t })))
              setSel(DEFAULT_TEMPLATES[0].id)
            }}
          >
            Restaurar
          </button>
        </div>
      </div>

      {cur ? (
        <div className="tpl-form">
          <label>Nombre</label>
          <input value={cur.name} onChange={(e) => patch({ name: e.target.value })} />
          <label>Texto del prompt</label>
          <textarea style={{ minHeight: 130 }} value={cur.text} onChange={(e) => patch({ text: e.target.value })} />
          <div className="meta">
            Variables: {TEMPLATE_VARS.map(([v, d]) => (
              <code key={v} title={d} style={{ marginRight: 8 }}>
                {v}
              </code>
            ))}
            · Lo que escribas entre [corchetes] queda seleccionado para completarlo al usarla.
          </div>
          <label>Contexto que trae esta plantilla</label>
          <div className="ctxbar" style={{ padding: 0 }}>
            {ALL_CONTEXT.map((k) => (
              <button key={k} type="button" className={`ctx-chip ${cur.ctx?.includes(k) ? 'on' : ''}`} title={CONTEXT_HINT[k]} aria-pressed={!!cur.ctx?.includes(k)} onClick={() => toggleCtx(k)}>
                {CONTEXT_LABEL[k]}
              </button>
            ))}
          </div>
          <label className="tpl-check">
            <input type="checkbox" checked={!!cur.pinned} onChange={(e) => patch({ pinned: e.target.checked })} />
            Mostrar como botón rápido sobre el cuadro de texto
          </label>
          <label className="tpl-check">
            <input type="checkbox" checked={!!cur.autoSend} onChange={(e) => patch({ autoSend: e.target.checked })} />
            Enviar de inmediato al elegirla (sin dejarla en el cuadro para editarla)
          </label>
          <div className="foot" style={{ marginTop: 6 }}>
            <button className="btn sm" onClick={() => move(-1)} title="Subir en la lista">
              ↑
            </button>
            <button className="btn sm" onClick={() => move(1)} title="Bajar en la lista">
              ↓
            </button>
            <button className="btn sm" onClick={dup}>
              Duplicar
            </button>
            <button className="btn sm danger" onClick={del}>
              Eliminar
            </button>
          </div>
        </div>
      ) : (
        <div className="meta">No hay plantillas. Crea una con «Nueva» o restaura las predeterminadas.</div>
      )}
    </div>
  )
}
