import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useDB, useNow } from '../store'
import { dayKey, fmtH } from '../utils'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DOWS = ['L', '', 'X', '', 'V', '', '']

type Cell = { day: string | null; v: number }

/** Horas por día de un año completo, estilo «contribuciones». Un clic en un día abre su detalle. */
export function Heatmap({ onDay }: { onDay: (day: string) => void }): ReactNode {
  const db = useDB()
  const now = useNow(60000)
  const target = db.settings.targetHours || 8
  const [year, setYear] = useState(new Date().getFullYear())

  const { hours, total, days, best } = useMemo(() => {
    const h: Record<string, number> = {}
    for (const e of db.entries) {
      let s = e.start
      const en = e.end || now
      // un registro que cruza la medianoche se reparte entre los días
      while (s < en) {
        const d = new Date(s)
        const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
        const k = dayKey(d)
        h[k] = (h[k] || 0) + (Math.min(en, next) - s) / 3600000
        s = next
      }
    }
    const inYear = Object.entries(h).filter(([k]) => k.startsWith(String(year)))
    return {
      hours: h,
      total: inYear.reduce((a, [, v]) => a + v, 0),
      days: inYear.filter(([, v]) => v >= 0.25).length,
      best: [...inYear].sort((a, b) => b[1] - a[1])[0]
    }
  }, [db.entries, now, year])

  // columnas = semanas (lunes a domingo); la primera arranca en el lunes de la semana del 1 de enero
  const jan1 = new Date(year, 0, 1)
  const lead = (jan1.getDay() + 6) % 7
  const cells: Cell[] = Array.from({ length: lead }, () => ({ day: null, v: 0 }))
  for (let d = new Date(jan1); d.getFullYear() === year; d.setDate(d.getDate() + 1)) cells.push({ day: dayKey(d), v: hours[dayKey(d)] || 0 })
  const weeks = Math.ceil(cells.length / 7)
  const monthAt = new Map<number, string>()
  cells.forEach((c, i) => {
    if (c.day && c.day.endsWith('-01')) monthAt.set(Math.floor(i / 7), MONTHS[Number(c.day.slice(5, 7)) - 1])
  })
  const level = (v: number): number => (v < 0.25 ? 0 : v < target * 0.4 ? 1 : v < target * 0.8 ? 2 : v <= target * 1.1 ? 3 : 4)
  const today = dayKey(new Date())

  return (
    <div className="heat">
      <div className="heat-h">
        <button className="btn sm" aria-label="Año anterior" onClick={() => setYear(year - 1)}>
          ‹
        </button>
        <b>{year}</b>
        <button className="btn sm" aria-label="Año siguiente" disabled={year >= new Date().getFullYear()} onClick={() => setYear(year + 1)}>
          ›
        </button>
        <span className="meta">
          {fmtH(total * 3600000)} h en {days} días con registro
          {best ? ` · día más largo: ${best[0].slice(8)}/${best[0].slice(5, 7)} (${best[1].toFixed(1)} h)` : ''}
        </span>
      </div>
      <div className="heat-scroll">
        <div className="heat-grid" style={{ gridTemplateColumns: `22px repeat(${weeks}, 14px)` }}>
          <span />
          {Array.from({ length: weeks }, (_, w) => (
            <span key={w} className="heat-m">
              {monthAt.get(w) ?? ''}
            </span>
          ))}
          {DOWS.map((label, row) => (
            <HeatRow key={row} label={label} row={row} weeks={weeks} cells={cells} level={level} today={today} onDay={onDay} />
          ))}
        </div>
      </div>
      <div className="heat-legend">
        <span className="meta">Menos</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <i key={l} className={`hc l${l}`} />
        ))}
        <span className="meta">Más (objetivo diario: {target} h; rojo = por encima del objetivo)</span>
      </div>
    </div>
  )
}

function HeatRow({ label, row, weeks, cells, level, today, onDay }: { label: string; row: number; weeks: number; cells: Cell[]; level: (v: number) => number; today: string; onDay: (d: string) => void }): ReactNode {
  return (
    <>
      <span className="heat-d">{label}</span>
      {Array.from({ length: weeks }, (_, w) => {
        const c = cells[w * 7 + row]
        if (!c || !c.day) return <span key={w} className="hc none" />
        const day = c.day
        return <button key={w} className={`hc l${level(c.v)}${day === today ? ' today' : ''}`} title={`${day} · ${c.v.toFixed(1)} h`} aria-label={`${day}: ${c.v.toFixed(1)} horas`} onClick={() => onDay(day)} />
      })}
    </>
  )
}
