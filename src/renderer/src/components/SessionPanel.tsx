import type { ReactNode } from 'react'
import { contextAdvice, fmtTokens } from '../../../shared/advice'
import type { ChatUsage, Settings } from '../../../shared/types'
import { findTask, useDB } from '../store'
import { useUi } from '../ui'
import { RefreshLimits } from './Usage'
import { Arc, weekPace } from './Gauges'

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

/** Consumo: límites de la cuenta, contexto de la conversación y tokens por mensaje. */
export function SessionPanel({ convId }: { convId: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const chat = db.chats[convId]
  const u = chat?.usage
  const advice = contextAdvice(u, db.settings)
  const task = findTask(db, chat?.taskId)
  const groups = db.groups.filter((g) => task?.groupIds?.includes(g.id))
  const canCompact = !!chat && chat.messages.some((m) => m.role === 'assistant') && !chat.running
  const pace = weekPace(db.limits?.sevenDay)
  // el chat no guarda los tokens de cada mensaje: se estiman por longitud (~4 caracteres por token)
  const perMsg = (chat?.messages ?? []).filter((m) => m.role !== 'system').slice(-24).map((m) => ({ role: m.role, n: Math.max(1, Math.round(m.text.length / 4)) }))
  const maxN = Math.max(1, ...perMsg.map((x) => x.n))

  // /compact es el comando real de Claude Code: resume el contexto dentro de la misma sesión
  const compact = (): void => {
    void ui.run('chat:send', convId, '/compact')
  }

  return (
    <div className="session cons">
      <div className="cons-gauges">
        <Arc label="Sesión · 5 h" w={db.limits?.fiveHour} />
        <Arc label="Semana · 7 d" w={db.limits?.sevenDay} />
      </div>
      {!db.limits && <div className="meta">Aparece tras la primera respuesta de Claude. Copilot no informa estos límites.</div>}
      {pace && (
        <div className={`pace${pace.pct >= 100 ? ' over' : ''}`}>
          <span aria-hidden>⚠</span>
          <span>
            Cerrarás la semana en <b>{Math.min(pace.pct, 999)} %</b>
            {pace.pct >= 100 ? ' · conviene bajar el ritmo o usar Haiku' : ''}
          </span>
        </div>
      )}

      <h4 className="cons-h">
        Contexto de esta conversación
        <RefreshLimits />
      </h4>
      <ContextMeter usage={u} settings={db.settings} />
      <div className="cons-rows">
        <div>
          <span>Tokens usados</span>
          <b>{u?.contextTokens ? `${fmtTokens(u.contextTokens)} / ${fmtTokens(u.contextWindow)}` : '—'}</b>
        </div>
        <div>
          <span>Mensajes</span>
          <b>{chat ? chat.messages.filter((m) => m.role !== 'system').length : '—'}</b>
        </div>
        <div>
          <span>Modelo</span>
          <b>{u?.model || 'Predeterminado'}</b>
        </div>
      </div>
      {advice.level !== 'none' && (
        <div className={`advice ${advice.level}`}>
          <b>{advice.title}</b>
          <div>{advice.text}</div>
        </div>
      )}

      {perMsg.length > 0 && (
        <>
          <h4 className="cons-h">Tokens por mensaje</h4>
          <div className="cons-bars" role="img" aria-label="Tokens estimados por mensaje">
            {perMsg.map((x, i) => (
              <i key={i} className={x.role} style={{ height: `${Math.max(6, (x.n / maxN) * 100)}%` }} title={`${x.role === 'user' ? 'Tú' : 'Claude'} · ~${fmtTokens(x.n)} tokens`} />
            ))}
          </div>
          <div className="meta">Estimado por longitud del texto.</div>
        </>
      )}

      <details className="cons-more">
        <summary>Detalle de la sesión</summary>
        <div className="stats">
          <Stat label="Entrada" value={u ? fmtTokens(u.inputTokens) : '—'} />
          <Stat label="Salida" value={u ? fmtTokens(u.outputTokens) : '—'} />
          <Stat label="Caché leída" value={u ? fmtTokens(u.cacheReadTokens) : '—'} />
          <Stat label="Caché nueva" value={u ? fmtTokens(u.cacheCreateTokens) : '—'} />
          <Stat label="Turnos" value={u ? String(u.turns) : '—'} />
          <Stat label="Costo lista" value={u ? fmtUsd(u.costUsd) : '—'} />
        </div>
        <div className="meta" style={{ marginTop: 6 }}>
          {chat?.compactions ? `${chat.compactions} compactación${chat.compactions > 1 ? 'es' : ''} · ` : ''}
          Autocompactar: {db.settings.autocompactTokens ? fmtTokens(db.settings.autocompactTokens) : 'lo decide Claude Code'}
        </div>
        {groups.length > 0 && (
          <div className="meta" style={{ marginTop: 6 }}>
            Carpetas extra: {groups.map((g) => `${g.name} (${g.folders.length})`).join(', ')}
          </div>
        )}
      </details>

      <div className="foot" style={{ marginTop: 10 }}>
        <button className={`btn sm ${advice.level === 'critical' || advice.level === 'warn' ? 'primary' : ''}`} disabled={!canCompact} onClick={compact}>
          {chat?.running ? `${chat.provider === 'copilot' ? 'Copilot' : 'Claude'} está trabajando…` : 'Compactar conversación (/compact)'}
        </button>
      </div>
      <button className="link" onClick={() => ui.go('usage')}>
        Ver el consumo completo →
      </button>
    </div>
  )
}
