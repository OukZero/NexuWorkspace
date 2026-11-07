import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ContextKind, ContextPreview, PromptTemplate } from '../../../shared/types'
import { ALL_CONTEXT, CONTEXT_HINT, CONTEXT_LABEL } from '../../../shared/templates'
import { findTask, useDB } from '../store'
import { Menu } from './Menu'

/**
 * Qué contexto se anexa solo al próximo mensaje. Cada pieza se activa o no con un clic; «Ver» muestra el texto exacto
 * que recibirá el modelo (así se sabe qué se envía y cuánto pesa).
 */
export function ContextBar({ taskId, kinds, onChange, terminalText }: { taskId: string; kinds: ContextKind[]; onChange: (k: ContextKind[]) => void; terminalText: string }): ReactNode {
  const db = useDB()
  const task = findTask(db, taskId)
  const [preview, setPreview] = useState<ContextPreview | null>(null)
  const [open, setOpen] = useState(false)
  const notes = task?.sessions?.length ?? 0

  const toggle = (k: ContextKind): void => onChange(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])

  // vista previa al abrirla y cada vez que cambian las piezas
  useEffect(() => {
    if (!open) return
    let alive = true
    if (!kinds.length) {
      setPreview(null)
      return
    }
    void window.api
      .call('chat:context', taskId, kinds.filter((k) => k !== 'terminal'))
      .then((p) => {
        if (!alive) return
        const term = kinds.includes('terminal') && terminalText.trim() ? `\n\n## Salida reciente de la terminal\n${terminalText.trim().slice(-6000)}` : ''
        setPreview({ ...p, text: p.text + term, chars: p.chars + term.length })
      })
      .catch(() => alive && setPreview(null))
    return () => {
      alive = false
    }
  }, [open, kinds, taskId, terminalText])

  const disabled = (k: ContextKind): string | null => {
    if (k === 'notes' && !notes) return 'Aún no hay notas de sesión en esta tarea'
    if (k === 'terminal' && !terminalText.trim()) return 'La terminal de la tarea está vacía'
    return null
  }

  return (
    <div className="ctxbar">
      <span className="ctx-lead" title="Datos de apoyo que se anexan solos a tu próximo mensaje">
        Contexto
      </span>
      {ALL_CONTEXT.map((k) => {
        const off = disabled(k)
        return (
          <button key={k} type="button" className={`ctx-chip ${kinds.includes(k) && !off ? 'on' : ''}`} disabled={!!off} title={off ?? CONTEXT_HINT[k]} aria-pressed={kinds.includes(k)} onClick={() => toggle(k)}>
            {CONTEXT_LABEL[k]}
            {k === 'notes' && notes > 0 ? ` · ${notes}` : ''}
          </button>
        )
      })}
      {kinds.length > 0 && (
        <>
          <button type="button" className="ctx-link" onClick={() => setOpen((o) => !o)}>
            {open ? 'Ocultar' : 'Ver lo que se envía'}
          </button>
          <button type="button" className="ctx-link" onClick={() => onChange([])}>
            Quitar todo
          </button>
        </>
      )}
      {open && (
        <div className="ctx-preview">
          {preview ? (
            <>
              <div className="meta">
                {preview.chars.toLocaleString('es')} caracteres (≈ {Math.round(preview.chars / 4).toLocaleString('es')} tokens){preview.chars > 40000 ? ' · es mucho: considera quitar el diff' : ''}
              </div>
              <pre>{preview.text || 'No hay datos para estas piezas todavía.'}</pre>
            </>
          ) : (
            <div className="meta">Cargando…</div>
          )}
        </div>
      )}
    </div>
  )
}

/** Plantillas de prompts: las fijadas salen como botones, todas están en el menú y se buscan con «#» en el cuadro. */
export function TemplateMenu({ templates, onPick }: { templates: PromptTemplate[]; onPick: (t: PromptTemplate) => void }): ReactNode {
  return (
    <Menu
      trigger="📋 Plantillas"
      title="Prompts listos para usar (se editan en Ajustes → Chat e IA). Escribe # en el cuadro para buscarlas."
      align="start"
      side="top"
      items={
        templates.length
          ? templates.map((t) => ({ label: t.name, hint: t.text.replace(/\s+/g, ' ').slice(0, 70) + '…', onSelect: () => onPick(t) }))
          : [{ label: 'No hay plantillas: créalas en Ajustes', disabled: true, onSelect: () => {} }]
      }
    />
  )
}
