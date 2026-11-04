import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { findTask, useDB, useNow } from '../store'
import { dayKey, fmtH } from '../utils'
import { useUi } from '../ui'
import { EmptyState } from './EmptyState'

const DAY = 86400000
const NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const PALETTE = ['#7c8cff', '#5ee0b0', '#ffb454', '#ff7ab6', '#5ad1ff', '#c792ea', '#f78c6c', '#a3d977']

const mondayOf = (d: Date): Date => {
  const m = new Date(d)
  m.setHours(0, 0, 0, 0)
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7))
  return m
}

/** Vista semanal: horas por día y por proyecto, con gráfica, tabla y exportación a Excel. */
export function WeekView({ onDay }: { onDay: (day: string) => void }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const now = useNow(30000)
  const [start, setStart] = useState(() => mondayOf(new Date()))

  const data = useMemo(() => {
    const t0 = start.getTime()
    const days = Array.from({ length: 7 }, (_, i) => new Date(t0 + i * DAY))
    const projects = new Map<string, number[]>() // proyecto -> ms por día
    for (const e of db.entries) {
      const end = e.end || now
      if (e.start < t0 || e.start >= t0 + 7 * DAY) continue
      const t = findTask(db, e.taskId)
      const key = t?.project || 'Sin proyecto'
      const arr = projects.get(key) ?? Array(7).fill(0)
      arr[Math.floor((e.start - t0) / DAY)] += end - e.start
      projects.set(key, arr)
    }
    const names = [...projects.keys()].sort((a, b) => a.localeCompare(b))
    const color = (p: string): string => PALETTE[names.indexOf(p) % PALETTE.length]
    const perDay = days.map((_, i) => names.reduce((a, p) => a + (projects.get(p)?.[i] ?? 0), 0))
    return { days, projects, names, color, perDay, total: perDay.reduce((a, b) => a + b, 0) }
  }, [db, start, now])

  const target = db.settings.targetHours * 3600000
  const max = Math.max(target, ...data.perDay, 1)
  const sunday = new Date(start.getTime() + 6 * DAY)
  const label = `${start.toLocaleDateString('es', { day: 'numeric', month: 'short' })} – ${sunday.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const shift = (n: number): void => setStart((s) => new Date(s.getTime() + n * 7 * DAY))

  return (
    <>
      <div className="toolbar">
        <button className="btn sm" onClick={() => shift(-1)} aria-label="Semana anterior">
          ‹
        </button>
        <b style={{ minWidth: 200, textAlign: 'center' }}>{label}</b>
        <button className="btn sm" onClick={() => shift(1)} aria-label="Semana siguiente">
          ›
        </button>
        <button className="btn sm" onClick={() => setStart(mondayOf(new Date()))}>
          Esta semana
        </button>
        <div style={{ marginLeft: 'auto', width: 'auto' }}>
          <b>Total: {fmtH(data.total)} h</b> · promedio {fmtH(data.total / 5)} h por día hábil
        </div>
        <button className="btn sm primary" onClick={() => void ui.run('excel:export', dayKey(start), dayKey(sunday))}>
          Exportar semana
        </button>
      </div>

      {data.total === 0 ? (
        <EmptyState kind="chart" title="Sin horas esta semana" text="Cuando registres tiempo con el timer, aquí verás cómo se reparte por día y por proyecto." />
      ) : (
        <>
          <div className="wbars" role="img" aria-label="Horas por día de la semana">
            {data.days.map((d, i) => (
              <button key={i} className="wcol" title={`${NAMES[i]} ${d.getDate()}: ${fmtH(data.perDay[i])} h — ver el día`} onClick={() => onDay(dayKey(d))}>
                <span className="wval">{data.perDay[i] ? fmtH(data.perDay[i]) : ''}</span>
                <span className="wstack" style={{ height: `${(data.perDay[i] / max) * 100}%` }}>
                  {data.names.map((p) => {
                    const ms = data.projects.get(p)?.[i] ?? 0
                    return ms ? <i key={p} style={{ flex: ms, background: data.color(p) }} title={`${p}: ${fmtH(ms)} h`} /> : null
                  })}
                </span>
                <span className="wl">
                  {NAMES[i]} {d.getDate()}
                </span>
              </button>
            ))}
            <span className="wtarget" style={{ bottom: `calc(${(target / max) * 100}% * 0.78 + 34px)` }} title={`Objetivo diario: ${db.settings.targetHours} h`} />
          </div>
          <table>
            <thead>
              <tr>
                <th>Proyecto</th>
                {data.days.map((d, i) => (
                  <th key={i} style={{ width: 54 }}>
                    {NAMES[i]}
                  </th>
                ))}
                <th style={{ width: 70 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.names.map((p) => {
                const arr = data.projects.get(p) ?? []
                return (
                  <tr key={p}>
                    <td>
                      <i className="swatch" style={{ background: data.color(p) }} /> {p}
                    </td>
                    {arr.map((ms, i) => (
                      <td key={i}>{ms ? fmtH(ms) : '·'}</td>
                    ))}
                    <td>
                      <b>{fmtH(arr.reduce((a, b) => a + b, 0))}</b>
                    </td>
                  </tr>
                )
              })}
              <tr>
                <td>
                  <b>Total</b>
                </td>
                {data.perDay.map((ms, i) => (
                  <td key={i}>
                    <b>{ms ? fmtH(ms) : '·'}</b>
                  </td>
                ))}
                <td>
                  <b>{fmtH(data.total)}</b>
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
