import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { RedmineDay } from '../../../shared/types'
import { useDB } from '../store'
import { dayKey } from '../utils'
import { useUi } from '../ui'
import { G } from './glyphs'

const r2 = (n: number): number => Math.round(n * 100) / 100
/** Horas con coma decimal, como en el resto de la app. */
const f2 = (n: number): string => String(r2(n)).replace('.', ',')
const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

type State = 'off' | 'future' | 'full' | 'over' | 'part' | 'none'
const LABEL: Record<State, string> = { off: 'Sin horas laborables', future: 'Pendiente', full: 'Completo', over: 'Con horas de más', part: 'Incompleto', none: 'Sin imputar' }

/** Mes anterior/siguiente de un 'YYYY-MM'. */
function shift(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + by, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Estado de un día frente a las horas laborables que Redmine espera. */
function stateOf(d: RedmineDay, today: string): State {
  if (d.max === 0 && d.spent === 0) return 'off'
  if (d.day > today) return 'future'
  if (d.spent <= 0) return 'none'
  if (d.spent > d.max + 0.01) return 'over'
  return d.spent >= d.max - 0.01 ? 'full' : 'part'
}

/** Anillo de progreso. */
function Ring({ pct, label, sub }: { pct: number; label: string; sub: string }): ReactNode {
  const r = 52
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, pct))
  return (
    <div className="rm-ring">
      <svg viewBox="0 0 130 130" role="img" aria-label={`${label} ${sub}`}>
        <circle cx="65" cy="65" r={r} className="rm-ring-bg" />
        <circle cx="65" cy="65" r={r} className="rm-ring-fg" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 65 65)" />
      </svg>
      <div className="rm-ring-t">
        <b>{label}</b>
        <span>{sub}</span>
      </div>
    </div>
  )
}

/** Revisión de lo imputado en Redmine, día a día, frente a lo registrado en Shutoki. */
export function RedmineView(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [month, setMonth] = useState(dayKey(new Date()).slice(0, 7))
  const [rawDays, setDays] = useState<RedmineDay[]>([])
  // la meta diaria es la de Ajustes (8 h por defecto) en los días laborables; los festivos y fines de semana (0 h en Redmine) siguen en 0
  const target = db.settings.targetHours || 8
  const days = useMemo(() => rawDays.map((d) => ({ ...d, max: d.max > 0 ? target : 0 })), [rawDays, target])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (): Promise<void> => {
    const [y, m] = month.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    setLoading(true)
    setError('')
    // se llama directo (no con ui.run) para dejar también el error en pantalla
    const r = await window.api.call('redmine:days', `${month}-01`, `${month}-${String(last).padStart(2, '0')}`).catch((e: Error) => {
      setError(e.message)
      return null
    })
    setLoading(false)
    if (r) setDays(r)
  }, [month])

  useEffect(() => {
    void load()
  }, [load])

  // horas de Shutoki por día: total registrado y lo que aún no se imputó
  const mine = useMemo(() => {
    const m: Record<string, { total: number; pending: number }> = {}
    for (const e of db.entries) {
      if (e.end === null) continue
      const d = dayKey(new Date(e.start))
      if (!d.startsWith(month)) continue
      const h = (e.end - e.start) / 3600000
      const x = (m[d] ??= { total: 0, pending: 0 })
      x.total += h
      if (!e.rmSent) x.pending += h
    }
    return m
  }, [db.entries, month])

  const today = dayKey(new Date())
  const spent = days.reduce((a, d) => a + d.spent, 0)
  const max = days.reduce((a, d) => a + d.max, 0)
  const maxToDate = days.filter((d) => d.day <= today).reduce((a, d) => a + d.max, 0)
  const spentToDate = days.filter((d) => d.day <= today).reduce((a, d) => a + d.spent, 0)
  const missing = days.filter((d) => d.day <= today).reduce((a, d) => a + Math.max(0, d.max - d.spent), 0)
  const shutoki = Object.values(mine).reduce((a, d) => a + d.total, 0)
  const pending = Object.values(mine).reduce((a, d) => a + d.pending, 0)
  const states = days.map((d) => stateOf(d, today))
  const count = (s: State): number => states.filter((x) => x === s).length

  const yMax = Math.max(8, ...days.map((d) => Math.max(d.max, d.spent, (mine[d.day]?.total ?? 0) + 0))) * 1.08
  const pct = (h: number): string => `${Math.min(100, (h / yMax) * 100)}%`

  const [y, m] = month.split('-').map(Number)
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7 // el calendario empieza en lunes

  return (
    <>
      <div className="rm-tools">
        <div className="rm-month" role="group" aria-label="Mes">
          <button aria-label="Mes anterior" onClick={() => setMonth(shift(month, -1))}>
            <G n="chevron" size={15} />
          </button>
          <span>
            {MONTHS[m - 1]} <b>{y}</b>
          </span>
          <button aria-label="Mes siguiente" onClick={() => setMonth(shift(month, 1))}>
            <G n="chevron" size={15} />
          </button>
        </div>
        <button className="rm-pill" disabled={month === today.slice(0, 7)} onClick={() => setMonth(today.slice(0, 7))}>
          Hoy
        </button>
        <span className="grow" />
        <button className="rm-pill" disabled={loading} onClick={() => void load()}>
          <i className={loading ? 'spin' : ''}>
            <G n="reset" size={13} />
          </i>{' '}
          {loading ? 'Leyendo…' : 'Actualizar'}
        </button>
        <button className="rm-pill ghost" onClick={() => void ui.run('redmine:login')}>
          <G n="popout" size={13} /> Abrir Redmine
        </button>
      </div>
      {error && <div className="empty" style={{ marginBottom: 12 }}>⚠ {error}</div>}
      {!db.settings.redmineUrl && (
        <div className="rm-alert">
          <G n="settings" size={15} />
          <span>
            Falta la dirección de Redmine.{' '}
            <button className="rm-link" onClick={() => ui.go('settings')}>
              Configúrala en Ajustes
            </button>{' '}
            para ver tus horas imputadas.
          </span>
        </div>
      )}

      <div className="rm-top">
        <div className="rm-card rm-ringcard">
          <Ring pct={max ? spent / max : 0} label={`${max ? Math.round((spent / max) * 100) : 0}%`} sub={`${MONTHS[m - 1]} ${y}`} />
          <div className="rm-legend">
            <div>
              <i style={{ background: 'var(--accent2)' }} /> Al día: <b>{r2(spentToDate)}</b> de {r2(maxToDate)} h
            </div>
            <div>
              <i style={{ background: 'var(--line)' }} /> Mes completo: <b>{r2(spent)}</b> de {r2(max)} h
            </div>
          </div>
        </div>
        <div className="rm-kpis">
          <div className="rm-card rm-kpi" style={{ ['--k' as string]: 'var(--accent2)' }}>
            <span>Imputado</span>
            <b>
              {f2(spent)}<em>h</em>
            </b>
            <small>{count('full') + count('over')} días completos</small>
          </div>
          <div className="rm-card rm-kpi" style={{ ['--k' as string]: missing > 0.01 ? 'var(--warn)' : 'var(--accent2)' }}>
            <span>Faltan hasta hoy</span>
            <b>
              {f2(missing)}<em>h</em>
            </b>
            <small>{count('part') + count('none')} días por completar</small>
          </div>
          <div className="rm-card rm-kpi" style={{ ['--k' as string]: pending > 0.01 ? 'var(--danger)' : 'var(--accent)' }}>
            <span>En Shutoki sin enviar</span>
            <b>
              {f2(pending)}<em>h</em>
            </b>
            <small>de {r2(shutoki)} h registradas</small>
          </div>
          <div className="rm-card rm-kpi" style={{ ['--k' as string]: 'var(--accent)' }}>
            <span>Horas laborables</span>
            <b>
              {f2(max)}<em>h</em>
            </b>
            <small>{days.filter((d) => d.max > 0).length} días del mes</small>
          </div>
        </div>
      </div>

      <div className="rm-card">
        <div className="rm-h">
          <span className="rm-eb">Horas por día</span>
          <span className="rm-keys">
            <i style={{ background: 'var(--accent2)' }} /> Redmine
            <i className="ghost" /> Shutoki sin enviar
            <i className="dash" /> Laborables
          </span>
        </div>
        {days.length ? (
          <div className="rm-chart">
            {days.map((d, i) => {
              const s = states[i]
              const mm = mine[d.day]
              return (
                <div key={d.day} className={`rm-col s-${s} ${d.day === today ? 'today' : ''}`} title={`${DOW[new Date(`${d.day}T00:00:00`).getDay()]} ${d.day.slice(8)} · Redmine ${r2(d.spent)} h de ${r2(d.max)} h${mm ? ` · Shutoki ${r2(mm.total)} h (${r2(mm.pending)} sin enviar)` : ''}`}>
                  <div className="rm-plot">
                    {d.max > 0 && <div className="rm-target" style={{ bottom: pct(d.max) }} />}
                    {d.spent > 0 && <div className="rm-bar" style={{ height: pct(d.spent) }} />}
                    {mm && mm.pending > 0.004 && <div className="rm-ghost" style={{ bottom: pct(d.spent), height: pct(mm.pending) }} />}
                  </div>
                  <span>{d.day.slice(8)}</span>
                </div>
              )
            })}
          </div>
        ) : (
          loading ? (
            <div className="skel-bars" aria-busy="true" aria-label="Leyendo Redmine">
              {[40, 65, 30, 80, 55, 70, 45, 60].map((h, i) => (
                <div key={i} className="skel" style={{ height: `${h}px` }} />
              ))}
            </div>
          ) : (
            <div className="rm-empty">
              <G n="usage" size={26} />
              <b>Sin datos todavía</b>
              <span>Inicia sesión en Redmine y pulsa «Actualizar».</span>
            </div>
          )
        )}
      </div>

      {days.length > 0 && (
        <div className="rm-card">
          <div className="rm-h">
            <span className="rm-eb">Calendario</span>
            <span className="rm-keys">
              {(['full', 'over', 'part', 'none', 'future'] as State[]).map((s) => (
                <span key={s}>
                  <i className={`sw s-${s}`} /> {LABEL[s]}
                </span>
              ))}
            </span>
          </div>
          <div className="rm-cal">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((n, i) => (
              <em key={i}>{n}</em>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <span key={`b${i}`} />
            ))}
            {days.map((d, i) => (
              <div key={d.day} className={`rm-day s-${states[i]} ${d.day === today ? 'today' : ''}`} title={`${d.day} · ${LABEL[states[i]]}`}>
                <b>{Number(d.day.slice(8))}</b>
                <small>{d.spent ? `${r2(d.spent)} h` : d.max ? `0/${r2(d.max)}` : ''}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
