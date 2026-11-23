import { app, safeStorage, shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import type { SpotifyAction, SpotifyDevice, SpotifyNow, SpotifyPlaylist, SpotifySearchResult, SpotifyStatus, SpotifyTrack } from '../../../shared/types'
import { commit, getDb } from '../../db'

/**
 * Spotify: inicio de sesión OAuth con PKCE (sin secreto de cliente) y control de la reproducción con la Web API.
 * El usuario registra su propia app en developer.spotify.com y pega el Client ID en Ajustes; la URI de redirección
 * debe ser exactamente REDIRECT. El refresh token se guarda cifrado con safeStorage.
 */

export const REDIRECT_PORT = 53682
export const REDIRECT = `http://127.0.0.1:${REDIRECT_PORT}/callback`
// los dos últimos permiten listar tus playlists; la búsqueda no necesita permisos extra
const SCOPES = 'user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative'
const ACCOUNTS = 'https://accounts.spotify.com'
const API = 'https://api.spotify.com/v1'

interface Tokens {
  refresh: string
  clientId: string
}

let tokens: Tokens | null = null
let access: { token: string; exp: number } | null = null
let server: http.Server | null = null
let lastError: string | undefined
let loaded = false // la sesión guardada se lee del disco una sola vez, no en cada consulta de estado

const file = (): string => path.join(app.getPath('userData'), 'spotify.bin')
const clientId = (): string => (getDb().settings.spotifyClientId ?? '').trim()

async function persist(): Promise<void> {
  try {
    if (!tokens || !(await safeStorage.isAsyncEncryptionAvailable())) return
    fs.writeFileSync(file(), await safeStorage.encryptStringAsync(JSON.stringify(tokens)))
  } catch {
    /* sin permiso de escritura: la sesión vale solo hasta cerrar la app */
  }
}

// la API de cifrado asíncrona obliga a cargar la sesión una sola vez y esperar a que termine antes de usarla
let loading: Promise<void> | null = null
export function ensureLoaded(): Promise<void> {
  loading ??= (async () => {
    if (tokens || loaded) return
    loaded = true
    try {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) return
      const t = JSON.parse((await safeStorage.decryptStringAsync(fs.readFileSync(file()))).result) as Tokens
      if (t.refresh && t.clientId && !tokens) tokens = t
    } catch {
      /* sin sesión guardada */
    }
  })()
  return loading
}

export function getStatus(): SpotifyStatus {
  void ensureLoaded()
  const id = clientId()
  return { configured: !!id, connected: !!tokens && tokens.clientId === id, error: lastError }
}

export function disconnect(): SpotifyStatus {
  tokens = null
  access = null
  lastError = undefined
  try {
    fs.rmSync(file(), { force: true })
  } catch {
    /* ya no estaba */
  }
  return getStatus()
}

async function tokenRequest(body: Record<string, string>): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  let res: Response
  try {
    res = await fetch(`${ACCOUNTS}/api/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) })
  } catch {
    throw new Error('Sin conexión con Spotify')
  }
  const j = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; refresh_token?: string; error_description?: string } | null
  if (!res.ok || !j?.access_token) throw new Error(j?.error_description || `Spotify respondió ${res.status}`)
  return { access_token: j.access_token, expires_in: j.expires_in ?? 3600, refresh_token: j.refresh_token }
}

/** Abre el navegador, espera la redirección en 127.0.0.1 y canjea el código por tokens. */
export async function connect(): Promise<SpotifyStatus> {
  const id = clientId()
  if (!id) throw new Error('Pega primero el Client ID de tu app de Spotify.')
  if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error('El cifrado del sistema no está disponible: no se puede guardar la sesión de Spotify.')
  server?.close()
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('hex')

  const code = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => done(new Error('Tiempo agotado esperando la autorización en el navegador.')), 3 * 60_000)
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url ?? '/', REDIRECT)
      if (u.pathname !== '/callback') return void res.writeHead(404).end()
      const err = u.searchParams.get('error')
      const ok = !err && u.searchParams.get('state') === state && !!u.searchParams.get('code')
      res.writeHead(ok ? 200 : 400, { 'content-type': 'text/html; charset=utf-8' })
      res.end(`<meta charset="utf-8"><body style="font:16px system-ui;padding:3em">${ok ? 'Spotify conectado. Ya puedes cerrar esta pestaña.' : 'No se pudo conectar con Spotify. Vuelve a intentarlo desde la app.'}</body>`)
      done(ok ? null : new Error(err === 'access_denied' ? 'Cancelaste la autorización.' : 'Respuesta de Spotify no válida.'), u.searchParams.get('code') ?? '')
    })
    server = srv
    function done(e: Error | null, c = ''): void {
      clearTimeout(timeout)
      srv.close()
      if (server === srv) server = null
      if (e) reject(e)
      else resolve(c)
    }
    srv.on('error', (e: NodeJS.ErrnoException) => done(new Error(e.code === 'EADDRINUSE' ? `El puerto ${REDIRECT_PORT} está ocupado.` : e.message)))
    srv.listen(REDIRECT_PORT, '127.0.0.1', () => {
      const q = new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPES, state, code_challenge_method: 'S256', code_challenge: challenge })
      void shell.openExternal(`${ACCOUNTS}/authorize?${q}`)
    })
  }).catch((e: Error) => {
    lastError = e.message
    throw e
  })

  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: id, code_verifier: verifier })
  if (!t.refresh_token) throw new Error('Spotify no devolvió un refresh token.')
  tokens = { refresh: t.refresh_token, clientId: id }
  access = { token: t.access_token, exp: Date.now() + t.expires_in * 1000 - 30_000 }
  lastError = undefined
  await persist()
  return getStatus()
}

async function accessToken(): Promise<string> {
  await ensureLoaded()
  if (!tokens || tokens.clientId !== clientId()) throw new Error('Spotify no está conectado.')
  if (access && Date.now() < access.exp) return access.token
  try {
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh, client_id: tokens.clientId })
    access = { token: t.access_token, exp: Date.now() + t.expires_in * 1000 - 30_000 }
    if (t.refresh_token) {
      tokens = { ...tokens, refresh: t.refresh_token }
      void persist()
    }
    return access.token
  } catch (e) {
    if (/revoked|invalid_grant|refresh token/i.test((e as Error).message)) disconnect()
    throw e
  }
}

async function request(method: string, p: string, body?: unknown): Promise<Response> {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: { authorization: `Bearer ${await accessToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }).catch(() => {
    throw new Error('Sin conexión con Spotify')
  })
  if (res.status === 401) access = null
  if (res.status === 403) throw new Error('Spotify rechazó la acción: el control de reproducción requiere cuenta Premium (o la app aún no te tiene registrado como usuario).')
  if (res.status === 404) throw new Error('NO_DEVICE')
  if (res.status === 429) throw new Error('Spotify limitó las peticiones. Espera unos segundos.')
  if (!res.ok && res.status !== 204) throw new Error(`Spotify respondió ${res.status}`)
  return res
}

interface ApiImage {
  url: string
}

/** Portada de tamaño medio (Spotify las devuelve de mayor a menor: 640, 300, 64); la más grande si solo hay una. */
const pickArt = (imgs?: ApiImage[] | null): string | undefined => (imgs && imgs.length > 0 ? (imgs.length > 1 ? imgs[imgs.length - 2] : imgs[0]).url : undefined)

/** Pista actual; null si no hay reproductor activo. */
export async function now(): Promise<SpotifyNow | null> {
  const res = await request('GET', '/me/player?additional_types=episode').catch((e: Error) => {
    if (e.message === 'NO_DEVICE') return null
    throw e
  })
  if (!res) return null
  if (res.status === 204) return null
  const j = (await res.json().catch(() => null)) as {
    is_playing?: boolean
    progress_ms?: number
    device?: { name?: string; volume_percent?: number | null; supports_volume?: boolean }
    item?: { name?: string; duration_ms?: number; artists?: Array<{ name: string }>; show?: { name?: string; images?: Array<{ url: string }> }; album?: { images?: Array<{ url: string }> }; images?: Array<{ url: string }> }
  } | null
  if (!j?.item) return null
  const art = pickArt(j.item.album?.images ?? j.item.images ?? j.item.show?.images)
  return { playing: !!j.is_playing, title: j.item.name ?? '', artist: j.item.artists?.map((a) => a.name).join(', ') || j.item.show?.name || '', art, progressMs: j.progress_ms, durationMs: j.item.duration_ms, device: j.device?.name, volume: j.device?.supports_volume === false ? undefined : (j.device?.volume_percent ?? undefined) }
}

/** «spotify:playlist:ID», «spotify:album:ID» o enlace open.spotify.com → URI de contexto; null si no es válido. */
export function toContextUri(raw: string): string | null {
  const s = raw.trim()
  const uri = /^spotify:(playlist|album|artist|show):([A-Za-z0-9]+)$/.exec(s)
  if (uri) return s
  const url = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|artist|show)\/([A-Za-z0-9]+)/.exec(s)
  return url ? `spotify:${url[1]}:${url[2]}` : null
}

interface Device {
  id: string | null
  name?: string
  type?: string
  is_active: boolean
  is_restricted?: boolean
}

async function devices(): Promise<Device[]> {
  const res = await request('GET', '/me/player/devices').catch((e: Error) => {
    if (e.message === 'NO_DEVICE') return null
    throw e
  })
  const j = res ? ((await res.json().catch(() => null)) as { devices?: Device[] } | null) : null
  return j?.devices ?? []
}

const NO_DEVICE_MSG = 'Spotify no tiene ningún dispositivo disponible. Abre la aplicación de Spotify en este equipo (o en el móvil) y vuelve a intentarlo.'
const SLEEPING_MSG = 'Spotify está abierto pero no despertó a tiempo. Vuelve a pulsar el botón en unos segundos.'

type Usable = Device & { id: string; name: string }
const usable = (list: Device[]): Usable[] => list.filter((d): d is Usable => !!d.id && !!d.name && !d.is_restricted)

/** El dispositivo a despertar: el que elegiste en la app, si no el activo, este equipo o el primero que no esté restringido. */
async function pickDevice(): Promise<Usable> {
  const list = usable(await devices())
  const s = getDb().settings
  // el id puede cambiar (reproductor web, reinstalaciones): si no coincide, se busca por nombre
  const chosen = (s.spotifyDeviceId && list.find((x) => x.id === s.spotifyDeviceId)) || (s.spotifyDeviceName && list.find((x) => x.name === s.spotifyDeviceName))
  const d = chosen || list.find((x) => x.is_active) || list.find((x) => x.type === 'Computer') || list[0]
  if (!d) throw new Error(NO_DEVICE_MSG)
  return d
}

/** Dispositivos disponibles ahora (Spotify abierto en este equipo, el móvil, un altavoz…). */
export async function listDevices(): Promise<SpotifyDevice[]> {
  return usable(await devices()).map((d) => ({ id: d.id, name: d.name, type: d.type ?? '', active: d.is_active }))
}

/** Traspasa la reproducción a otro dispositivo (si estaba sonando, sigue sonando allí) y lo recuerda como el preferido. */
export async function transfer(id: string): Promise<void> {
  const target = usable(await devices()).find((d) => d.id === id)
  if (!target) throw new Error('Ese dispositivo ya no está disponible. Abre Spotify allí y actualiza la lista.')
  const playing = await now()
    .then((n) => !!n?.playing)
    .catch(() => false)
  await request('PUT', '/me/player', { device_ids: [id], play: playing }).catch((e: Error) => {
    throw new Error(e.message === 'NO_DEVICE' ? SLEEPING_MSG : e.message)
  })
  const s = getDb().settings
  s.spotifyDeviceId = target.id
  s.spotifyDeviceName = target.name
  commit()
  await waitActive(id)
}

/** Tras traspasar la reproducción, Spotify tarda un poco en marcar el dispositivo como activo: se espera (máx. ~4 s). */
async function waitActive(id: string): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if ((await devices().catch(() => [])).some((d) => d.id === id && d.is_active)) return
  }
}

/**
 * Envía un comando de reproducción. Si no hay dispositivo activo (Spotify abierto pero sin haber reproducido nada):
 *  1) se repite el comando apuntando al dispositivo con `device_id`, que lo activa directamente;
 *  2) si aún no responde, se traspasa la reproducción, se espera a que quede activo y se repite.
 */
async function send(method: string, p: string, body?: unknown): Promise<void> {
  try {
    return void (await request(method, p, body))
  } catch (e) {
    if ((e as Error).message !== 'NO_DEVICE') throw e
  }
  const dev = await pickDevice()
  try {
    return void (await request(method, `${p}${p.includes('?') ? '&' : '?'}device_id=${encodeURIComponent(dev.id)}`, body))
  } catch (e) {
    if ((e as Error).message !== 'NO_DEVICE') throw e
  }
  await request('PUT', '/me/player', { device_ids: [dev.id], play: false }).catch((e: Error) => {
    throw new Error(e.message === 'NO_DEVICE' ? SLEEPING_MSG : e.message)
  })
  await waitActive(dev.id)
  await request(method, p, body).catch((e: Error) => {
    throw new Error(e.message === 'NO_DEVICE' ? SLEEPING_MSG : e.message)
  })
}

export async function control(action: SpotifyAction): Promise<void> {
  if (action === 'next') await send('POST', '/me/player/next')
  else if (action === 'prev') await send('POST', '/me/player/previous')
  else if (action === 'pause') await send('PUT', '/me/player/pause')
  else if (action === 'play') await send('PUT', '/me/player/play')
  else {
    // «focus»: empieza la lista de enfoque, o reanuda si no hay ninguna configurada
    const uri = toContextUri(getDb().settings.spotifyFocusUri ?? '')
    await send('PUT', '/me/player/play', uri ? { context_uri: uri } : undefined)
  }
}

/** Volumen (0-100) del dispositivo activo; si no hay ninguno activo, lo despierta igual que los demás controles. */
export async function setVolume(v: number): Promise<void> {
  if (!Number.isFinite(v)) throw new Error('Volumen no válido.')
  const n = Math.max(0, Math.min(100, Math.round(v)))
  await send('PUT', `/me/player/volume?volume_percent=${n}`)
}

interface ApiTrack {
  uri?: string
  name?: string
  duration_ms?: number
  artists?: Array<{ name: string }>
  album?: { name?: string; images?: ApiImage[] }
}
interface ApiPlaylist {
  uri?: string
  name?: string
  owner?: { display_name?: string }
  images?: ApiImage[] | null
}

const toTrack = (t: ApiTrack | null | undefined): SpotifyTrack | null =>
  t?.uri && t.name
    ? { uri: t.uri, title: t.name, artist: t.artists?.map((a) => a.name).join(', ') ?? '', album: t.album?.name ?? '', art: pickArt(t.album?.images), durationMs: t.duration_ms ?? 0 }
    : null
// la API devuelve a veces elementos null dentro de las listas de playlists: se descartan
const toPlaylist = (p: ApiPlaylist | null | undefined): SpotifyPlaylist | null =>
  p?.uri && p.name ? { uri: p.uri, name: p.name, owner: p.owner?.display_name ?? '', art: pickArt(p.images) } : null
const present = <T>(x: T | null): x is T => x !== null

/** Busca canciones y playlists por texto. */
export async function search(q: string): Promise<SpotifySearchResult> {
  const text = q.trim().slice(0, 100)
  if (!text) return { tracks: [], playlists: [] }
  const res = await request('GET', `/search?${new URLSearchParams({ q: text, type: 'track,playlist', limit: '8' })}`)
  const j = (await res.json().catch(() => null)) as { tracks?: { items?: Array<ApiTrack | null> }; playlists?: { items?: Array<ApiPlaylist | null> } } | null
  return { tracks: (j?.tracks?.items ?? []).map(toTrack).filter(present), playlists: (j?.playlists?.items ?? []).map(toPlaylist).filter(present) }
}

/** Playlists de la biblioteca del usuario. Las sesiones antiguas no tienen el permiso: hay que volver a conectar. */
export async function myPlaylists(): Promise<SpotifyPlaylist[]> {
  const out: SpotifyPlaylist[] = []
  // se leen por páginas de 50 (hasta 250 playlists)
  for (let offset = 0; offset < 250; offset += 50) {
    const res = await request('GET', `/me/playlists?limit=50&offset=${offset}`).catch((e: Error) => {
      if (e.message.startsWith('Spotify rechazó')) throw new Error('Para ver tus playlists, desconecta Spotify y vuelve a conectarlo (falta el permiso de playlists).')
      throw e
    })
    const j = (await res.json().catch(() => null)) as { items?: Array<ApiPlaylist | null>; next?: string | null } | null
    out.push(...(j?.items ?? []).map(toPlaylist).filter(present))
    if (!j?.next) break
  }
  return out
}

/** Reproduce una canción suelta, o una playlist / álbum desde el principio. */
export async function playUri(uri: string): Promise<void> {
  const m = /^spotify:(track|playlist|album):[A-Za-z0-9]+$/.exec(uri)
  if (!m) throw new Error('Ese elemento de Spotify no es válido.')
  await send('PUT', '/me/player/play', m[1] === 'track' ? { uris: [uri] } : { context_uri: uri })
}

/** Añade una canción al final de la cola. */
export async function queueUri(uri: string): Promise<void> {
  if (!/^spotify:track:[A-Za-z0-9]+$/.test(uri)) throw new Error('Solo se pueden añadir canciones a la cola.')
  await send('POST', `/me/player/queue?uri=${encodeURIComponent(uri)}`)
}
