import * as Popover from '@radix-ui/react-popover'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { DayPicker } from 'react-day-picker'
import { es } from 'react-day-picker/locale/es'
import 'react-day-picker/style.css'
import { dayKey } from '../utils'

interface Props {
  /** Fecha como YYYY-MM-DD. */
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
  className?: string
}

const parse = (v: string): Date => new Date(`${v}T00:00:00`)

/** Selector de fecha con el estilo de la app (reemplaza a <input type="date">). */
export function DatePicker({ value, onChange, ariaLabel, className }: Props): ReactNode {
  const [open, setOpen] = useState(false)
  const date = parse(value)
  const valid = !isNaN(date.getTime())
  const label = valid ? date.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Elegir fecha'

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className={`dp-trigger ${className ?? ''}`} aria-label={ariaLabel ?? 'Elegir fecha'}>
          <span aria-hidden>📅</span> {label}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="dp-pop" sideOffset={6} align="start" collisionPadding={12}>
          <DayPicker
            mode="single"
            locale={es}
            weekStartsOn={1}
            showOutsideDays
            selected={valid ? date : undefined}
            defaultMonth={valid ? date : new Date()}
            onSelect={(d) => {
              if (!d) return // volver a pulsar el día elegido no lo deselecciona
              onChange(dayKey(d))
              setOpen(false)
            }}
          />
          <div className="dp-foot">
            <button
              type="button"
              onClick={() => {
                onChange(dayKey(new Date()))
                setOpen(false)
              }}
            >
              Hoy
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
