import { app, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { dayKey } from '../../../shared/util'
import type { RedmineCatalog, RedmineDay, RedmineDraft, RedmineLine, RedmineResult } from '../../../shared/types'
import { summarizeNotes } from '../ai/summary'
import { commit, getDb } from '../../db'

/**
 * Imputación de horas en Easy Redmine sin API pública: el propio modal «Log time» habla con /graphql.json usando la sesión web.
 * Una ventana propia (con sesión guardada, así el login/SSO se hace una vez) lanza esas mismas consultas desde dentro de la página,
 * con las cookies y el token CSRF del usuario. Nada se envía sin que el usuario pulse «Imputar».
 */

const PARTITION = 'persist:redmine'
let win: BrowserWindow | null = null

const base = (): string => {
  const u = getDb().settings.redmineUrl.trim().replace(/\/+$/, '')
  if (!u) throw new Error('Falta la dirección de Redmine: ingrésala en Ajustes.')
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

function getWin(): BrowserWindow {
  if (win && !win.isDestroyed()) return win
  win = new BrowserWindow({
    width: 1100,
    height: 820,
    show: false, // solo se muestra para iniciar sesión o si algo falla
    title: 'Redmine · Nexu Workspace',
    autoHideMenuBar: true,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false }
  })
  win.on('closed', () => (win = null))
  return win
}

/** Largo máximo del comentario de una línea de Redmine (texto corto, para que todo el trabajo quepa). */
export const COMMENT_MAX = 240

/**
 * Resume las notas de una línea en un solo comentario corto: quita repetidas, recorta cada una para que quepan todas
 * y, si no caben, indica cuántas faltan («+N más»). No usa IA: es determinista y no gasta tokens.
 */
export function shortComment(notes: string[]): string {
  const clean = [...new Set(notes.map((n) => n.replace(/\s+/g, ' ').trim()).filter(Boolean))]
  if (!clean.length) return ''
  const full = clean.join(' · ')
  if (full.length <= COMMENT_MAX) return full
  const per = Math.max(20, Math.floor(COMMENT_MAX / clean.length) - 3)
  const cut = (s: string): string => (s.length <= per ? s : s.slice(0, per - 3).replace(/\s+\S*$/, '') + '...')
  const RESERVE = 14 // espacio para « · +N más»
  let out = ''
  let shown = 0
  for (const c of clean) {
    const part = cut(c)
    const next = out ? `${out} · ${part}` : part
    if (shown > 0 && next.length + RESERVE > COMMENT_MAX) break
    out = next
    shown++
  }
  const rest = clean.length - shown
  return rest > 0 ? `${out} · +${rest} más` : out
}

/** Horas del día agrupadas por proyecto + tarea de Redmine + actividad (solo registros terminados y aún no imputados). */
function buildLines(day: string): { lines: RedmineLine[]; notes: Map<string, string[]> } {
  const db = getDb()
  const from = new Date(`${day}T00:00:00`).getTime()
  const out = new Map<string, RedmineLine & { ms: number }>()
  const notes = new Map<string, string[]>()
  for (const e of db.entries) {
    if (e.end === null || e.rmSent || e.start < from || e.start >= from + 86400000) continue
    const t = db.tasks.find((x) => x.id === e.taskId)
    const project = (t?.rmProject ?? '').trim()
    const issue = (t?.rmIssue ?? '').trim()
    const activity = (t?.rmActivity ?? '').trim() || db.settings.redmineActivity
    // las tareas sin proyecto/tarea de Redmine salen una por una para poder avisar de qué falta
    const key = project && issue ? `${project}|${issue}|${activity}` : `sin-config|${e.taskId}`
    const l = out.get(key) ?? { key, project, issue, activity, hours: 0, comment: '', entryIds: [], ms: 0 }
    l.ms += e.end - e.start
    l.entryIds.push(e.id)
    const note = e.note.trim() || (t?.title ?? '')
    const list = notes.get(key) ?? []
    if (note) list.push(note)
    notes.set(key, list)
    out.set(key, l)
  }
  const drafts = db.rmDrafts?.[day] ?? {}
  const rows = [...out.values()].map(({ ms, ...l }) => {
    const auto ={ activity: l.activity, hours: Math.max(0.01, Math.round((ms / 3600000) * 100) / 100), comment: shortComment(notes.get(l.key) ?? []) }
    const draft = drafts[l.key]
    return {
      ...l,
      activity: draft?.activity || auto.activity,
      hours: draft?.hours ?? auto.hours,
      comment: draft?.comment ?? auto.comment,
      auto,
      draft,
      drafted: !!draft
    }
  })
  return { lines: rows, notes }
}

/** Horas del día agrupadas por proyecto + tarea de Redmine + actividad (solo registros terminados y aún no imputados). */
export function lines(day: string): RedmineLine[] {
  return buildLines(day).lines
}

/** Pide a Claude un comentario corto para una línea, a partir de las notas de todas sus tareas ese día. */
export async function aiComment(day: string, key: string): Promise<string> {
  const notes = buildLines(day).notes.get(key) ?? []
  if (!notes.length) throw new Error('Esta línea no tiene notas que resumir.')
  return summarizeNotes(notes, getDb().settings.claudeCmd)
}

/** Guarda (o quita, con null) lo que el usuario cambió a mano en una línea de la previsualización del día. */
export function saveDraft(day: string, key: string, draft: RedmineDraft | null): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !key) throw new Error('Línea no válida.')
  const db = getDb()
  db.rmDrafts ??= {}
  const byDay = (db.rmDrafts[day] ??= {})
  if (!draft) delete byDay[key]
  else {
    const h = draft.hours === undefined ? NaN : Number(draft.hours)
    byDay[key] = {
      ...(Number.isFinite(h) && h > 0 && h <= 24 ? { hours: r2(h) } : {}),
      ...(draft.activity?.trim() ? { activity: draft.activity.trim().slice(0, 120) } : {}),
      ...(draft.comment !== undefined ? { comment: draft.comment.trim().slice(0, 1000) } : {})
    }
  }
  if (!Object.keys(byDay).length) delete db.rmDrafts[day]
  commit()
}

export async function openLogin(): Promise<void> {
  const w = getWin()
  await w.loadURL(`${base()}/my/page`)
  w.show()
  w.focus()
}

/** Carga Redmine en la ventana y devuelve el id del usuario; null si hay que iniciar sesión (entonces se muestra la ventana). */
async function session(): Promise<{ w: BrowserWindow; userId: string } | null> {
  const w = getWin()
  await w.loadURL(`${base()}/my/page`)
  const host = JSON.stringify(new URL(base()).host)
  const userId = (await w.webContents.executeJavaScript(
    `(() => {
      if (location.host !== ${host} || /login|signin|auth/i.test(location.pathname) || document.querySelector('input[type=password]')) return ''
      const a = document.querySelector('a[href$="/profile"][href*="/users/"]')
      return a ? (a.getAttribute('href').match(/\\/users\\/(\\d+)/) || [])[1] || '' : ''
    })()`
  )) as string
  if (!userId) {
    w.show()
    w.focus()
    return null
  }
  return { w, userId }
}

type Gql = <T>(query: string, variables: Record<string, unknown>) => Promise<T>

/** Lanza una consulta GraphQL desde dentro de la página (cookies + token CSRF de la sesión). */
const gqlFor =
  (w: BrowserWindow): Gql =>
  async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
    const r = (await w.webContents.executeJavaScript(
      `fetch('/graphql.json', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': (document.querySelector('meta[name=csrf-token]') || {}).content || '' },
        body: JSON.stringify({ query: ${JSON.stringify(query)}, variables: ${JSON.stringify(variables)} })
      }).then(async (res) => ({ status: res.status, text: await res.text() }))`
    )) as { status: number; text: string }
    let json: { data?: T; errors?: Array<{ message: string }> }
    try {
      json = JSON.parse(r.text)
    } catch {
      // se muestra qué devolvió realmente Redmine (página de login, error 500, límite de peticiones…) en vez de un genérico
      const plain = r.text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
      const login = /login|sign.?in|password|contraseña/i.test(plain) || r.status === 401
      const waf = r.status === 403 && /gateway|firewall|forbidden/i.test(r.text)
      throw new Error(
        login
          ? 'La sesión de Redmine caducó. Pulsa «Iniciar sesión» en Redmine, entra de nuevo y vuelve a imputar.'
          : waf
            ? 'La red bloqueó la petición (firewall de Azure delante de Redmine, error 403). Suele pasar con ciertos textos del comentario; revisa el comentario de esta línea o pide a TI que revisen la regla.'
            : `Redmine respondió ${r.status} y no devolvió JSON: «${plain || 'respuesta vacía'}»`
      )
    }
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
    if (!json.data) throw new Error(`Redmine respondió ${r.status} sin datos`)
    return json.data
  }

const Q_PROJECTS = `query ($term: String, $collection: ProjectAutocompleteCollections!, $collectionArgs: ProjectAutocompleteCollectionArguments) {
  autocomplete(term: $term) { projects(collection: $collection, collectionArgs: $collectionArgs) { value: id label } }
}`
const Q_ISSUES = `query ($term: String, $collection: IssueAutocompleteCollections!, $collectionArgs: IssueAutocompleteCollectionArguments) {
  autocomplete(term: $term) { issues(collection: $collection, collectionArgs: $collectionArgs) { value: id label } }
}`
const Q_ENUMS = `{ p: __type(name: "ProjectAutocompleteCollections") { enumValues { name } } i: __type(name: "IssueAutocompleteCollections") { enumValues { name } } }`
// argumentos que acepta el autocompletado de tareas (para encontrar un filtro de «solo abiertas» si Redmine lo ofrece)
const Q_INPUT = `{ t: __type(name: "IssueAutocompleteCollectionArguments") { inputFields { name type { name kind ofType { name kind ofType { name } } } } } }`

type Opt = { value: string; label: string }

/** Lee de Redmine los proyectos y sus tareas (las colecciones que ofrece el autocompletado) y los guarda en Ajustes. */
export async function loadCatalog(): Promise<{ projects: number; issues: number; openFilter?: string; dump?: string; closed?: number }> {
  const s = await session()
  if (!s) throw new Error('Inicia sesión en la ventana de Redmine y vuelve a pulsar el botón.')
  // cada respuesta de Redmine se guarda tal cual, para revisar qué campos trae (se escribe al terminar la carga)
  const raw: Array<{ query: string; variables: unknown; data?: unknown; error?: string }> = []
  const base = gqlFor(s.w)
  const gql = (async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
    const name = query.trim().split('\n')[0].slice(0, 120)
    try {
      const data = await base<T>(query, variables)
      raw.push({ query: name, variables, data })
      return data
    } catch (e) {
      raw.push({ query: name, variables, error: (e as Error).message })
      throw e
    }
  }) as Gql
  const args = { userId: s.userId }

  // colecciones disponibles (si la introspección está bloqueada, se usa la que vimos en el modal)
  let pCols = ['projects_with_recent_time_entries']
  let iCols = ['issues_with_recent_time_entries']
  try {
    const e = await gql<{ p?: { enumValues: Array<{ name: string }> }; i?: { enumValues: Array<{ name: string }> } }>(Q_ENUMS, {})
    if (e.p?.enumValues.length) pCols = e.p.enumValues.map((v) => v.name)
    if (e.i?.enumValues.length) iCols = e.i.enumValues.map((v) => v.name)
  } catch {
    /* se mantienen las colecciones por defecto */
  }

  // filtro de «solo abiertas»: si el autocompletado de Redmine tiene un argumento booleano de abiertas, se pide con valor true
  let openFilter = ''
  let openArg: Record<string, boolean> = {}
  try {
    type Field = { name: string; type: { name: string | null; kind: string; ofType?: { name: string | null; kind?: string; ofType?: { name: string | null } | null } | null } }
    const t = await gql<{ t?: { inputFields: Field[] } }>(Q_INPUT, {})
    const isBool = (f: Field): boolean => f.type.name === 'Boolean' || f.type.ofType?.name === 'Boolean' || f.type.ofType?.ofType?.name === 'Boolean'
    const f = (t.t?.inputFields ?? []).find((x) => /open/i.test(x.name) && isBool(x))
    if (f) {
      openFilter = f.name
      openArg = { [f.name]: true }
    }
  } catch {
    /* sin introspección: se traen todas, como antes */
  }

  const projects = new Map<string, Opt>()
  for (const collection of pCols) {
    try {
      const r = await gql<{ autocomplete: { projects: Opt[] } }>(Q_PROJECTS, { term: '', collection, collectionArgs: args })
      for (const p of r.autocomplete.projects) projects.set(p.value, p)
    } catch {
      /* esa colección pide otros argumentos: se omite */
    }
  }
  if (!projects.size) throw new Error('Redmine no devolvió proyectos. Imputa una hora a mano en algún proyecto y repite.')

  // Validación del filtro de abiertas (mismo criterio que el filtro de proyectos, con datos reales): se piden las tareas de cada
  // proyecto con y sin el filtro. Se acepta solo si el filtrado nunca trae algo que no estaba, y reduce la lista en algún proyecto.
  if (openFilter && iCols.length) {
    const col = iCols[0]
    const fetchIssues = async (p: Opt, extra: Record<string, boolean>): Promise<Opt[] | undefined> => {
      try {
        const r = await gql<{ autocomplete: { issues: Opt[] } }>(Q_ISSUES, { term: '', collection: col, collectionArgs: { projectId: p.value, ...args, ...extra } })
        return r.autocomplete.issues
      } catch {
        return undefined
      }
    }
    let valid = true
    let reduces = false
    for (const p of projects.values()) {
      const all = await fetchIssues(p, {})
      const open = await fetchIssues(p, openArg)
      if (!all || !open) continue
      const allIds = new Set(all.map((i) => i.value))
      if (open.some((i) => !allIds.has(i.value))) {
        valid = false
        break
      }
      if (open.length < all.length) reduces = true
    }
    if (!valid || !reduces) {
      openFilter = ''
      openArg = {}
    }
  }

  // Algunas colecciones ignoran el proyecto y devuelven todas tus tareas en cada uno: se detectan (mismo resultado en todos los
  // proyectos) y se descartan, para que cada proyecto solo tenga las suyas.
  const byCol = new Map<string, Map<string, Opt[]>>()
  for (const collection of iCols) {
    const perProject = new Map<string, Opt[]>()
    for (const p of projects.values()) {
      try {
        const r = await gql<{ autocomplete: { issues: Opt[] } }>(Q_ISSUES, { term: '', collection, collectionArgs: { projectId: p.value, ...args, ...openArg } })
        perProject.set(p.value, r.autocomplete.issues)
      } catch {
        /* colección no aplicable */
      }
    }
    byCol.set(collection, perProject)
  }
  const sig = (l: Opt[]): string => l.map((i) => i.value).sort().join(',')
  const ignoresProject = (m: Map<string, Opt[]>): boolean => {
    const sigs = new Set([...m.values()].filter((l) => l.length).map(sig))
    return m.size > 1 && sigs.size === 1
  }
  const usable = [...byCol.entries()].filter(([, m]) => projects.size < 2 || !ignoresProject(m))

  const catalog: RedmineCatalog = {}
  let issues = 0
  for (const p of projects.values()) {
    const found = new Map<string, Opt>()
    for (const [, m] of usable) for (const i of m.get(p.value) ?? []) found.set(i.value, i)
    catalog[p.label] = { id: p.value, issues: [...found.values()].map((i) => ({ id: i.value, label: i.label })) }
    issues += found.size
  }
  // Quitar las tareas cerradas: Redmine informa el estado con status.isClosed (confirmado en el volcado). Se piden en lotes;
  // si un lote falla, se piden una por una, y una tarea que no se puede consultar se queda (no se quita por error).
  const closedIds = async (all: string[]): Promise<Set<string>> => {
    const out = new Set<string>()
    const ask = async (group: string[]): Promise<void> => {
      const q = `# estado de tareas\nquery { ${group.map((id, j) => `i${j}: issue(id: "${id}") { id status { isClosed } }`).join(' ')} }`
      const r = await gql<Record<string, { id: string; status?: { isClosed?: boolean } } | null>>(q, {})
      for (const v of Object.values(r)) if (v?.status?.isClosed) out.add(v.id)
    }
    const numeric = all.filter((id) => /^\d+$/.test(id))
    for (let k = 0; k < numeric.length; k += 40) {
      const group = numeric.slice(k, k + 40)
      try {
        await ask(group)
      } catch {
        for (const id of group) {
          try {
            await ask([id])
          } catch {
            /* sin estado: se queda */
          }
        }
      }
    }
    return out
  }
  const closed = await closedIds([...new Set(Object.values(catalog).flatMap((p) => p.issues.map((i) => i.id)))])
  let removed = 0
  for (const p of Object.values(catalog)) {
    const before = p.issues.length
    p.issues = p.issues.filter((i) => !closed.has(i.id))
    removed += before - p.issues.length
  }
  issues -= removed
  getDb().settings.redmineCatalog = catalog
  commit()

  const dir = path.join(app.getPath('userData'), 'redmine-debug')
  fs.mkdirSync(dir, { recursive: true })
  const dump = path.join(dir, 'catalogo-ultimo.json')
  fs.writeFileSync(
    dump,
    JSON.stringify({ cuando: new Date().toISOString(), filtroAbiertas: openFilter || null, proyectos: [...projects.values()], colecciones: { proyectos: pCols, tareas: iCols }, respuestas: raw }, null, 2),
    'utf8'
  )
  return { projects: projects.size, issues, openFilter, dump, closed: removed }
}

/** Horas imputadas en Redmine y horas laborables de cada día entre dos fechas (YYYY-MM-DD, ambas incluidas). */
export async function days(from: string, to: string): Promise<RedmineDay[]> {
  const s = await session()
  if (!s) throw new Error('Inicia sesión en la ventana de Redmine y vuelve a pulsar «Actualizar».')
  const list: string[] = []
  for (let d = new Date(`${from}T00:00:00`); dayKey(d) <= to && list.length < 62; d.setDate(d.getDate() + 1)) list.push(dayKey(d))
  // una sola petición con un alias por día (las fechas son YYYY-MM-DD generadas aquí, no texto del usuario)
  const body = list.map((d, i) => `d${i}: user(id: $u) { max: maxWorkingHoursForDate(date: "${d}") spent: sumSpentTimeForDate(date: "${d}") }`).join('\n')
  const r = await gqlFor(s.w)<Record<string, { max: number | string | null; spent: number | string | null }>>(`query ($u: ID!) {\n${body}\n}`, { u: s.userId })
  return list.map((day, i) => ({ day, spent: Number(r[`d${i}`]?.spent) || 0, max: Number(r[`d${i}`]?.max) || 0 }))
}

const M_CREATE =`mutation ($attributes: TimeEntryAttributes!) {
  createTimeEntry(attributes: $attributes) { errors { attribute messages } }
}`
const Q_ACTIVITIES = `query ($projectId: ID!, $userId: ID) { project(id: $projectId) { activitiesPerRole(userId: $userId) { id name } } }`
const Q_FIELDS = `query ($projectId: ID, $activityId: ID) { availableCustomFieldsForTimeEntry(projectId: $projectId, activityId: $activityId) { id name isRequired } }`

const r2 = (n: number): number => Math.round(n * 100) / 100
const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Imputa en Redmine las líneas indicadas (sus `key`) del día. Marca como enviados los registros de las que salgan bien. */
/** `hours` permite cambiar las horas de una línea (por su key) antes de enviarla. */
export async function send(day: string, keys: string[], hours: Record<string, number> = {}, activities: Record<string, string> = {}): Promise<RedmineResult> {
  const todo = lines(day)
    .filter((l) => keys.includes(l.key) && l.project && l.issue)
    .map((l) => {
      const h = Number(hours[l.key])
      const activity = (activities[l.key] ?? '').trim() || l.activity
      return Number.isFinite(h) && h > 0 && h <= 24 ? { ...l, activity, hours: r2(h) } : { ...l, activity }
    })
  const result: RedmineResult = { sent: 0, failed: [] }
  if (!todo.length) return result
  const s = await session()
  if (!s) return { ...result, needLogin: true }
  const gql = gqlFor(s.w)
  const catalog = getDb().settings.redmineCatalog ?? {}

  // tope diario (Ajustes → horas objetivo): lo ya imputado ese día en Redmine cuenta, y lo que sobre no se envía
  const cap = getDb().settings.targetHours || 8
  const q = await gql<{ user: { spent: number | string | null } }>(`query ($u: ID!) { user(id: $u) { spent: sumSpentTimeForDate(date: "${day}") } }`, { u: s.userId })
  let remaining = cap - (Number(q.user.spent) || 0)
  result.notes = []

  for (const l of todo) {
    try {
      if (remaining <= 0.001) throw new Error(`Ya tienes ${cap} h imputadas el ${day} (tope diario). Estas horas quedan pendientes.`)
      const trimmed = l.hours > remaining + 0.001
      if (trimmed) result.notes.push(`${l.issue}: se imputaron ${r2(remaining)} h de ${l.hours} h por el tope de ${cap} h`)
      const hours = Math.min(l.hours, remaining)
      const project = catalog[l.project]
      if (!project) throw new Error(`El proyecto «${l.project}» no está en la lista cargada de Redmine (usa «Cargar proyectos y tareas»).`)
      const issueId = project.issues.find((i) => i.label === l.issue)?.id ?? (l.issue.match(/#?(\d{3,})/) ?? [])[1]
      if (!issueId) throw new Error(`No sé el número de la tarea «${l.issue}».`)

      const acts = (await gql<{ project: { activitiesPerRole: Array<{ id: string; name: string }> } }>(Q_ACTIVITIES, { projectId: project.id, userId: s.userId })).project.activitiesPerRole
      const act = acts.find((a) => norm(a.name) === norm(l.activity)) ?? acts.find((a) => norm(a.name).includes(norm(l.activity)))
      if (!act) throw new Error(`La actividad «${l.activity}» no existe en este proyecto. Hay: ${acts.map((a) => a.name).join(', ')}`)

      // «Billable time» siempre en «no» (0); se busca por nombre porque el id del campo puede cambiar según proyecto/actividad
      const fields = (await gql<{ availableCustomFieldsForTimeEntry: Array<{ id: string; name: string }> }>(Q_FIELDS, { projectId: project.id, activityId: act.id })).availableCustomFieldsForTimeEntry
      const billable = fields.find((f) => /billable/i.test(f.name))

      const r = await gql<{ createTimeEntry: { errors: Array<{ attribute: string; messages: string[] }> | null } }>(M_CREATE, {
        attributes: {
          activityId: act.id,
          comments: l.comment,
          easyTimeFrom: null,
          easyTimeTo: null,
          hours: String(r2(hours)),
          issueId,
          projectId: project.id,
          spentOn: day,
          userId: s.userId,
          customFields: [{ id: billable?.id ?? '82', value: '0' }]
        }
      })
      const errs = r.createTimeEntry.errors ?? []
      if (errs.length) {
        // Redmine solo admite horas en tareas abiertas: el mensaje técnico se traduce a algo accionable
        const closed = errs.some((e) => e.attribute === 'issue_id' && /invalid|open task/i.test(e.messages.join(' ')))
        throw new Error(
          closed
            ? `La tarea #${issueId} de Redmine no admite horas (probablemente está cerrada). Reábrela en Redmine o cambia la tarea de Redmine de esta tarea en Shutoki.`
            : errs.map((e) => `${e.attribute}: ${e.messages.join(', ')}`).join(' · ')
        )
      }

      const db = getDb()
      for (const id of l.entryIds) {
        const e = db.entries.find((x) => x.id === id)
        if (e) e.rmSent = Date.now()
      }
      if (db.rmDrafts?.[day]) delete db.rmDrafts[day][l.key] // ya imputada: su borrador ya no hace falta
      commit()
      remaining -= hours
      result.sent++
    } catch (e) {
      result.failed.push({ key: l.key, error: (e as Error).message })
    }
  }
  return result
}
