import type { ReactNode } from 'react'
import type { LimitWindow } from '../../../shared/types'

export const pctOf = (x: number): number => Math.round(Math.max(0, Math.min(1, x)) * 100)

/** Medidor de 270° para un límite de uso: acento hasta 70 %, ámbar desde 70 % y rojo desde 90 %. */
export function Arc({ label, w }: { label: string; w?: LimitWindow }): ReactNode {
  const v = w ? Math.max(0, Math.min(1, w.utilization)) : 0
  const r = 40
  const c = 2 * Math.PI * r
  const left = w ? Math.max(0, w.resetsAt - Date.now() / 1000) : 0
  const reset = !w ? 'sin datos' : left <= 0 ? 'ya se reinició' : left < 3600 ? `reinicia en ${Math.ceil(left / 60)} min` : left < 86400 ? `reinicia en ${Math.floor(left / 3600)} h ${Math.round((left % 3600) / 60)} min` : `reinicia en ${Math.floor(left / 86400)} d ${Math.round((left % 86400) / 3600)} h`
  const col = v >= 0.9 ? 'var(--danger)' : v >= 0.7 ? 'var(--warn)' : 'var(--accent)'
  const arc = (f: number): string => `${0.75 * c * f} ${c}`
  return (
    <div className="hm-arc" role="progressbar" aria-label={label} aria-valuenow={pctOf(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className="g">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <g transform="rotate(135 50 50)" fill="none" strokeWidth="9" strokeLinecap="round">
            <circle cx="50" cy="50" r={r} stroke="var(--line)" strokeDasharray={arc(1)} />
            {w && <circle cx="50" cy="50" r={r} stroke={col} strokeDasharray={arc(Math.max(0.01, v))} style={{ transition: 'stroke-dasharray .6s' }} />}
          </g>
        </svg>
        <b style={{ color: w ? col : undefined }}>{w ? `${pctOf(v)} %` : '—'}</b>
      </div>
      <span>{label}</span>
      <small>{reset}</small>
    </div>
  )
}

/** Proyección del cierre semanal: uso actual / fracción de la ventana de 7 días ya transcurrida (solo con ≥5 % transcurrido). */
export function weekPace(sd?: LimitWindow): { pct: number } | null {
  const elapsed = sd ? 1 - Math.max(0, sd.resetsAt - Date.now() / 1000) / (7 * 86400) : 0
  return sd && elapsed >= 0.05 && elapsed <= 1 ? { pct: Math.round((sd.utilization / elapsed) * 100) } : null
}
