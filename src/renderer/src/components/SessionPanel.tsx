import type { ReactNode } from 'react'
import { contextAdvice, fmtTokens } from '../../../shared/advice'
import type { ChatUsage, Settings } from '../../../shared/types'
import { findTask, useDB } from '../store'
import { useUi } from '../ui'
import { Limit } from './Usage'

const fmtUsd = (n: number): string => (n < 0.01 ? '< $0.01' : `$${n.toFixed(2)}`)

/** Barra de contexto con marcas en los umbrales de recomendación. */
export function ContextMeter({ usage, settings }: { usage?: ChatUsage; settings: Settings }): ReactNode {
  const advice = contextAdvice(usage, settings)
  const win = usage?.contextWindow || 0
  const used = usage?.contextTokens || 0
  const mark = (t: number): number => (win ? Math.min(100, (t / win) * 100) : 0)
  return (
    <div className={`ctx ${advice.level}`} title={`${advice.title}: ${advice.text}`}>
      <div className="ctx-bar">
        <i style={{ width: `${Math.min(100, advice.pct)}%` }} />
        {win > 0 && <b className="mk warn" style={{ left: `${mark(settings.contextWarnTokens)}%` }} />}
        {win > 0 && <b className="mk crit" style={{ left: `${mark(settings.contextCriticalTokens)}%` }} />}
      </div>
      <span className="ctx-n">{used ? `${fmtTokens(used)} / ${fmtTokens(win)}` : '—'}</span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

/** Consumo de la conversación, recomendación de compactar y acciones. */
export function SessionPanel({ convId }: { convId: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const chat = db.chats[convId]
  const u = chat?.usage
  const advice = contextAdvice(u, db.settings)
  const task = findTask(db, chat?.taskId)
  const groups = db.groups.filter((g) => task?.groupIds?.includes(g.id))
  const canCompact = !!chat && chat.messages.some((m) => m.role === 'assistant') && !chat.running

  // /compact es el comando real de Claude Code: resume el contexto dentro de la misma sesión
  const compact = (): void => {
    void ui.run('chat:send', convId, '/compact')
  }

  return (
    <div className="session">
      <div className={`advice ${advice.level}`}>
        <b>{advice.title}</b>
        <div>{advice.text}</div>
      </div>
      <ContextMeter usage={u} settings={db.settings} />
      <div className="stats">
        <Stat label="Contexto" value={u?.contextTokens ? fmtTokens(u.contextTokens) : '—'} />
        <Stat label="Ventana" value={u ? fmtTokens(u.contextWindow) : '—'} />
        <Stat label="Entrada" value={u ? fmtTokens(u.inputTokens) : '—'} />
        <Stat label="Salida" value={u ? fmtTokens(u.outputTokens) : '—'} />
        <Stat label="Caché leída" value={u ? fmtTokens(u.cacheReadTokens) : '—'} />
        <Stat label="Caché nueva" value={u ? fmtTokens(u.cacheCreateTokens) : '—'} />
        <Stat label="Turnos" value={u ? String(u.turns) : '—'} />
        <Stat label="Costo lista" value={u ? fmtUsd(u.costUsd) : '—'} />
      </div>
      <div className="meta" style={{ marginTop: 6 }}>
        {u?.model ? `Modelo ${u.model} · ` : ''}
        {chat?.compactions ? `${chat.compactions} compactación${chat.compactions > 1 ? 'es' : ''} · ` : ''}
        Autocompactar: {db.settings.autocompactTokens ? fmtTokens(db.settings.autocompactTokens) : 'lo decide Claude Code'}
      </div>
      {groups.length > 0 && (
        <div className="meta" style={{ marginTop: 6 }}>
          Carpetas extra: {groups.map((g) => `${g.name} (${g.folders.length})`).join(', ')}
        </div>
      )}
      <h4 style={{ margin: '14px 0 6px' }}>Uso de la cuenta</h4>
      <Limit label="Sesión (ventana de 5 h)" w={db.limits?.fiveHour} />
      <Limit label="Semana (7 días)" w={db.limits?.sevenDay} />
      <div className="meta" style={{ marginTop: 4 }}>
        {db.limits ? `Informado por Claude Code a las ${new Date(db.limits.updatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}; incluye todo el uso de tu cuenta.` : 'Aparece tras la primera respuesta de Claude. Copilot no informa estos límites.'}
      </div>
      <div className="foot" style={{ marginTop: 10 }}>
        <button className={`btn sm ${advice.level === 'critical' || advice.level === 'warn' ? 'primary' : ''}`} disabled={!canCompact} onClick={compact}>
          {chat?.running ? `${chat.provider === 'copilot' ? 'Copilot' : 'Claude'} está trabajando…` : 'Compactar conversación (/compact)'}
        </button>
      </div>
    </div>
  )
}
