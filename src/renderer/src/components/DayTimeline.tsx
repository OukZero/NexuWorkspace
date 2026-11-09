import { useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as RPointerEvent, ReactNode } from 'react'
import type { Entry } from '../../../shared/types'
import { findTask, useDB, useNow } from '../store'
import { taskColor } from '../theme'
import { hhmm, toTs } from '../utils'
import { useUi } from '../ui'
import { eventsOfDay, useCalendar } from '../calendar'

const SNAP = 5 * 60000
const MIN_LEN = 5 * 60000

const hue = (id: string): number => [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)

type Drag = { id: string; mode: 'move' | 'start' | 'end'; x0: number; s0: number; e0: number; s: number; e: number }

/** Línea de tiempo del día: un bloque por registro. Se arrastra el bloque para moverlo o sus bordes para ajustar inicio y fin. */
export function DayTimeline({ day, entries }: { day: string; entries: Entry[] }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const now = useNow(30000)
  const box = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)

  const dayStart = toTs(day, '00:00')
  const cal = useCalendar()
  const meetings = eventsOfDay(cal.events, day).timed
  const blocks = (db.focusBlocks ?? []).filter((b) => b.start < dayStart + 86400000 && b.end > dayStart)
  const extra = [...meetings.map((m) => [m.start, m.end]), ...blocks.map((b) => [b.start, b.end])]
  const view = entries.map((e) => (drag && drag.id === e.id ? { ...e, start: drag.s, end: e.end === null ? null : drag.e } : e))
  const first = Math.min(8 * 60, ...view.map((e) => Math.floor((e.start - dayStart) / 3600000) * 60), ...extra.map(([s]) => Math.floor((s - dayStart) / 3600000) * 60))
  const last = Math.max(18 * 60, ...view.map((e) => Math.ceil(((e.end ?? now) - dayStart) / 3600000) * 60), ...extra.map(([, e]) => Math.ceil((e - dayStart) / 3600000) * 60))
  const from = Math.max(0, first)
  const to = Math.min(24 * 60, Math.max(last, from + 120))
  const span = (to - from) * 60000
  const x0ms = dayStart + from * 60000
  const pct = (ts: number): number => ((ts - x0ms) / span) * 100
  const isToday = new Date(dayStart).toDateString() === new Date().toDateString()

  // carriles: si dos registros se solapan, el segundo baja de fila
  const laneEnds: number[] = []
  const lanes = new Map<string, number>()
  for (const e of [...view].sort((a, b) => a.start - b.start)) {
    let l = laneEnds.findIndex((end) => end <= e.start)
    if (l < 0) l = laneEnds.length
    laneEnds[l] = e.end ?? now
    lanes.set(e.id, l)
  }

  const begin = (ev: RPointerEvent, e: Entry, mode: Drag['mode']): void => {
    if (e.end === null && mode === 'end') return
    ev.preventDefault()
    ev.stopPropagation()
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
    const d: Drag = { id: e.id, mode, x0: ev.clientX, s0: e.start, e0: e.end ?? now, s: e.start, e: e.end ?? now }
    dragRef.current = d
    setDrag(d)
  }
  const move = (ev: RPointerEvent): void => {
    const d = dragRef.current
    if (!d || !box.current) return
    const width = box.current.getBoundingClientRect().width || 1
    const delta = Math.round((((ev.clientX - d.x0) / width) * span) / SNAP) * SNAP
    let s = d.s0
    let e = d.e0
    if (d.mode === 'move') {
      s += delta
      e += delta
    } else if (d.mode === 'start') s = Math.min(d.s0 + delta, d.e0 - MIN_LEN)
    else e = Math.max(d.e0 + delta, d.s0 + MIN_LEN)
    const next = { ...d, s, e }
    dragRef.current = next
    setDrag(next)
  }
  const end = (): void => {
    const d = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!d || (d.s === d.s0 && d.e === d.e0)) return
    const original = entries.find((x) => x.id === d.id)
    void ui.run('entry:update', { id: d.id, start: d.s, ...(original?.end === null ? {} : { end: d.e }) })
  }

  const hours: number[] = []
  for (let h = Math.ceil(from / 60); h * 60 <= to; h++) hours.push(h)
  const laneCount = Math.max(1, laneEnds.length)
  const strips = (meetings.length ? 1 : 0) + (blocks.length ? 1 : 0)
  const clampPct = (ts: number): number => Math.min(100, Math.max(0, pct(ts)))

  return (
    <div className="dtl" aria-label="Línea de tiempo del día">
      <div className="dtl-box" ref={box} style={{ height: laneCount * 34 + 22 + strips * 26 }}>
        {hours.map((h) => (
          <span key={h} className="dtl-tick" style={{ left: `${pct(dayStart + h * 3600000)}%` }}>
            <i>{String(h).padStart(2, '0')}</i>
          </span>
        ))}
        {isToday && <span className="dtl-now" style={{ left: `${pct(now)}%` }} />}
        {meetings.map((m) => (
          <div
            key={m.id + m.start}
            className={`dtl-m${m.tentative ? ' tent' : ''}${m.busy ? '' : ' free'}`}
            style={{ left: `${clampPct(m.start)}%`, width: `${Math.max(0.4, clampPct(m.end) - clampPct(m.start))}%`, top: 20 + laneCount * 34 }}
            title={`${m.title} · ${hhmm(m.start)}–${hhmm(m.end)}${m.location ? ' · ' + m.location : ''}${m.organizer ? ' · ' + m.organizer : ''}`}
          >
            <span className="dtl-t">
              {m.title} <small>{hhmm(m.start)}</small>
            </span>
          </div>
        ))}
        {blocks.map((b) => {
          const t = findTask(db, b.taskId)
          return (
            <div
              key={b.id}
              className="dtl-f"
              style={{ left: `${clampPct(b.start)}%`, width: `${Math.max(0.4, clampPct(b.end) - clampPct(b.start))}%`, top: 20 + laneCount * 34 + (meetings.length ? 26 : 0) }}
              title={`Bloque de enfoque: ${t?.title ?? '(tarea borrada)'} · ${hhmm(b.start)}–${hhmm(b.end)}`}
            >
              <span className="dtl-t">
                {t?.title ?? '—'} <small>{hhmm(b.start)}</small>
              </span>
              <button className="dtl-x" aria-label="Quitar el bloque" title="Quitar el bloque" onClick={() => void ui.run('focus:delete', b.id)}>
                ×
              </button>
            </div>
          )
        })}
        {view.map((e) => {
          const t = findTask(db, e.taskId)
          const c = (t && taskColor(t)) || `hsl(${hue(e.taskId)} 60% 45%)`
          const endTs = e.end ?? now
          const active = drag?.id === e.id
          return (
            <div
              key={e.id}
              className={`dtl-b${e.end === null ? ' live' : ''}${active ? ' drag' : ''}`}
              style={{ left: `${pct(e.start)}%`, width: `${Math.max(0.4, pct(endTs) - pct(e.start))}%`, top: 20 + (lanes.get(e.id) ?? 0) * 34, '--c': c } as CSSProperties}
              title={`${t?.title ?? '(tarea borrada)'} · ${hhmm(e.start)}–${e.end ? hhmm(e.end) : 'en curso'}${active ? '' : ' · arrastra para mover; los bordes ajustan inicio y fin'}`}
              onPointerDown={(ev) => begin(ev, e, 'move')}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            >
              <span className="dtl-h l" onPointerDown={(ev) => begin(ev, e, 'start')} onPointerMove={move} onPointerUp={end} />
              <span className="dtl-t">
                {t?.title ?? '—'}{' '}
                <small>
                  {hhmm(e.start)}–{e.end ? hhmm(e.end) : '…'}
                </small>
              </span>
              {e.end !== null && <span className="dtl-h r" onPointerDown={(ev) => begin(ev, e, 'end')} onPointerMove={move} onPointerUp={end} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
