import { useEffect, useSyncExternalStore } from 'react'
import type { CalEvent, CalendarStatus } from '../../shared/types'
import { mergedMs } from '../../shared/util'
import { toTs } from './utils'

/** Reuniones del calendario de Outlook en memoria del renderer. El proceso principal las consulta; aquí se leen cada minuto. */

interface Snap {
  status: CalendarStatus | null
  events: CalEvent[]
}

let snap: Snap = { status: null, events: [] }
const subs = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

const set = (p: Partial<Snap>): void => {
  if (JSON.stringify({ ...snap, ...p }) === JSON.stringify(snap)) return
  snap = { ...snap, ...p }
  subs.forEach((f) => f())
}

export async function refreshCalendar(force = false): Promise<void> {
  try {
    const status = await window.api.call('calendar:status')
    if (!status.connected) return set({ status, events: [] })
    set({ status, events: await window.api.call('calendar:events', force) })
  } catch {
    /* sin conexión con el proceso principal: se conserva lo último */
  }
}

export function setCalendarStatus(status: CalendarStatus): void {
  set({ status })
  void refreshCalendar(true)
}

export function useCalendar(): Snap {
  const s = useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      if (subs.size === 1) timer = setInterval(() => void refreshCalendar(), 60_000)
      return () => {
        subs.delete(cb)
        if (!subs.size) clearInterval(timer)
      }
    },
    () => snap
  )
  useEffect(() => {
    void refreshCalendar()
  }, [])
  return s
}

const DAY = 86_400_000

/** Reuniones que tocan el día `day` (AAAA-MM-DD). Las de todo el día van aparte. */
export function eventsOfDay(events: CalEvent[], day: string): { timed: CalEvent[]; allDay: CalEvent[] } {
  const s = toTs(day, '00:00')
  const e = s + DAY
  const hit = events.filter((x) => x.start < e && x.end > s)
  return { timed: hit.filter((x) => !x.allDay), allDay: hit.filter((x) => x.allDay) }
}

/** Milisegundos ocupados por reuniones dentro del día: une las que se solapan para no contarlas dos veces. */
export function meetingMs(events: CalEvent[], day: string): number {
  const s = toTs(day, '00:00')
  const e = s + DAY
  return mergedMs(events.filter((x) => !x.allDay && x.busy && !x.tentative && x.start < e && x.end > s).map((x): [number, number] => [Math.max(x.start, s), Math.min(x.end, e)]))
}

/** Huecos libres de al menos `minMs` entre `from` y `to` (milisegundos), descontando reuniones ocupadas. */
export function freeSlots(events: CalEvent[], from: number, to: number, minMs: number): Array<[number, number]> {
  const busy = events
    .filter((x) => !x.allDay && x.busy && x.end > from && x.start < to)
    .map((x): [number, number] => [Math.max(x.start, from), Math.min(x.end, to)])
    .sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  let cursor = from
  for (const [s, e] of busy) {
    if (s - cursor >= minMs) out.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (to - cursor >= minMs) out.push([cursor, to])
  return out
}
