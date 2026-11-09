import type { ReactNode } from 'react'
import { eventsOfDay, meetingMs, useCalendar } from '../calendar'
import { useDB, useNow } from '../store'
import { dayKey, fmtH, hhmm } from '../utils'

/** Reuniones de hoy (Outlook): hora, título y botón para unirse. No se muestra si el calendario no está conectado. */
export function MeetingsCard(): ReactNode {
  const cal = useCalendar()
  const db = useDB()
  const now = useNow(30000)
  if (!cal.status?.connected) return null
  const day = dayKey(new Date())
  const { timed, allDay } = eventsOfDay(cal.events, day)
  const busy = meetingMs(cal.events, day)
  const target = db.settings.targetHours || 8
  return (
    <div className="mt-card" aria-label="Reuniones de hoy">
      <div className="lbl">
        Reuniones · {timed.length}
        {busy > 0 && (
          <span className="mt-sum">
            {' '}
            · {fmtH(busy).replace('.', ',')} h en reuniones, {Math.max(0, target - busy / 3600000).toFixed(1).replace('.', ',')} h para tareas
          </span>
        )}
      </div>
      {cal.status.error && <div className="mt-err">No se pudo actualizar el calendario: {cal.status.error}</div>}
      {allDay.map((e) => (
        <div key={e.id} className="mt-day">
          📅 {e.title}
        </div>
      ))}
      {timed.length === 0 && !cal.status.error && <div className="mt-none">Sin reuniones hoy.</div>}
      {timed.map((e) => {
        const live = e.start <= now && e.end > now
        const past = e.end <= now
        return (
          <div key={e.id + e.start} className={`mt-row${live ? ' live' : ''}${past ? ' past' : ''}${e.tentative ? ' tent' : ''}`}>
            <span className="mt-t">
              {hhmm(e.start)}–{hhmm(e.end)}
            </span>
            <span className="mt-n" title={[e.location, e.organizer].filter(Boolean).join(' · ')}>
              {e.title}
              {e.location && <small> · {e.location}</small>}
            </span>
            {live && <span className="mt-live">ahora</span>}
            {e.joinUrl && !past && (
              <a className="btn sm" href={e.joinUrl} target="_blank" rel="noreferrer noopener">
                Unirme
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}
