import { useSyncExternalStore } from 'react'
import type { SpotifyAction, SpotifyDevice, SpotifyNow, SpotifyStatus } from '../../shared/types'

/** Estado compartido de Spotify: lo usan el mini reproductor de la barra superior y la vista «Música». */
interface Snap {
  status: SpotifyStatus | null
  now: SpotifyNow | null
  /** Instante en que se leyó `now`, para animar el progreso entre lecturas. */
  at: number
  error: string
  loaded: boolean
  /** Dispositivos disponibles; se leen al abrir el selector (no en cada lectura periódica, para no gastar peticiones). */
  devices: SpotifyDevice[]
}

let snap: Snap = { status: null, now: null, at: 0, error: '', loaded: false, devices: [] }
const subs = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | undefined
let inflight = false
let lastStatusAt = 0

const POLL_MS = 6000
const MAX_POLL_MS = 60_000
let delay = POLL_MS // se alarga mientras Spotify falle (sin red, límite de peticiones) y vuelve a 6 s al recuperarse

const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b)

/** Solo notifica si algo cambió de verdad: una lectura idéntica no debe volver a pintar la app. */
const set = (p: Partial<Snap>): void => {
  const keys = Object.keys(p) as Array<keyof Snap>
  if (keys.every((k) => same(snap[k], p[k]))) return
  snap = { ...snap, ...p }
  subs.forEach((f) => f())
}

export async function refreshStatus(): Promise<SpotifyStatus | null> {
  lastStatusAt = Date.now()
  try {
    const st = await window.api.call('spotify:status')
    set({ status: st, loaded: true })
    if (!st.connected) set({ now: null, error: '', devices: [] })
    return st
  } catch {
    set({ loaded: true })
    return null
  }
}

const clean = (e: unknown): string => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

export async function refreshNow(): Promise<void> {
  if (!snap.status?.connected || inflight) return
  inflight = true
  try {
    const n = await window.api.call('spotify:now')
    delay = POLL_MS
    set({ now: n, at: Date.now(), error: '' })
  } catch (e) {
    delay = Math.min(MAX_POLL_MS, delay * 2)
    set({ error: clean(e) })
  } finally {
    inflight = false
  }
}

export function setSpotifyStatus(st: SpotifyStatus): void {
  lastStatusAt = Date.now()
  set({ status: st, loaded: true })
  if (st.connected) void refreshNow()
  else set({ now: null, error: '', devices: [] })
}

/** Lee los dispositivos disponibles (al abrir el selector o al pulsar actualizar). Devuelve el mensaje de error, si lo hay. */
export async function refreshDevices(): Promise<string> {
  if (!snap.status?.connected) return ''
  try {
    set({ devices: await window.api.call('spotify:devices') })
    return ''
  } catch (e) {
    return clean(e)
  }
}

/** Traspasa la reproducción a ese dispositivo y lo recuerda como el preferido. Devuelve el mensaje de error, si lo hay. */
export async function transferTo(id: string): Promise<string> {
  try {
    await window.api.call('spotify:transfer', id)
    set({ error: '' })
    await Promise.all([refreshDevices(), refreshNow()])
    return ''
  } catch (e) {
    const m = clean(e)
    set({ error: m })
    return m
  }
}

export async function spotifyAct(a: SpotifyAction): Promise<string> {
  try {
    await window.api.call('spotify:control', a)
    set({ error: '' })
    setTimeout(() => void refreshNow(), 700)
    return ''
  } catch (e) {
    const m = clean(e)
    set({ error: m })
    return m
  }
}

/** Cambia el volumen del dispositivo activo (0-100). Se refleja al instante y se confirma con la siguiente lectura. */
export async function spotifyVolume(v: number): Promise<string> {
  const volume = Math.max(0, Math.min(100, Math.round(v)))
  if (snap.now) set({ now: { ...snap.now, volume } })
  try {
    await window.api.call('spotify:volume', volume)
    set({ error: '' })
    return ''
  } catch (e) {
    const m = clean(e)
    set({ error: m })
    return m
  }
}

/** Reproduce una canción, playlist o álbum del buscador. Devuelve el mensaje de error, si lo hay. */
export async function spotifyPlay(uri: string): Promise<string> {
  try {
    await window.api.call('spotify:play', uri)
    set({ error: '' })
    setTimeout(() => void refreshNow(), 900)
    return ''
  } catch (e) {
    const m = clean(e)
    set({ error: m })
    return m
  }
}

/** Añade una canción a la cola. Devuelve el mensaje de error, si lo hay. */
export async function spotifyQueue(uri: string): Promise<string> {
  try {
    await window.api.call('spotify:queue', uri)
    return ''
  } catch (e) {
    return clean(e)
  }
}

/** Lectura periódica encadenada (no un setInterval): nunca se solapan dos y se alarga si Spotify falla. */
function schedule(): void {
  timer = setTimeout(async () => {
    if (document.visibilityState === 'visible') await refreshNow()
    if (timer !== undefined) schedule()
  }, delay)
}

function start(): void {
  if (timer !== undefined) return
  // si otro componente acaba de leer el estado (p. ej. al volver a montarse), no se repite la consulta
  if (!snap.loaded || Date.now() - lastStatusAt > 2000) void refreshStatus().then(() => void refreshNow())
  else void refreshNow()
  schedule()
}

function stop(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

// subscribe y getSnapshot deben ser estables: si cambian en cada render, React se vuelve a suscribir en cada render,
// y como suscribirse arranca la lectura, cada lectura repinta, vuelve a suscribir… un bucle que satura la app.
function subscribe(f: () => void): () => void {
  subs.add(f)
  if (subs.size === 1) start()
  return () => {
    subs.delete(f)
    if (subs.size === 0) stop()
  }
}
const getSnapshot = (): Snap => snap

export function useSpotify(): Snap {
  return useSyncExternalStore(subscribe, getSnapshot)
}

