import { app, safeStorage, shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import type { CalEvent, CalendarSave, CalendarStatus, FocusBlock } from '../../../shared/types'
import { clip, mergedMs } from '../../../shared/util'
import { commit, getDb, uid } from '../../db'
import { notify } from '../../notify'
import { startTimer } from '../time/timer'
import { emit, showWin } from '../../windows'

/**
 * Calendario de Outlook (Microsoft Graph, solo lectura) + bloques de enfoque locales.
 * Inicio de sesión OAuth con PKCE como app pública (sin secreto): el usuario registra su propia app en Azure
 * (Entra ID → Registros de aplicaciones, plataforma «Aplicación móvil y de escritorio») con la URI de redirección REDIRECT.
 * El refresh token se guarda cifrado con safeStorage.
 */

export const REDIRECT_PORT = 53683
// Microsoft acepta cualquier puerto cuando la URI registrada es http://localhost
export const REDIRECT = `http://localhost:${REDIRECT_PORT}/callback`
const SCOPES = 'offline_access Calendars.Read'
const GRAPH = 'https://graph.microsoft.com/v1.0'
const SYNC_EVERY = 5 * 60_000
const DAY = 86_400_000

interface Tokens {
  refresh: string
  clientId: string
  tenant: string
}

let tokens: Tokens | null = null
let access: { token: string; exp: number } | null = null
let server: http.Server | null = null
let lastError: string | undefined
let loaded = false
let events: CalEvent[] = []
let syncedAt = 0
let syncing: Promise<void> | null = null
const reminded = new Set<string>()

const file = (): string => path.join(app.getPath('userData'), 'outlook.bin')
const clientId = (): string => (getDb().settings.outlookClientId ?? '').trim()
const tenant = (): string => (getDb().settings.outlookTenant ?? '').trim() || 'common'
const authBase = (t = tenant()): string => `https://login.microsoftonline.com/${encodeURIComponent(t)}/oauth2/v2.0`

function persist(): void {
  if (!tokens || !safeStorage.isEncryptionAvailable()) return
  fs.writeFileSync(file(), safeStorage.encryptString(JSON.stringify(tokens)))
}

function load(): void {
  if (tokens || loaded) return
  loaded = true
  try {
    if (!safeStorage.isEncryptionAvailable()) return
    const t = JSON.parse(safeStorage.decryptString(fs.readFileSync(file()))) as Tokens
    if (t.refresh && t.clientId) tokens = t
  } catch {
    /* sin sesión guardada */
  }
}

export function getStatus(): CalendarStatus {
  load()
  const id = clientId()
  return { configured: !!id, connected: !!tokens && tokens.clientId === id && tokens.tenant === tenant(), error: lastError, syncedAt: syncedAt || undefined }
}

export function disconnect(): CalendarStatus {
  tokens = null
  access = null
  events = []
  syncedAt = 0
  lastError = undefined
  reminded.clear()
  try {
    fs.rmSync(file(), { force: true })
  } catch {
    /* ya no estaba */
  }
  return getStatus()
}

export function saveSettings(c: CalendarSave): CalendarStatus {
  const s = getDb().settings
  const id = c.clientId.trim()
  const t = c.tenant.trim() || 'common'
  if (!/^[A-Za-z0-9.-]+$/.test(t)) throw new Error('El inquilino debe ser «common», «organizations», «consumers» o un id/dominio de inquilino.')
  if (id && !/^[0-9a-fA-F-]{36}$/.test(id)) throw new Error('El Client ID de Azure es un GUID (por ejemplo 11111111-2222-3333-4444-555555555555).')
  if (id !== (s.outlookClientId ?? '') || t !== (s.outlookTenant ?? 'common')) disconnect() // otra app o inquilino: hay que volver a conectar
  s.outlookClientId = id
  s.outlookTenant = t
  s.meetingRemindMin = Math.max(0, Math.min(120, Math.round(Number(c.remindMin) || 0)))
  commit()
  return getStatus()
}

async function tokenRequest(body: Record<string, string>, t = tenant()): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  let res: Response
  try {
    res = await fetch(`${authBase(t)}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...body, scope: SCOPES }) })
  } catch {
    throw new Error('Sin conexión con Microsoft')
  }
  const j = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string } | null
  if (!res.ok || !j?.access_token) throw Object.assign(new Error((j?.error_description || `Microsoft respondió ${res.status}`).split('\r\n')[0]), { code: j?.error })
  return { access_token: j.access_token, expires_in: j.expires_in ?? 3600, refresh_token: j.refresh_token }
}

/** Abre el navegador, espera la redirección en localhost y canjea el código por tokens. */
export async function connect(): Promise<CalendarStatus> {
  const id = clientId()
  const t = tenant()
  if (!id) throw new Error('Pega primero el Client ID de tu app de Azure.')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('El cifrado del sistema no está disponible: no se puede guardar la sesión de Outlook.')
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
      res.end(`<meta charset="utf-8"><body style="font:16px system-ui;padding:3em">${ok ? 'Outlook conectado. Ya puedes cerrar esta pestaña.' : 'No se pudo conectar con Outlook. Vuelve a intentarlo desde la app.'}</body>`)
      const detail = u.searchParams.get('error_description')?.split('\r\n')[0]
      done(ok ? null : new Error(err === 'access_denied' ? 'Cancelaste la autorización (o tu organización requiere la aprobación de un administrador).' : detail || 'Respuesta de Microsoft no válida.'), u.searchParams.get('code') ?? '')
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
      const q = new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: REDIRECT, response_mode: 'query', scope: SCOPES, state, code_challenge_method: 'S256', code_challenge: challenge, prompt: 'select_account' })
      void shell.openExternal(`${authBase(t)}/authorize?${q}`)
    })
  }).catch((e: Error) => {
    lastError = e.message
    throw e
  })

  const r = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: id, code_verifier: verifier }, t).catch((e: Error) => {
    lastError = e.message
    throw e
  })
  if (!r.refresh_token) throw new Error('Microsoft no devolvió un refresh token (¿falta el permiso offline_access?).')
  tokens = { refresh: r.refresh_token, clientId: id, tenant: t }
  access = { token: r.access_token, exp: Date.now() + r.expires_in * 1000 - 30_000 }
  lastError = undefined
  persist()
  void sync(true)
  return getStatus()
}

async function accessToken(): Promise<string> {
  load()
  if (!tokens || tokens.clientId !== clientId() || tokens.tenant !== tenant()) throw new Error('Outlook no está conectado.')
  if (access && Date.now() < access.exp) return access.token
  try {
    const r = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh, client_id: tokens.clientId }, tokens.tenant)
    access = { token: r.access_token, exp: Date.now() + r.expires_in * 1000 - 30_000 }
    if (r.refresh_token) {
      tokens = { ...tokens, refresh: r.refresh_token }
      persist()
    }
    return access.token
  } catch (e) {
    if (/invalid_grant|interaction_required|AADSTS70008|AADSTS50173/i.test(`${(e as { code?: string }).code ?? ''} ${(e as Error).message}`)) {
      disconnect()
      lastError = 'La sesión de Outlook caducó: vuelve a conectar.'
    }
    throw e
  }
}

interface GraphEvent {
  id: string
  subject?: string | null
  start?: { dateTime: string }
  end?: { dateTime: string }
  isAllDay?: boolean
  isCancelled?: boolean
  showAs?: string
  responseStatus?: { response?: string }
  onlineMeeting?: { joinUrl?: string | null } | null
  onlineMeetingUrl?: string | null
  webLink?: string
  location?: { displayName?: string }
  organizer?: { emailAddress?: { name?: string } }
}

/** «2026-11-08T14:00:00.0000000» (UTC por la cabecera Prefer) → milisegundos. */
const utc = (s: string): number => Date.parse(s.replace(/(\.\d{3})\d*$/, '$1') + 'Z')
const httpsOnly = (u?: string | null): string | undefined => (u && /^https:\/\//i.test(u) ? u : undefined)

function toEvent(g: GraphEvent): CalEvent | null {
  if (g.isCancelled || !g.start?.dateTime || !g.end?.dateTime) return null
  if (g.responseStatus?.response === 'declined') return null
  const start = utc(g.start.dateTime)
  const end = utc(g.end.dateTime)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return {
    id: g.id,
    title: clip(g.subject?.trim() || '(Sin título)', 140),
    start,
    end,
    allDay: !!g.isAllDay,
    busy: g.showAs !== 'free' && g.showAs !== 'workingElsewhere',
    tentative: g.showAs === 'tentative' || g.responseStatus?.response === 'tentativelyAccepted' || undefined,
    joinUrl: httpsOnly(g.onlineMeeting?.joinUrl) ?? httpsOnly(g.onlineMeetingUrl),
    webLink: httpsOnly(g.webLink),
    location: g.location?.displayName || undefined,
    organizer: g.organizer?.emailAddress?.name || undefined
  }
}

async function fetchEvents(): Promise<CalEvent[]> {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const q = new URLSearchParams({
    startDateTime: new Date(from.getTime() - DAY).toISOString(),
    endDateTime: new Date(from.getTime() + 8 * DAY).toISOString(),
    $select: 'id,subject,start,end,isAllDay,isCancelled,showAs,responseStatus,onlineMeeting,onlineMeetingUrl,webLink,location,organizer',
    $orderby: 'start/dateTime',
    $top: '100'
  })
  const out: CalEvent[] = []
  let url: string | undefined = `${GRAPH}/me/calendarView?${q}`
  for (let page = 0; url && page < 5; page++) {
    const res: Response = await fetch(url, { headers: { authorization: `Bearer ${await accessToken()}`, prefer: 'outlook.timezone="UTC"' } }).catch(() => {
      throw new Error('Sin conexión con Microsoft')
    })
    if (res.status === 401) {
      access = null
      throw new Error('Microsoft rechazó la sesión. Vuelve a intentarlo.')
    }
    if (res.status === 403) throw new Error('Tu organización no permite leer el calendario con esta app (falta el permiso Calendars.Read o la aprobación del administrador).')
    if (res.status === 429) throw new Error('Microsoft limitó las peticiones. Se reintentará más tarde.')
    if (!res.ok) throw new Error(`Microsoft respondió ${res.status}`)
    const j = (await res.json().catch(() => null)) as { value?: GraphEvent[]; '@odata.nextLink'?: string } | null
    for (const g of j?.value ?? []) {
      const e = toEvent(g)
      if (e) out.push(e)
    }
    url = httpsOnly(j?.['@odata.nextLink'])?.startsWith(GRAPH) ? j?.['@odata.nextLink'] : undefined
  }
  return out.sort((a, b) => a.start - b.start)
}

/** Consulta el calendario (como mucho una vez por SYNC_EVERY salvo `force`). Nunca lanza: el error queda en el estado. */
export function sync(force = false): Promise<void> {
  load()
  if (!getStatus().connected) return Promise.resolve()
  if (syncing) return syncing
  if (!force && Date.now() - syncedAt < SYNC_EVERY) return Promise.resolve()
  syncing = fetchEvents()
    .then((list) => {
      events = list
      syncedAt = Date.now()
      lastError = undefined
    })
    .catch((e: Error) => {
      lastError = e.message
      syncedAt = Date.now() - SYNC_EVERY + 60_000 // tras un fallo, reintenta en 1 min
    })
    .finally(() => {
      syncing = null
    })
  return syncing
}

export async function listEvents(force = false): Promise<CalEvent[]> {
  await sync(force)
  return events
}

/** Avisa unos minutos antes de cada reunión. Se llama cada ~30 s. */
export function checkMeetings(): void {
  const mins = getDb().settings.meetingRemindMin ?? 10
  void sync()
  if (mins <= 0) return
  const now = Date.now()
  for (const e of events) {
    if (e.allDay || !e.busy || e.start <= now || e.start - now > mins * 60_000) continue
    const key = `${e.id}:${e.start}`
    if (reminded.has(key)) continue
    reminded.add(key)
    const left = Math.max(1, Math.round((e.start - now) / 60_000))
    const join = e.joinUrl
    notify({
      kind: 'calendar',
      title: `Reunión en ${left} min · ${clip(e.title, 70)}`,
      body: [new Date(e.start).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }), e.location, join ? 'Pulsa para unirte' : ''].filter(Boolean).join(' · '),
      goto: 'today',
      flash: true,
      tg: false,
      onClick: join ? () => void shell.openExternal(join) : undefined
    })
  }
  for (const k of reminded) if (Number(k.split(':').pop()) < now - DAY) reminded.delete(k)
}

// ---------- bloques de enfoque ----------

export function saveFocusBlock(b: Partial<FocusBlock> & { taskId: string; start: number; end: number }): FocusBlock {
  const db = getDb()
  if (!db.tasks.some((t) => t.id === b.taskId)) throw new Error('La tarea ya no existe.')
  if (!(b.end > b.start) || b.end - b.start > 12 * 3600_000) throw new Error('El bloque debe durar entre 1 minuto y 12 horas.')
  const list = (db.focusBlocks ??= [])
  const prev = b.id ? list.find((x) => x.id === b.id) : undefined
  const block: FocusBlock = { id: prev?.id ?? uid(), taskId: b.taskId, start: b.start, end: b.end, notified: prev && prev.start === b.start ? prev.notified : false }
  if (prev) Object.assign(prev, block)
  else list.push(block)
  commit()
  return block
}

export function deleteFocusBlock(id: string): void {
  const db = getDb()
  db.focusBlocks = (db.focusBlocks ?? []).filter((b) => b.id !== id)
  commit()
}

export function dropFocusBlocksOf(taskId: string): void {
  const db = getDb()
  if (db.focusBlocks?.some((b) => b.taskId === taskId)) db.focusBlocks = db.focusBlocks.filter((b) => b.taskId !== taskId)
}

/** Cuando llega la hora de un bloque avisa y, al pulsar, arranca el timer de su tarea. También limpia los bloques viejos. */
export function checkFocusBlocks(): void {
  const db = getDb()
  const list = db.focusBlocks
  if (!list?.length) return
  const now = Date.now()
  let changed = false
  for (const b of list) {
    if (b.notified || b.start > now || b.end <= now) continue
    const task = db.tasks.find((t) => t.id === b.taskId)
    b.notified = true
    changed = true
    if (!task || task.status === 'done') continue
    const mins = Math.round((b.end - b.start) / 60_000)
    notify({
      kind: 'calendar',
      title: `Bloque de enfoque · ${clip(task.title, 60)}`,
      body: `Es la hora de tu bloque de ${mins} min. Pulsa para empezar el timer.`,
      tg: false,
      flash: true,
      onClick: () => {
        startTimer(task.id)
        commit()
        showWin()
        emit('goto', 'today')
      }
    })
  }
  const keep = list.filter((b) => b.end > now - 7 * DAY)
  if (keep.length !== list.length) {
    db.focusBlocks = keep
    changed = true
  }
  if (changed) commit()
}

/** Horas de reuniones ocupadas hoy (solapadas unidas, sin las de todo el día ni las provisionales). */
export function meetingHoursToday(): number {
  const s = new Date()
  s.setHours(0, 0, 0, 0)
  const from = s.getTime()
  const to = from + DAY
  return mergedMs(events.filter((e) => !e.allDay && e.busy && !e.tentative && e.start < to && e.end > from).map((e): [number, number] => [Math.max(e.start, from), Math.min(e.end, to)])) / 3600_000
}
