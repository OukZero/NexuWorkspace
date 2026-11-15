import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { fmtTokens } from '../../../shared/advice'
import type { LimitWindow, UsageRecord } from '../../../shared/types'
import { findTask, useDB } from '../store'
import { useUi } from '../ui'
import { dayKey } from '../utils'
import { EmptyState } from './EmptyState'
import { G } from './glyphs'

const fmtUsd = (n: number): string => `$${n.toFixed(2)}`
const DAY = 86400000

interface Totals {
  input: number
  output: number
  cacheRead: number
  cacheCreate: number
  cost: number
  turns: number
}

const sum = (rs: UsageRecord[]): Totals =>
  rs.reduce<Totals>(
    (a, r) => ({
      input: a.input + r.input,
      output: a.output + r.output,
      cacheRead: a.cacheRead + r.cacheRead,
      cacheCreate: a.cacheCreate + r.cacheCreate,
      cost: a.cost + r.costUsd,
      turns: a.turns + 1
    }),
    { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, cost: 0, turns: 0 }
  )

// tokens "nuevos" procesados: lo que se paga a precio completo (la lectura de caché va aparte)
const fresh = (t: Totals): number => t.input + t.output + t.cacheCreate

/** Tiempo que falta para el reinicio: «en 2 h 10 min», «en 3 d 4 h»… */
export function untilReset(epochSec: number): string {
  const mins = Math.max(0, Math.round((epochSec * 1000 - Date.now()) / 60000))
  if (mins < 1) return 'en instantes'
  if (mins < 60) return `en ${mins} min`
  if (mins < 1440) return `en ${Math.floor(mins / 60)} h ${mins % 60} min`
  return `en ${Math.floor(mins / 1440)} d ${Math.floor((mins % 1440) / 60)} h`
}

export function Limit({ label, w, plain }: { label: string; w?: LimitWindow; plain?: boolean }): ReactNode {
  if (!w) return <div className="limit meta">{label}: sin datos todavía</div>
  const pct = Math.min(100, Math.round(w.utilization * 100))
  const cls = pct >= 90 ? 'critical' : pct >= 70 ? 'warn' : 'ok'
  const reset = new Date(w.resetsAt * 1000)
  const when = reset.toLocaleString('es', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <div className={`bc limit ${cls}`}>
      <div className="limit-h">
        <b>{label}</b>
        <span>{pct} %{plain ? '' : ' usado'}</span>
      </div>
      <div className="ctx-bar big">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="meta">Se reinicia {untilReset(w.resetsAt)} · {when}</div>
    </div>
  )
}

/** Botón ↻: consulta a Claude Code los límites actuales de la cuenta (no depende de que haya un chat abierto). */
export function RefreshLimits(): ReactNode {
  const ui = useUi()
  const [busy, setBusy] = useState(false)
  const refresh = async (): Promise<void> => {
    setBusy(true)
    const ok = await ui.run('usage:refresh') // si falla, ui.run ya muestra el error
    setBusy(false)
    if (ok) ui.toast('Límites actualizados')
  }
  return (
    <button className="btn sm refresh-limits" disabled={busy} onClick={() => void refresh()} aria-label="Actualizar límites de la cuenta" title="Actualizar límites de la cuenta">
      <G n="reset" size={13} /> {busy ? 'Actualizando…' : 'Actualizar'}
    </button>
  )
}

export function Usage(): ReactNode {
  const db = useDB()
  const now = Date.now()
  const startToday = new Date()
  startToday.setHours(0, 0, 0, 0)

  const view = useMemo(() => {
    const t0 = startToday.getTime()
    const recs = db.usage.filter((r) => r.provider !== 'copilot') // lo de Copilot va en su propia sección
    const within = (from: number): UsageRecord[] => recs.filter((r) => r.ts >= from)
    const days: Array<{ key: string; label: string; value: number }> = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(t0 - i * DAY)
      const rs = recs.filter((r) => dayKey(new Date(r.ts)) === dayKey(d))
      days.push({ key: dayKey(d), label: `${d.getDate()}/${d.getMonth() + 1}`, value: fresh(sum(rs)) })
    }
    const byTask = new Map<string, UsageRecord[]>()
    for (const r of within(t0 - 29 * DAY)) byTask.set(r.taskId, [...(byTask.get(r.taskId) ?? []), r])
    return {
      today: sum(within(t0)),
      week: sum(within(t0 - 6 * DAY)),
      month: sum(within(t0 - 29 * DAY)),
      days,
      tasks: [...byTask.entries()].map(([id, rs]) => ({ id, t: sum(rs) })).sort((a, b) => b.t.cost - a.t.cost)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.usage])

  // Copilot: las solicitudes premium se reinician cada mes (el 1.º a las 00:00 UTC)
  const cop = useMemo(() => {
    const n = new Date()
    const from = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)
    const next = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1))
    const rs = db.usage.filter((r) => r.provider === 'copilot' && r.ts >= from)
    const byModel = new Map<string, { premium: number; turns: number; tokens: number }>()
    for (const r of rs) {
      const m = byModel.get(r.model || '(desconocido)') ?? { premium: 0, turns: 0, tokens: 0 }
      m.premium += r.premium ?? 0
      m.turns += 1
      m.tokens += r.input + r.output + r.cacheCreate
      byModel.set(r.model || '(desconocido)', m)
    }
    return { used: rs.reduce((a, r) => a + (r.premium ?? 0), 0), turns: rs.length, next, models: [...byModel.entries()].sort((a, b) => b[1].premium - a[1].premium) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.usage])
  const quota = db.settings.copilotQuota
  const left = quota > 0 ? Math.max(0, quota - cop.used) : null
  const copPct = quota > 0 ? Math.min(100, Math.round((cop.used / quota) * 100)) : 0

  const max = Math.max(1, ...view.days.map((d) => d.value))
  const periods: Array<[string, Totals]> = [
    ['Hoy', view.today],
    ['Últimos 7 días', view.week],
    ['Últimos 30 días', view.month]
  ]
  const stale = db.limits && now - db.limits.updatedAt > 3600000

  return (
    <div className="kz">
      <div className="eyebrow kz-eb">
        Límites de tu plan <RefreshLimits />
      </div>
      <div className="kz-limits">
        <Limit label="Ventana de 5 horas" w={db.limits?.fiveHour} plain />
        <Limit label="Semana (7 días)" w={db.limits?.sevenDay} plain />
      </div>
      <div className="kz-note">
        {db.limits
          ? `Informado por Claude Code a las ${new Date(db.limits.updatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}${stale ? ' — puede estar desactualizado: pulsa Actualizar' : ''}. Incluye todo el uso de tu cuenta, no solo esta app.`
          : 'Se mostrará después de la primera respuesta de Claude en un chat.'}
      </div>

      <div className="kz-row">
        <section className={`bc kz-cop ${copPct >= 90 ? 'critical' : copPct >= 70 ? 'warn' : ''}`}>
          <div className="eyebrow">GitHub Copilot · este mes</div>
          <div className="kz-cop-h">
            <b>Solicitudes premium</b>
            <span className="kz-cop-n">
              {Math.round(cop.used * 100) / 100}
              <small>{quota > 0 ? ` de ${quota} usadas` : ' usadas'}</small>
            </span>
          </div>
          {quota > 0 && (
            <div className="kz-bar">
              <i style={{ width: `${copPct}%` }} />
            </div>
          )}
          <div className="kz-sm">
            {quota > 0
              ? `Te quedan aprox. ${Math.round((left ?? 0) * 100) / 100} · se reinicia el ${cop.next.toLocaleDateString('es', { day: 'numeric', month: 'long' })}. `
              : 'Define tus solicitudes mensuales en Ajustes para ver cuántas te quedan. '}
            Solo cuenta el uso desde esta app.
          </div>
          {cop.models.length > 0 && (
            <div className="kz-models">
              {cop.models.map(([m, v]) => (
                <div key={m} className="kz-model" title={`${v.turns} respuestas · ${fmtTokens(v.tokens)} tokens`}>
                  <span>{m}</span>
                  <b className="num">{Math.round(v.premium * 100) / 100}</b>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="bc kz-periods">
          {periods.map(([label, t]) => (
            <div key={label} className="kz-per" title={`↑ ${fmtTokens(t.input + t.cacheCreate)} entrada · ↓ ${fmtTokens(t.output)} salida · caché leída ${fmtTokens(t.cacheRead)}`}>
              <div className="eyebrow">{label}</div>
              <div className="kz-big">{fmtTokens(fresh(t))}</div>
              <div className="kz-sm">
                {t.turns} {t.turns === 1 ? 'respuesta' : 'respuestas'} · {fmtUsd(t.cost)} a precio de lista
              </div>
            </div>
          ))}
        </section>
      </div>
      <div className="kz-note">«Tokens» suma entrada nueva + salida. La lectura de caché se muestra aparte; el costo es a precio de lista de la API.</div>

      <section className="bc kz-chart">
        <div className="card-h">
          <span className="eyebrow">Últimos 14 días</span>
          <span className="kz-note-r">tokens por día</span>
        </div>
        <div className="kz-spark">
          {view.days.map((d) => (
            <div key={d.key} className={`c${d.value > max * 0.6 ? ' hi' : ''}`} title={`${d.key}: ${fmtTokens(d.value)} tokens`}>
              <em>{d.value ? fmtTokens(d.value) : ''}</em>
              <div className="b" style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, opacity: d.value ? 1 : 0.35 }} />
              <small>{d.label}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="bc kz-tasks">
        <div className="card-h">
          <span className="eyebrow">Por tarea · 30 días</span>
        </div>
        {view.tasks.length ? (
          <div className="kz-scroll">
            <table className="tbl kz-tbl">
              <thead>
                <tr>
                  <th>Tarea</th>
                  <th className="r">Respuestas</th>
                  <th className="r">Tokens</th>
                  <th className="r">Caché leída</th>
                  <th className="r">Costo lista</th>
                </tr>
              </thead>
              <tbody>
                {view.tasks.map(({ id, t }) => {
                  const task = findTask(db, id)
                  const sub = [task?.client, task?.project].filter(Boolean).join(' · ')
                  return (
                    <tr key={id}>
                      <td className="kz-t" title={sub ? `${task?.title ?? ''} · ${sub}` : task?.title}>
                        <b>{task?.title ?? '(tarea borrada)'}</b>
                        {sub && <span>{sub}</span>}
                      </td>
                      <td className="r">{t.turns}</td>
                      <td className="r">{fmtTokens(fresh(t))}</td>
                      <td className="r">{fmtTokens(t.cacheRead)}</td>
                      <td className="r">
                        <b>{fmtUsd(t.cost).replace('.', ',')}</b>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState kind="chart" title="Aún no hay consumo registrado" text="Aparece cuando chateas con Claude desde una tarea." />
        )}
      </section>
    </div>
  )
}
