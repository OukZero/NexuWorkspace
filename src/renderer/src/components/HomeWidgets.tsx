import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { DB } from '../../../shared/types'
import { dayKey } from '../utils'
import type { WItem } from './HomeGrid'

/** Widgets de gráficos del Inicio: barras, línea, dona, ranking e indicador. Todo en HTML/SVG con las variables del tema. */
const H = 3600000
const fmt = (ms: number): string => (ms / H).toFixed(1).replace('.', ',')
const PALETTE = ['var(--accent)', 'var(--ok)', 'var(--warn)', '#7c9cff', '#c084fc', '#f472b6', '#2dd4bf', '#94a3b8']

/** Milisegundos trabajados por día en los últimos `n` días (el último es hoy). */
function perDay(db: DB, n: number, now: number): { key: string; label: string; ms: number }[] {
  const first = new Date(now)
  first.setHours(0, 0, 0, 0)
  first.setDate(first.getDate() - (n - 1))
  const days = Array.from({ length: n }, (_, i) => {
    const d = new Date(first)
    d.setDate(d.getDate() + i)
    return { start: d.getTime(), key: dayKey(d), label: n <= 7 ? 'DLMXJVS'[d.getDay()] : String(d.getDate()), ms: 0 }
  })
  for (const e of db.entries) {
    const end = e.end || now
    for (const d of days) {
      const a = Math.max(e.start, d.start), b = Math.min(end, d.start + 86400000)
      if (b > a) d.ms += b - a
    }
  }
  return days
}

/** Horas por proyecto (o «Sin proyecto») en los últimos `n` días, de mayor a menor. */
function perProject(db: DB, n: number, now: number): { name: string; ms: number }[] {
  const from = new Date(now)
  from.setHours(0, 0, 0, 0)
  from.setDate(from.getDate() - (n - 1))
  const by = new Map<string, number>()
  for (const e of db.entries) {
    const a = Math.max(e.start, from.getTime()), b = e.end || now
    if (b <= a) continue
    const name = db.tasks.find((t) => t.id === e.taskId)?.project || 'Sin proyecto'
    by.set(name, (by.get(name) ?? 0) + (b - a))
  }
  return [...by].map(([name, ms]) => ({ name, ms })).sort((a, b) => b.ms - a.ms)
}

const Head = ({ title, sub }: { title: string; sub?: string }): ReactNode => (
  <div className="card-h">
    <span className="eyebrow">{title}</span>
    {sub && <span className="upd">{sub}</span>}
  </div>
)

export function ChartWidget({ item, db, now }: { item: WItem; db: DB; now: number }): ReactNode {
  const n = Number(item.opt) || 7
  const type = item.type
  const days = useMemo(() => (type === 'bars' || type === 'area' ? perDay(db, n, now) : []), [db.entries, n, now, type])
  const projects = useMemo(() => (type === 'donut' || type === 'hbars' ? perProject(db, n, now) : []), [db.entries, db.tasks, n, now, type])

  if (type === 'kpi') {
    const m = item.opt || 'today'
    const todayK = dayKey(new Date(now))
    const open = db.tasks.filter((t) => t.status === 'today' || t.status === 'doing').length
    const done = db.tasks.filter((t) => t.status === 'done' && t.doneAt && dayKey(new Date(t.doneAt)) === todayK).length
    const sum = (k: number): number => perDay(db, k, now).reduce((a, d) => a + d.ms, 0)
    const [label, value, unit] =
      m === 'week' ? ['Horas de la semana', fmt(sum(((new Date(now).getDay() + 6) % 7) + 1)), 'h']
      : m === 'month' ? ['Horas del mes', fmt(sum(new Date(now).getDate())), 'h']
      : m === 'open' ? ['Tareas abiertas', String(open), '']
      : m === 'done' ? ['Hechas hoy', String(done), '']
      : ['Horas de hoy', fmt(sum(1)), 'h']
    return (
      <section className="bc hw hw-kpi">
        <span className="eyebrow">{label}</span>
        <div className="hw-big">{value}{unit && <small> {unit}</small>}</div>
      </section>
    )
  }

  if (type === 'bars') {
    const max = Math.max(H, ...days.map((d) => d.ms))
    return (
      <section className="bc hw">
        <Head title="Horas por día" sub={`${fmt(days.reduce((a, d) => a + d.ms, 0))} h · ${n} días`} />
        <div className="hw-bars">
          {days.map((d, i) => (
            <div key={d.key} title={`${d.key} · ${fmt(d.ms)} h`} className={i === days.length - 1 ? 'last' : ''}>
              <i style={{ height: `${Math.max(2, (d.ms / max) * 100)}%` }} />
              {n <= 14 && <span>{d.label}</span>}
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (type === 'area') {
    const max = Math.max(H, ...days.map((d) => d.ms))
    const pts = days.map((d, i) => `${(i / Math.max(1, days.length - 1)) * 100},${38 - (d.ms / max) * 34}`)
    return (
      <section className="bc hw">
        <Head title="Tendencia de horas" sub={`máx. ${fmt(max)} h · ${n} días`} />
        <div className="hw-area">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id={`hwg-${item.id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--accent)" stopOpacity=".45" />
                <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={`0,40 ${pts.join(' ')} 100,40`} fill={`url(#hwg-${item.id})`} />
            <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        </div>
      </section>
    )
  }

  // dona y ranking: reparto por proyecto; el resto se agrupa en «Otros»
  const top = projects.slice(0, 6)
  const others = projects.slice(6).reduce((a, p) => a + p.ms, 0)
  const rows = others > 0 ? [...top, { name: 'Otros', ms: others }] : top
  const total = rows.reduce((a, p) => a + p.ms, 0)
  const title = type === 'donut' ? 'Reparto por proyecto' : 'Ranking de proyectos'
  if (!total) {
    return (
      <section className="bc hw">
        <Head title={title} sub={`${n} días`} />
        <div className="cempty slim">Sin horas registradas en este periodo.</div>
      </section>
    )
  }
  if (type === 'hbars') {
    return (
      <section className="bc hw">
        <Head title={title} sub={`${n} días`} />
        <ul className="hw-rank">
          {rows.map((p, i) => (
            <li key={p.name}>
              <span title={p.name}>{p.name}</span>
              <div><i style={{ width: `${(p.ms / rows[0].ms) * 100}%`, background: PALETTE[i % PALETTE.length] }} /></div>
              <em>{fmt(p.ms)} h</em>
            </li>
          ))}
        </ul>
      </section>
    )
  }
  const R = 40, C = 2 * Math.PI * R
  let acc = 0
  return (
    <section className="bc hw">
      <Head title={title} sub={`${n} días`} />
      <div className="hw-donut">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeWidth="14" />
          {rows.map((p, i) => {
            const len = (p.ms / total) * C
            const el = <circle key={p.name} cx="50" cy="50" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="14" strokeDasharray={`${Math.max(0, len - 1)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 50 50)" />
            acc += len
            return el
          })}
          <text x="50" y="52" textAnchor="middle" className="hw-dt">{fmt(total)}</text>
          <text x="50" y="63" textAnchor="middle" className="hw-ds">horas</text>
        </svg>
        <ul>
          {rows.map((p, i) => (
            <li key={p.name}><i style={{ background: PALETTE[i % PALETTE.length] }} /><span title={p.name}>{p.name}</span><em>{Math.round((p.ms / total) * 100)}%</em></li>
          ))}
        </ul>
      </div>
    </section>
  )
}
