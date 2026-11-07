import type { PointerEvent, ReactNode } from 'react'

/** Borde arrastrable para cambiar el ancho (o alto) de un panel. Doble clic: tamaño original. */
export function Resizer({ value, onChange, onReset, invert = false, axis = 'x', label }: { value: number; onChange: (v: number) => void; onReset?: () => void; invert?: boolean; axis?: 'x' | 'y'; label: string }): ReactNode {
  const down = (e: PointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const start = axis === 'x' ? e.clientX : e.clientY
    const base = value
    document.body.classList.add('resizing')
    const move = (ev: globalThis.PointerEvent): void => {
      const d = ((axis === 'x' ? ev.clientX : ev.clientY) - start) * (invert ? -1 : 1)
      onChange(base + d)
    }
    const up = (): void => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      document.body.classList.remove('resizing')
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
  return <div className={`resizer ${axis}`} role="separator" aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'} aria-label={label} title={`${label} (doble clic: tamaño original)`} onPointerDown={down} onDoubleClick={onReset} />
}
