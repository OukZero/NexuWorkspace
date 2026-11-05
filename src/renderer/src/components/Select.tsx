import * as Popover from '@radix-ui/react-popover'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  /** Encabezado del grupo en el que se muestra (las opciones sin grupo van primero). */
  group?: string
}

interface Props {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  ariaLabel?: string
  title?: string
  disabled?: boolean
  className?: string
  /** Muestra el buscador. Por defecto solo si hay más de 8 opciones. */
  searchable?: boolean
  /** Ancho mínimo del desplegable (px). */
  menuMinWidth?: number
  /** Permite usar un valor que no está en la lista: lo escrito en el buscador se ofrece como «Usar …». */
  creatable?: boolean
}

/** Selector con el estilo de la app (reemplaza al <select> nativo, cuyo desplegable no respeta el tema). */
export function Select({ value, options, onChange, ariaLabel, title, disabled, className, searchable, menuMinWidth, creatable }: Props): ReactNode {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const showSearch = searchable ?? options.length > 8

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options
    // Las opciones sin grupo primero; luego cada grupo en orden de aparición.
    const groups = [...new Set(list.map((o) => o.group ?? ''))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : 0))
    const out = groups.flatMap((g) => list.filter((o) => (o.group ?? '') === g))
    const typed = q.trim()
    if (creatable && typed && !options.some((o) => o.value.toLowerCase() === typed.toLowerCase())) out.push({ value: typed, label: `Usar «${typed}»` })
    return out
  }, [options, q, creatable])

  const current = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    setQ('')
    const i = options.findIndex((o) => o.value === value)
    setActive(Math.max(0, i))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setActive(0), [q])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const pick = (o: SelectOption | undefined): void => {
    if (!o || o.disabled) return
    setOpen(false)
    if (o.value !== value) onChange(o.value)
  }

  const move = (dir: 1 | -1): void => {
    if (!shown.length) return
    let i = active
    for (let n = 0; n < shown.length; n++) {
      i = (i + dir + shown.length) % shown.length
      if (!shown[i].disabled) break
    }
    setActive(i)
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') (e.preventDefault(), move(1))
    else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1))
    else if (e.key === 'Home') (e.preventDefault(), setActive(0))
    else if (e.key === 'End') (e.preventDefault(), setActive(Math.max(0, shown.length - 1)))
    else if (e.key === 'Enter') (e.preventDefault(), pick(shown[active]))
  }

  let lastGroup: string | null = null

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button type="button" className={`sel${className ? ' ' + className : ''}`} aria-label={ariaLabel} title={title} aria-haspopup="listbox">
          <span className="sel-v">{current?.label ?? value}</span>
          <span className="sel-ar" aria-hidden>
            ▾
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="sel-menu"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          style={{ minWidth: `max(var(--radix-popover-trigger-width), ${menuMinWidth ?? 0}px)` }}
          onKeyDown={onKey}
          onOpenAutoFocus={(e) => {
            if (!showSearch) {
              e.preventDefault()
              ;(e.currentTarget as HTMLElement).focus()
            }
          }}
          tabIndex={-1}
        >
          {showSearch && <input className="sel-q" autoFocus value={q} placeholder="Buscar…" aria-label="Buscar" onChange={(e) => setQ(e.target.value)} />}
          <div className="sel-list" role="listbox" ref={listRef}>
            {shown.length === 0 && <div className="sel-empty">Sin resultados</div>}
            {shown.map((o, i) => {
              const g = o.group ?? ''
              const head = g !== lastGroup && g !== ''
              lastGroup = g
              return (
                <div key={o.value + i}>
                  {head && <div className="sel-group">{g}</div>}
                  <div
                    role="option"
                    aria-selected={o.value === value}
                    aria-disabled={o.disabled}
                    data-active={i === active}
                    className={`sel-opt${o.value === value ? ' on' : ''}${o.disabled ? ' off' : ''}`}
                    onMouseMove={() => i !== active && !o.disabled && setActive(i)}
                    onClick={() => pick(o)}
                  >
                    {o.label}
                  </div>
                </div>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
