import { useSyncExternalStore } from 'react'

/**
 * Hueco de la fila de la tarea (a la derecha de Chat / Diseño / Git / Archivos) donde el chat coloca sus
 * acciones propias, como «Probar». La fila la dibuja la ventana principal; el chat lo rellena con un portal.
 */
let el: HTMLElement | null = null
const subs = new Set<() => void>()

export function setTaskSlot(next: HTMLElement | null): void {
  if (next === el) return
  el = next
  subs.forEach((f) => f())
}

export const useTaskSlot = (): HTMLElement | null =>
  useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => el
  )

/** Hueco a la izquierda de la fila de la tarea, justo a la derecha de los modos (la rama de Git, por ejemplo). */
let left: HTMLElement | null = null
const leftSubs = new Set<() => void>()

export function setTaskSlotLeft(next: HTMLElement | null): void {
  if (next === left) return
  left = next
  leftSubs.forEach((f) => f())
}

export const useTaskSlotLeft = (): HTMLElement | null =>
  useSyncExternalStore(
    (cb) => (leftSubs.add(cb), () => leftSubs.delete(cb)),
    () => left
  )
