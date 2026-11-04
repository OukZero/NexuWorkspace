import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { fmtTokens } from '../../../shared/advice'
import type { LimitWindow, UsageRecord } from '../../../shared/types'
import { findTask, useDB } from '../store'
import { dayKey } from '../utils'
import { EmptyState } from './EmptyState'

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

function Limit({ label, w }: { label: string; w?: LimitWindow }): ReactNode {
  if (!w) return <div className="limit meta">{label}: sin datos todavía</div>
  const pct = Math.min(100, Math.round(w.utilization * 100))
  const cls = pct >= 90 ? 'critical' : pct >= 70 ? 'warn' : 'ok'
  const reset = new Date(w.resetsAt * 1000)
  const when = reset.toLocaleString('es', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <div className={`limit ${cls}`}>
      <div className="limit-h">
        <b>{label}</b>
        <span>{pct} % usado</span>
      </div>
      <div className="ctx-bar big">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="meta">Se reinicia {when}</div>
    </div>
  )
}

export function Usage(): ReactNode {
  const db = useDB()
  const now = Date.now()
  const startToday = new Date()
  startToday.setHours(0, 0, 0, 0)

  const view = useMemo(() => {
    const t0 = startToday.getTime()
    const within = (from: number): UsageRecord[] => db.usage.filter((r) => r.ts >= from)
    const days: Array<{ key: string; label: string; value: number }> = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(t0 - i * DAY)
      const rs = db.usage.filter((r) => dayKey(new Date(r.ts)) === dayKey(d))
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

  const max = Math.max(1, ...view.days.map((d) => d.value))
  const periods: Array<[string, Totals]> = [
    ['Hoy', view.today],
    ['Últimos 7 días', view.week],
    ['Últimos 30 días', view.month]
  ]
  const stale = db.limits && now - db.limits.updatedAt > 3600000

  return (
    <>
      <h1>Consumo</h1>
      <div className="sub">Lo que consumen los chats de esta app con Claude. Las sesiones de Claude Desktop o de la terminal no se cuentan aquí.</div>

      <h3 style={{ marginTop: 0 }}>Límites de tu plan</h3>
      <div className="limits">
        <Limit label="Ventana de 5 horas" w={db.limits?.fiveHour} />
        <Limit label="Semana (7 días)" w={db.limits?.sevenDay} />
      </div>
      <div className="meta" style={{ marginTop: 6 }}>
        {db.limits
          ? `Informado por Claude Code en la última respuesta (${new Date(db.limits.updatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })})${stale ? ' — puede estar desactualizado' : ''}. Incluye todo el uso de tu cuenta, no solo esta app.`
          : 'Se mostrará después de la primera respuesta de Claude en un chat.'}
      </div>

      <h3>Tokens por periodo</h3>
      <div className="periods">
        {periods.map(([label, t]) => (
          <div key={label} className="period">
            <div className="meta">{label}</div>
            <div className="big-n">{fmtTokens(fresh(t))}</div>
            <div className="meta">
              {t.turns} {t.turns === 1 ? 'respuesta' : 'respuestas'} · {fmtUsd(t.cost)} a precio de lista
            </div>
            <div className="meta">
              ↑ {fmtTokens(t.input + t.cacheCreate)} entrada · ↓ {fmtTokens(t.output)} salida · caché leída {fmtTokens(t.cacheRead)}
            </div>
          </div>
        ))}
      </div>
      <div className="meta" style={{ marginTop: 6 }}>
        «Tokens» cuenta entrada nueva + salida (la lectura de caché es mucho más barata y se muestra aparte). El costo es a precio de lista de la API: con una
        suscripción no se cobra por separado, pero sirve para comparar.
      </div>

      <h3>Últimos 14 días</h3>
      <div className="bars">
        {view.days.map((d) => (
          <div key={d.key} className="bar-col" title={`${d.key}: ${fmtTokens(d.value)} tokens`}>
            <div className="bar-v">{d.value ? fmtTokens(d.value) : ''}</div>
            <div className="bar-fill" style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, opacity: d.value ? 1 : 0.25 }} />
            <div className="bar-l">{d.label}</div>
          </div>
        ))}
      </div>

      <h3>Por tarea (30 días)</h3>
      {view.tasks.length ? (
        <table>
          <thead>
            <tr>
              <th>Tarea</th>
              <th style={{ width: 90 }}>Respuestas</th>
              <th style={{ width: 100 }}>Tokens</th>
              <th style={{ width: 110 }}>Caché leída</th>
              <th style={{ width: 90 }}>Costo lista</th>
            </tr>
          </thead>
          <tbody>
            {view.tasks.map(({ id, t }) => {
              const task = findTask(db, id)
              return (
                <tr key={id}>
                  <td>
                    {task?.title ?? '(tarea borrada)'}
                    <div className="meta">
                      {task?.client} {task?.project}
                    </div>
                  </td>
                  <td>{t.turns}</td>
                  <td>{fmtTokens(fresh(t))}</td>
                  <td>{fmtTokens(t.cacheRead)}</td>
                  <td>{fmtUsd(t.cost)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <EmptyState kind="chart" title="Aún no hay consumo registrado" text="Aparece cuando chateas con Claude desde una tarea." />
      )}
    </>
  )
}
