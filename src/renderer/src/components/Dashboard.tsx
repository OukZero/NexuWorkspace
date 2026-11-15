import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { fmtTokens } from '../../../shared/advice'
import { findTask, useDB } from '../store'
import { useMeetings } from '../meetings'
import { dayKey } from '../utils'
import { EmptyState } from './EmptyState'

const DAY = 86400000
type Range = 7 | 14 | 30

const hours = (ms: number): string => (Math.round((ms / 3600000) * 10) / 10).toString().replace('.', ',')
const isWeekend = (d: Date): boolean => d.getDay() === 0 || d.getDay() === 6

/** Lunes de la semana de `d`, a las 00:00. */
function monday(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }): ReactNode {
  return (
    <section className={`bc db-tile${tone ? ' ' + tone : ''}`}>
      <div className="eyebrow">{label}</div>
      <div className="kz-big">{value}</div>
      {sub && <div className="kz-sm">{sub}</div>}
    </section>
  )
}

/** Dashboard de productividad: todo se calcula en local con lo que la app ya registra (timer, tareas, foco, reuniones y consumo de IA). */
export function Dashboard(): ReactNode {
  const db = useDB()
  const meetings = useMeetings()
  const [range, setRange] = useState<Range>(14)
  const [by, setBy] = useState<'project' | 'client' | 'task'>('project')

  const v = useMemo(() => {
    const now = Date.now()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const from = today.getTime() - (range - 1) * DAY
    const target = db.settings.targetHours * 3600000
    const dur = (e: { start: number; end: number | null }): number => Math.max(0, (e.end ?? now) - e.start)

    const entries = db.entries.filter((e) => e.start >= from)
    const perDay = new Map<string, number>()
    for (const e of entries) perDay.set(dayKey(new Date(e.start)), (perDay.get(dayKey(new Date(e.start))) ?? 0) + dur(e))
    const days: Array<{ key: string; label: string; ms: number; weekend: boolean }> = []
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY)
      days.push({ key: dayKey(d), label: `${d.getDate()}/${d.getMonth() + 1}`, ms: perDay.get(dayKey(d)) ?? 0, weekend: isWeekend(d) })
    }
    const total = days.reduce((a, d) => a + d.ms, 0)
    const workdays = days.filter((d) => !d.weekend || d.ms > 0).length // fines de semana solo si se trabajó
    const worked = days.filter((d) => d.ms > 0).length

    const groups = new Map<string, number>()
    for (const e of entries) {
      const t = findTask(db, e.taskId)
      const k = by === 'task' ? (t?.title ?? '(tarea borrada)') : by === 'client' ? t?.client || 'Sin cliente' : t?.project || 'Sin proyecto'
      groups.set(k, (groups.get(k) ?? 0) + dur(e))
    }
    const top = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)

    const weeks: Array<{ label: string; done: number }> = []
    const thisMonday = monday(today).getTime()
    for (let i = 7; i >= 0; i--) {
      const a = thisMonday - i * 7 * DAY
      const done = db.tasks.filter((t) => t.doneAt && t.doneAt >= a && t.doneAt < a + 7 * DAY).length
      const d = new Date(a)
      weeks.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, done })
    }

    const focus = (db.focusBlocks ?? []).filter((b) => b.end > from && b.start < now).reduce((a, b) => a + Math.min(b.end, now) - Math.max(b.start, from), 0)
    const rec = meetings.filter((m) => m.createdAt >= from)
    const meet = rec.reduce((a, m) => a + m.durationMs, 0)
    const done = db.tasks.filter((t) => t.doneAt && t.doneAt >= from).length

    const usage = db.usage.filter((r) => r.ts >= from && r.provider !== 'copilot')
    const tokens = usage.reduce((a, r) => a + r.input + r.output + r.cacheCreate, 0)
    const cost = usage.reduce((a, r) => a + r.costUsd, 0)

    // franja horaria en la que más se trabaja (horas por hora del día)
    const hourly = new Array<number>(24).fill(0)
    for (const e of entries) {
      let s = e.start
      const end = e.end ?? now
      while (s < end) {
        const h = new Date(s)
        const next = Math.min(end, new Date(h.getFullYear(), h.getMonth(), h.getDate(), h.getHours() + 1).getTime())
        hourly[h.getHours()] += next - s
        s = next
      }
    }

    return { days, total, workdays, worked, target, top, weeks, focus, meet, meetCount: rec.length, done, tokens, cost, hourly, entries: entries.length }
  }, [db, meetings, range, by])

  const maxDay = Math.max(1, ...v.days.map((d) => d.ms))
  const maxTop = Math.max(1, ...v.top.map((t) => t[1]))
  const maxWeek = Math.max(1, ...v.weeks.map((w) => w.done))
  const maxHour = Math.max(1, ...v.hourly)
  const expected = v.workdays * v.target
  const pct = expected ? Math.round((v.total / expected) * 100) : 0
  const avg = v.worked ? v.total / v.worked : 0
  const bestHour = v.hourly.indexOf(maxHour)

  if (!v.entries && !v.done && !v.tokens) {
    return (
      <div className="kz">
        <EmptyState kind="chart" title="Aún no hay datos en este periodo" text="El dashboard se llena con el timer de las tareas, las tareas cerradas, las reuniones y el consumo de IA." />
      </div>
    )
  }

  return (
    <div className="kz db">
      <div className="db-bar" role="group" aria-label="Periodo">
        {([7, 14, 30] as Range[]).map((r) => (
          <button key={r} className={`btn sm${range === r ? ' p' : ''}`} aria-pressed={range === r} onClick={() => setRange(r)}>
            {r} días
          </button>
        ))}
      </div>

      <div className="db-tiles">
        <Tile label="Horas trabajadas" value={`${hours(v.total)} h`} sub={`${pct} % de lo esperado (${hours(expected)} h) · ${v.worked} ${v.worked === 1 ? 'día' : 'días'} con registro`} tone={pct >= 95 ? 'ok' : pct < 70 ? 'warn' : undefined} />
        <Tile label="Promedio por día" value={`${hours(avg)} h`} sub={`objetivo diario: ${db.settings.targetHours} h`} />
        <Tile label="Tareas cerradas" value={String(v.done)} sub={v.done ? `${(v.done / range).toFixed(1).replace('.', ',')} por día` : 'ninguna en el periodo'} />
        <Tile label="Foco vs reuniones" value={`${hours(v.focus)} h`} sub={`${hours(v.meet)} h grabadas en ${v.meetCount} ${v.meetCount === 1 ? 'reunión' : 'reuniones'}`} />
        <Tile label="IA" value={fmtTokens(v.tokens)} sub={`tokens · $${v.cost.toFixed(2)} a precio de lista`} />
      </div>

      <section className="bc kz-chart">
        <div className="card-h">
          <span className="eyebrow">Horas por día</span>
          <span className="kz-note-r">resaltados: los días que llegaste a tus {db.settings.targetHours} h</span>
        </div>
        <div className="kz-spark db-days">
          {v.days.map((d) => (
            <div key={d.key} className={`c${d.ms >= v.target ? ' hi' : ''}`} title={`${d.key}: ${hours(d.ms)} h`}>
              <em>{d.ms ? hours(d.ms) : ''}</em>
              <div className="b" style={{ height: `${Math.max(2, (d.ms / maxDay) * 100)}%`, opacity: d.ms ? 1 : 0.35 }} />
              <small style={d.weekend ? { opacity: 0.55 } : undefined}>{range <= 14 || Number(d.label.split('/')[0]) % 2 ? d.label : ''}</small>
            </div>
          ))}
        </div>
      </section>

      <div className="kz-row">
        <section className="bc">
          <div className="card-h">
            <span className="eyebrow">Dónde se va el tiempo</span>
            <span className="db-seg" role="group" aria-label="Agrupar por">
              {(
                [
                  ['project', 'Proyecto'],
                  ['client', 'Cliente'],
                  ['task', 'Tarea']
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={`btn sm${by === k ? ' p' : ''}`} aria-pressed={by === k} onClick={() => setBy(k)}>
                  {l}
                </button>
              ))}
            </span>
          </div>
          {v.top.length ? (
            <div className="db-hbars">
              {v.top.map(([name, ms]) => (
                <div key={name} className="db-hb" title={`${name}: ${hours(ms)} h`}>
                  <span className="db-hb-n">{name}</span>
                  <span className="db-hb-t">
                    <i style={{ width: `${(ms / maxTop) * 100}%` }} />
                  </span>
                  <b className="num">{hours(ms)} h</b>
                </div>
              ))}
            </div>
          ) : (
            <div className="meta">Sin horas registradas en el periodo.</div>
          )}
        </section>

        <section className="bc">
          <div className="card-h">
            <span className="eyebrow">Tareas cerradas por semana</span>
            <span className="kz-note-r">últimas 8 semanas</span>
          </div>
          <div className="kz-spark db-weeks">
            {v.weeks.map((w, i) => (
              <div key={i} className={`c${w.done === maxWeek && w.done > 0 ? ' hi' : ''}`} title={`Semana del ${w.label}: ${w.done}`}>
                <em>{w.done || ''}</em>
                <div className="b" style={{ height: `${Math.max(2, (w.done / maxWeek) * 100)}%`, opacity: w.done ? 1 : 0.35 }} />
                <small>{w.label}</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="bc">
        <div className="card-h">
          <span className="eyebrow">A qué horas trabajas</span>
          <span className="kz-note-r">{v.hourly[bestHour] ? `tu franja más fuerte: ${String(bestHour).padStart(2, '0')}:00` : ''}</span>
        </div>
        <div className="db-hours">
          {v.hourly.map((ms, h) => (
            <div key={h} className="db-hour" title={`${String(h).padStart(2, '0')}:00 · ${hours(ms)} h`}>
              <div className="db-hour-b" style={{ height: `${Math.max(3, (ms / maxHour) * 100)}%`, opacity: ms ? 1 : 0.25 }} />
              <small>{h % 3 === 0 ? h : ''}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
