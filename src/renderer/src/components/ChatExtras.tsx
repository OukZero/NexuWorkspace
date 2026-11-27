import * as Popover from '@radix-ui/react-popover'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { ChatUsage, ContextKind, ContextPreview, PromptTemplate, RateLimits, Settings } from '../../../shared/types'
import { contextAdvice, fmtTokens } from '../../../shared/advice'
import { ALL_CONTEXT, CONTEXT_HINT, CONTEXT_LABEL } from '../../../shared/templates'
import { findTask, useDB } from '../store'
import { G } from './glyphs'
import { Menu } from './Menu'

/**
 * Qué contexto se anexa solo al próximo mensaje. Cada pieza se activa o no con un clic; «Ver» muestra el texto exacto
 * que recibirá el modelo (así se sabe qué se envía y cuánto pesa).
 */
export function ContextBar({ taskId, kinds, onChange, terminalText }: { taskId: string; kinds: ContextKind[]; onChange: (k: ContextKind[]) => void; terminalText: string }): ReactNode {
  const db = useDB()
  const task = findTask(db, taskId)
  const [preview, setPreview] = useState<ContextPreview | null>(null)
  const [pop, setPop] = useState(false)
  const [showPrev, setShowPrev] = useState(false)
  const notes = task?.sessions?.length ?? 0

  const toggle = (k: ContextKind): void => onChange(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])

  // vista previa: solo con el panel abierto y la vista activada; se vuelve a pedir cada vez que cambian las piezas
  useEffect(() => {
    if (!pop || !showPrev) return
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
  }, [pop, showPrev, kinds, taskId, terminalText])

  const disabled = (k: ContextKind): string | null => {
    if (k === 'notes' && !notes) return 'Aún no hay notas de sesión en esta tarea'
    if (k === 'ci' && !task?.branch) return 'La tarea no tiene rama de trabajo'
    if (k === 'terminal' && !terminalText.trim()) return 'La terminal de la tarea está vacía'
    return null
  }
  const on = kinds.filter((k) => !disabled(k))

  // un solo botón dentro del compositor; el detalle se abre en un panel flotante, así no empuja el chat
  return (
    <Popover.Root open={pop} onOpenChange={setPop}>
      <Popover.Trigger asChild>
        <button type="button" className={`ctx-trigger${on.length ? ' on' : ''}`} title={on.length ? `Se anexa a tu próximo mensaje: ${on.map((k) => CONTEXT_LABEL[k].toLowerCase()).join(', ')}` : 'Elegir qué contexto se anexa a tu próximo mensaje'} aria-label="Contexto del mensaje">
          <G n="files" size={13} />
          Contexto
          {on.length > 0 && <em>{on.length}</em>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="ctx-pop" side="top" align="start" sideOffset={8} collisionPadding={12}>
          <div className="ctx-pop-h">
            <b>Contexto de tu próximo mensaje</b>
            <span className="meta">Datos de apoyo que se anexan solos</span>
          </div>
          <div className="ctx-pop-chips">
            {ALL_CONTEXT.map((k) => {
              const off = disabled(k)
              return (
                <button key={k} type="button" className={`ctx-chip ${kinds.includes(k) && !off ? 'on' : ''}`} disabled={!!off} title={off ?? CONTEXT_HINT[k]} aria-pressed={kinds.includes(k)} onClick={() => toggle(k)}>
                  {CONTEXT_LABEL[k]}
                  {k === 'notes' && notes > 0 ? ` · ${notes}` : ''}
                </button>
              )
            })}
          </div>
          <div className="ctx-pop-f">
            {kinds.length > 0 && (
              <button type="button" className="ctx-link" onClick={() => setShowPrev((o) => !o)}>
                {showPrev ? 'Ocultar lo que se envía' : 'Ver lo que se envía'}
              </button>
            )}
            <span className="grow" />
            {kinds.length > 0 && (
              <button type="button" className="ctx-link" onClick={() => onChange([])}>
                Quitar todo
              </button>
            )}
          </div>
          {showPrev && kinds.length > 0 && (
            <div className="ctx-preview">
              {preview ? (
                <>
                  <div className="meta">
                    {preview.chars.toLocaleString('es')} caracteres (≈ {Math.round(preview.chars / 4).toLocaleString('es')} tokens){preview.chars > 40000 ? ' · es mucho: considera quitar el diff' : ''}
                  </div>
                  <pre>{preview.text || 'No hay datos para estas piezas todavía.'}</pre>
                </>
              ) : (
                <div className="skel-list" aria-busy="true"><div className="skel" /><div className="skel" style={{ width: '60%' }} /></div>
              )}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/**
 * Tokens de la conversación junto al botón de contexto: un anillo con el porcentaje de la ventana y, al abrirlo,
 * el detalle (barra con umbrales, desglose y compactar) sin tener que abrir el panel lateral.
 */
export function TokenMeter({ usage, settings, canCompact, onCompact, onPanel }: { usage?: ChatUsage; settings: Settings; canCompact: boolean; onCompact: () => void; onPanel: () => void }): ReactNode {
  const [open, setOpen] = useState(false)
  if (!usage?.contextTokens) return null
  const adv = contextAdvice(usage, settings)
  const win = usage.contextWindow || 0
  const used = usage.contextTokens
  const pct = Math.min(100, adv.pct)
  const mark = (t: number): number => (win ? Math.min(100, (t / win) * 100) : 0)
  const C = 2 * Math.PI * 8
  const rows: [string, string][] = [
    ['Entrada', fmtTokens(usage.inputTokens)],
    ['Salida', fmtTokens(usage.outputTokens)],
    ['Desde caché', fmtTokens(usage.cacheReadTokens)],
    ['Turnos', String(usage.turns)]
  ]
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className={`tk-chip ${adv.level}`} title={`${adv.title}: ${adv.text}`} aria-label={`Tokens de la conversación: ${fmtTokens(used)}${win ? ` de ${fmtTokens(win)}` : ''}`}>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
            <circle cx="10" cy="10" r="8" className="tk-track" />
            <circle cx="10" cy="10" r="8" className="tk-arc" strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 10 10)" />
          </svg>
          <b>{fmtTokens(used)}</b>
          {win > 0 && <span>{Math.round(adv.pct)}%</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={`ctx-pop tk-pop ${adv.level}`} side="top" align="start" sideOffset={8} collisionPadding={12}>
          <div className="tk-head">
            <div className="tk-big">
              <b>{fmtTokens(used)}</b>
              {win > 0 && <span> / {fmtTokens(win)} tokens</span>}
            </div>
            <span className="tk-badge">{adv.title}</span>
          </div>
          {usage.model && (
            <div className="tk-model" title="Modelo que respondió en el último turno (lo informa Claude Code)">
              Modelo en uso: <code>{usage.model}</code>
            </div>
          )}
          <div className="tk-bar">
            <i style={{ width: `${pct}%` }} />
            {win > 0 && <u className="mk warn" style={{ left: `${mark(settings.contextWarnTokens)}%` }} />}
            {win > 0 && <u className="mk crit" style={{ left: `${mark(settings.contextCriticalTokens)}%` }} />}
          </div>
          <p className="tk-text">{adv.text}</p>
          <div className="tk-grid">
            {rows.map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>
          <div className="ctx-pop-f">
            <button type="button" className="ctx-link" onClick={() => { setOpen(false); onPanel() }}>
              Ver más consumo
            </button>
            <span className="grow" />
            <button type="button" className={`tk-compact${adv.level === 'warn' || adv.level === 'critical' ? ' hot' : ''}`} disabled={!canCompact} onClick={() => { setOpen(false); onCompact() }}>
              Compactar
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Tiempo que falta para un reinicio (epoch en segundos), en forma corta: «2 h 10 min», «35 min», «3 d 4 h». */
function untilShort(at: number): string {
  const left = at - Date.now() / 1000
  if (left <= 0) return 'ya se reinició'
  if (left < 3600) return `${Math.max(1, Math.ceil(left / 60))} min`
  if (left < 86400) return `${Math.floor(left / 3600)} h ${Math.round((left % 3600) / 60)} min`
  return `${Math.floor(left / 86400)} d ${Math.round((left % 86400) / 3600)} h`
}

/** Ventana de sesión de la cuenta (5 h): cuánto llevas gastado y en cuánto se reinicia, siempre a la vista. */
export function SessionLimit({ limits }: { limits?: RateLimits }): ReactNode {
  const [, tick] = useState(0)
  // el texto de «en cuánto se reinicia» se refresca cada minuto (sin llamadas: solo repinta)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  const w = limits?.fiveHour
  if (!w || w.resetsAt * 1000 < Date.now()) return null
  const pct = Math.round(Math.max(0, Math.min(1, w.utilization)) * 100)
  const level = pct >= 90 ? 'critical' : pct >= 70 ? 'warn' : 'ok'
  const when = new Date(w.resetsAt * 1000).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  const C = 2 * Math.PI * 8
  return (
    <span className={`tk-chip static ${level}`} title={`Ventana de sesión (5 h): ${pct} % usado. Se reinicia a las ${when}`} role="status" aria-label={`Ventana de sesión: ${pct} por ciento usado, se reinicia en ${untilShort(w.resetsAt)}`}>
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
        <circle cx="10" cy="10" r="8" className="tk-track" />
        <circle cx="10" cy="10" r="8" className="tk-arc" strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 10 10)" />
      </svg>
      <b>{pct}%</b>
      <span>↻ {untilShort(w.resetsAt)}</span>
    </span>
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
