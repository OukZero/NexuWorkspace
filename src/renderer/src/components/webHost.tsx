import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { WebState } from '../../../shared/types'

/**
 * Páginas web incrustadas (paneles y pestañas «Web», WhatsApp) como <webview>.
 * Cada página vive en <WebHost/> (montado una vez, en la raíz de la app), así sigue viva al cambiar de vista. Las vistas solo
 * reservan un hueco (<WebAnchor/>) y el anfitrión coloca la página encima, dentro del mismo documento: los menús y diálogos de
 * la app se dibujan por encima sin trucos, y al redimensionar no hay que sincronizar nada con otro proceso.
 */

export interface Slot {
  id: string
  partition: 'persist:web' | 'persist:whatsapp'
  kind: 'web' | 'wsp'
  /** Dirección inicial (después se navega con navigate()). */
  url: string
}

// Tipo mínimo del elemento <webview> (lo que usamos de su API)
export interface WebviewEl extends HTMLElement {
  getURL(): string
  getTitle(): string
  canGoBack(): boolean
  canGoForward(): boolean
  isLoading(): boolean
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
  loadURL(url: string): Promise<void>
  getWebContentsId(): number
}

const slots = new Map<string, Slot>()
const anchors = new Map<string, HTMLElement>()
const els = new Map<string, WebviewEl>()
const ready = new Set<string>()
const subs = new Set<() => void>()
let version = 0
const bump = (): void => {
  version++
  subs.forEach((f) => f())
}

/** Crea la página si aún no existe (no cambia la de una que ya está viva). */
export function ensureSlot(s: Slot): void {
  if (slots.has(s.id)) return
  slots.set(s.id, s)
  bump()
}

/** Destruye las páginas con ese prefijo que ya no estén en `keep`. */
export function dropSlots(prefix: string, keep: string[]): void {
  let changed = false
  for (const id of [...slots.keys()]) {
    if (id.startsWith(prefix) && !keep.includes(id)) {
      slots.delete(id)
      anchors.delete(id)
      els.delete(id)
      ready.delete(id)
      changed = true
    }
  }
  if (changed) bump()
}

export const setAnchor = (id: string, el: HTMLElement | null): void => {
  if (el) anchors.set(id, el)
  else anchors.delete(id)
}

/** El elemento <webview> de la página, solo si ya se puede usar su API (tras dom-ready). */
export const getWebview = (id: string): WebviewEl | null => (ready.has(id) ? (els.get(id) ?? null) : null)

/** Navega a una dirección ya normalizada. Devuelve false si la página aún no está lista. */
export function navigate(id: string, url: string): boolean {
  const wv = getWebview(id)
  if (!wv) return false
  void wv.loadURL(url).catch(() => undefined)
  return true
}

export function navAction(id: string, a: 'back' | 'forward' | 'reload' | 'stop'): void {
  const wv = getWebview(id)
  if (!wv) return
  try {
    if (a === 'back') wv.goBack()
    else if (a === 'forward') wv.goForward()
    else if (a === 'reload') wv.reload()
    else wv.stop()
  } catch {
    /* la página se está cerrando */
  }
}

export function readState(id: string): WebState | null {
  const wv = getWebview(id)
  if (!wv) return null
  try {
    return { url: wv.getURL(), title: wv.getTitle(), canBack: wv.canGoBack(), canForward: wv.canGoForward(), loading: wv.isLoading() }
  } catch {
    return null
  }
}

/** User-Agent de Chrome: el de la app sin la marca «Electron» ni el nombre de la aplicación. */
const chromeUa = (): string => navigator.userAgent.replace(/\s(Electron|shutoki[\w.-]*|mis-tareas[\w.-]*)\/[\w.]+/gi, '')

/** Hueco que reserva una vista para su página. La página se crea al montarse y sigue viva aunque la vista se desmonte. */
export function WebAnchor({ slot, className, onActive }: { slot: Slot; className?: string; onActive?: (visible: boolean) => void }): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ensureSlot(slot)
    setAnchor(slot.id, ref.current)
    void window.api.call('web:active', slot.id).catch(() => undefined)
    onActive?.(true)
    return () => {
      setAnchor(slot.id, null)
      onActive?.(false)
    }
    // el hueco corresponde a una sola página; su dirección inicial solo cuenta al crearla
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.id])
  return <div ref={ref} className={className ?? 'web-host'} aria-label="Página web" />
}

/** Montar una sola vez en la raíz de la app: contiene todas las páginas y las coloca sobre su hueco. */
export function WebHost(): ReactNode {
  const [, setV] = useState(0)
  useEffect(() => {
    const f = (): void => setV(version)
    subs.add(f)
    return () => void subs.delete(f)
  }, [])

  // coloca cada página sobre su hueco en cada fotograma (barato: solo escribe estilos si algo cambió)
  useEffect(() => {
    let raf = 0
    const last = new Map<string, string>()
    const tick = (): void => {
      // el tamaño de letra de Ajustes se aplica como `zoom` a toda la página: lo que mide getBoundingClientRect ya viene
      // escalado, y al escribirlo como estilo se escalaría otra vez, así que se divide por el zoom
      const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1
      for (const [id, wv] of els) {
        const a = anchors.get(id)
        let key = 'hidden'
        if (a && a.isConnected) {
          const r = a.getBoundingClientRect()
          if (r.width >= 2 && r.height >= 2) key = `${Math.round(r.left / z)}|${Math.round(r.top / z)}|${Math.round(r.width / z)}|${Math.round(r.height / z)}`
        }
        if (last.get(id) === key) continue
        last.set(id, key)
        if (key === 'hidden') {
          wv.style.visibility = 'hidden'
          wv.style.pointerEvents = 'none'
        } else {
          const [x, y, w, h] = key.split('|')
          wv.style.left = `${x}px`
          wv.style.top = `${y}px`
          wv.style.width = `${w}px`
          wv.style.height = `${h}px`
          wv.style.visibility = 'visible'
          wv.style.pointerEvents = 'auto'
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="webhost" aria-hidden={false}>
      {[...slots.values()].map((s) => (
        <webview
          key={s.id}
          ref={(el) => {
            if (el) {
              els.set(s.id, el as unknown as WebviewEl)
              if (!(el as HTMLElement).dataset.wired) {
                ;(el as HTMLElement).dataset.wired = '1'
                el.addEventListener('dom-ready', () => {
                  ready.add(s.id)
                  // al registrarse, si su hueco está a la vista, es la página que se está viendo
                  void window.api
                    .call('web:attach', s.id, (el as unknown as WebviewEl).getWebContentsId(), s.kind)
                    .then(async () => {
                      if (anchors.has(s.id)) await window.api.call('web:active', s.id)
                    })
                    .catch(() => undefined)
                })
              }
            } else {
              els.delete(s.id)
              ready.delete(s.id)
            }
          }}
          className={`wv ${s.kind}`}
          // la partición y el agente deben fijarse antes que la dirección (React asigna los atributos en este orden)
          partition={s.partition}
          useragent={chromeUa()}
          src={s.url}
        />
      ))}
    </div>
  )
}
