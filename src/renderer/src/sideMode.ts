import { useSyncExternalStore } from 'react'

/** Menú lateral: ancho (con nombres y secciones) o reducido a la barra de iconos. Se recuerda entre sesiones. */
const KEY = 'shutoki.sideWide'

function load(): boolean {
  try {
    const v = localStorage.getItem(KEY)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}

let wide = load()
const subs = new Set<() => void>()

export const getSideWide = (): boolean => wide

export function setSideWide(v: boolean): void {
  if (v === wide) return
  wide = v
  try {
    localStorage.setItem(KEY, v ? '1' : '0')
  } catch {
    /* sin storage */
  }
  subs.forEach((f) => f())
}

export const useSideWide = (): boolean =>
  useSyncExternalStore(
    (cb) => (subs.add(cb), () => subs.delete(cb)),
    () => wide
  )
