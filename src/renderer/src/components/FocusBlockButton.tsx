import * as Popover from '@radix-ui/react-popover'
import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import type { CalEvent, Task } from '../../../shared/types'
import { freeSlots, useCalendar } from '../calendar'
import { useDB } from '../store'
import { useUi } from '../ui'
import { dayKey, hhmm, toTs } from '../utils'
import { G } from './glyphs'

const DURATIONS = [25, 45, 60, 90]
const STEP = 5 * 60_000
const WORK_FROM = '08:00'
const WORK_TO = '20:00'

/** Botón «Bloquear tiempo»: reserva un bloque de enfoque para la tarea en un hueco libre del día (solo local, no escribe en tu calendario). */
export function FocusBlockButton({ task }: { task: Task }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const cal = useCalendar()
  const [open, setOpen] = useState(false)
  const [mins, setMins] = useState(45)
  const [tomorrow, setTomorrow] = useState(false)
  const [at, setAt] = useState('')

  const base = new Date()
  if (tomorrow) base.setDate(base.getDate() + 1)
  const day = dayKey(base)
  const now = Date.now()
  const from = Math.max(toTs(day, WORK_FROM), Math.ceil(now / STEP) * STEP)
  const to = toTs(day, WORK_TO)
  const mine: CalEvent[] = (db.focusBlocks ?? []).map((b) => ({ id: b.id, title: '', start: b.start, end: b.end, allDay: false, busy: true }))
  const slots = freeSlots([...cal.events, ...mine], from, to, mins * 60_000).slice(0, 5)

  const reserve = async (start: number): Promise<void> => {
    const r = await ui.run('focus:save', { taskId: task.id, start, end: start + mins * 60_000 })
    if (r) {
      ui.toast(`Bloque reservado: ${hhmm(r.start)}–${hhmm(r.end)}`)
      setOpen(false)
    }
  }
  const manual = (): void => {
    if (!at) return
    const start = toTs(day, at)
    if (!Number.isFinite(start) || start < now - 60_000) return ui.toast('Esa hora ya pasó.', true)
    void reserve(start)
  }
  const stop = (e: MouseEvent): void => e.stopPropagation()

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="ib" title="Bloquear tiempo para esta tarea" aria-label="Bloquear tiempo para esta tarea" onClick={stop}>
          <G n="hours" size={16} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pmenu fb-pop" side="bottom" align="end" sideOffset={6} collisionPadding={12} onClick={stop}>
          <div className="pm-body">
            <h5>Bloquear tiempo · {task.title.length > 34 ? task.title.slice(0, 34) + '…' : task.title}</h5>
            <div className="seg">
              <button className={!tomorrow ? 'on' : ''} onClick={() => setTomorrow(false)}>
                Hoy
              </button>
              <button className={tomorrow ? 'on' : ''} onClick={() => setTomorrow(true)}>
                Mañana
              </button>
            </div>
            <small className="pm-lbl">Duración</small>
            <div className="seg">
              {DURATIONS.map((d) => (
                <button key={d} className={mins === d ? 'on' : ''} onClick={() => setMins(d)}>
                  {d} min
                </button>
              ))}
            </div>
            <small className="pm-lbl">{cal.status?.connected ? 'Huecos libres (sin reuniones ni otros bloques)' : 'Huecos libres'}</small>
            {slots.length ? (
              <div className="fb-slots">
                {slots.map(([s, e]) => (
                  <button key={s} className="btn sm" title={`Hueco de ${hhmm(s)} a ${hhmm(e)}`} onClick={() => void reserve(s)}>
                    {hhmm(s)}–{hhmm(Math.min(e, s + mins * 60_000))}
                  </button>
                ))}
              </div>
            ) : (
              <div className="meta">No hay huecos de {mins} min {tomorrow ? 'mañana' : 'hoy'}.</div>
            )}
            <small className="pm-lbl">O elige la hora</small>
            <div className="fb-man">
              <input type="time" value={at} aria-label="Hora de inicio" onChange={(e) => setAt(e.target.value)} />
              <button className="btn sm primary" disabled={!at} onClick={manual}>
                Reservar
              </button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
