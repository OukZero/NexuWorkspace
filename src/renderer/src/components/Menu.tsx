import * as Popover from '@radix-ui/react-popover'
import { useState } from 'react'
import type { ReactNode } from 'react'

export type MenuItem =
  | { kind?: 'item'; label: string; icon?: string; hint?: string; danger?: boolean; disabled?: boolean; onSelect: () => void }
  | { kind: 'sep' }

interface Props {
  /** Contenido del botón que abre el menú. */
  trigger: ReactNode
  items: MenuItem[]
  title?: string
  ariaLabel?: string
  className?: string
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/** Menú desplegable con el estilo de la app (acciones secundarias agrupadas tras un botón «⋯»). */
export function Menu({ trigger, items, title, ariaLabel, className, align = 'end', side = 'bottom' }: Props): ReactNode {
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className={className ?? 'btn sm menu-trigger'} title={title} aria-label={ariaLabel ?? title}>
          {trigger}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="menu-pop" align={align} side={side} sideOffset={6} collisionPadding={12}>
          {items.map((it, i) =>
            it.kind === 'sep' ? (
              <div key={i} className="menu-sep" />
            ) : (
              <button
                key={i}
                type="button"
                className={`menu-item ${it.danger ? 'danger' : ''}`}
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false)
                  it.onSelect()
                }}
              >
                <span className="menu-ico" aria-hidden>
                  {it.icon ?? ''}
                </span>
                <span className="menu-txt">
                  {it.label}
                  {it.hint && <small>{it.hint}</small>}
                </span>
              </button>
            )
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
