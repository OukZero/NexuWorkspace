import { BrowserWindow } from 'electron'
import { dayKey } from '../shared/util'
import type { RedmineCatalog, RedmineDay, RedmineLine, RedmineResult } from '../shared/types'
import { commit, getDb } from './db'

/**
 * Imputación de horas en Easy Redmine sin API pública: el propio modal «Log time» habla con /graphql.json usando la sesión web.
 * Una ventana propia (con sesión guardada, así el login/SSO se hace una vez) lanza esas mismas consultas desde dentro de la página,
 * con las cookies y el token CSRF del usuario. Nada se envía sin que el usuario pulse «Imputar».
 */

const PARTITION = 'persist:redmine'
let win: BrowserWindow | null = null

const base = (): string => getDb().settings.redmineUrl.trim().replace(/\/+$/, '')

function getWin(): BrowserWindow {
  if (win && !win.isDestroyed()) return win
  win = new BrowserWindow({
    width: 1100,
    height: 820,
    show: false, // solo se muestra para iniciar sesión o si algo falla
    title: 'Redmine · Shutoki',
    autoHideMenuBar: true,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false }
  })
  win.on('closed', () => (win = null))
  return win
}

/** Horas del día agrupadas por proyecto + tarea de Redmine + actividad (solo registros terminados y aún no imputados). */
export function lines(day: string): RedmineLine[] {
  const db = getDb()
  const from = new Date(`${day}T00:00:00`).getTime()
  const out = new Map<string, RedmineLine & { ms: number }>()
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
    if (note && !l.comment.split('; ').includes(note)) l.comment = l.comment ? `${l.comment}; ${note}` : note
    out.set(key, l)
  }
  return [...out.values()].map(({ ms, ...l }) => ({ ...l, hours: Math.max(0.01, Math.round((ms / 3600000) * 100) / 100) }))
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
      throw new Error(`Redmine respondió ${r.status} (no es JSON; ¿sesión caducada?)`)
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

type Opt = { value: string; label: string }

/** Lee de Redmine los proyectos y sus tareas (las colecciones que ofrece el autocompletado) y los guarda en Ajustes. */
export async function loadCatalog(): Promise<{ projects: number; issues: number }> {
  const s = await session()
  if (!s) throw new Error('Inicia sesión en la ventana de Redmine y vuelve a pulsar el botón.')
  const gql = gqlFor(s.w)
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

  // Algunas colecciones ignoran el proyecto y devuelven todas tus tareas en cada uno: se detectan (mismo resultado en todos los
  // proyectos) y se descartan, para que cada proyecto solo tenga las suyas.
  const byCol = new Map<string, Map<string, Opt[]>>()
  for (const collection of iCols) {
    const perProject = new Map<string, Opt[]>()
    for (const p of projects.values()) {
      try {
        const r = await gql<{ autocomplete: { issues: Opt[] } }>(Q_ISSUES, { term: '', collection, collectionArgs: { projectId: p.value, ...args } })
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
  getDb().settings.redmineCatalog = catalog
  commit()
  return { projects: projects.size, issues }
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
export async function send(day: string, keys: string[]): Promise<RedmineResult> {
  const todo = lines(day).filter((l) => keys.includes(l.key) && l.project && l.issue)
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
      if (errs.length) throw new Error(errs.map((e) => `${e.attribute}: ${e.messages.join(', ')}`).join(' · '))

      const db = getDb()
      for (const id of l.entryIds) {
        const e = db.entries.find((x) => x.id === id)
        if (e) e.rmSent = Date.now()
      }
      commit()
      remaining -= hours
      result.sent++
    } catch (e) {
      result.failed.push({ key: l.key, error: (e as Error).message })
    }
  }
  return result
}
