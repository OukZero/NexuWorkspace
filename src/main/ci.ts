// Integración continua: estado de los checks y del PR de la rama de cada tarea (GitHub).
// Consulta la API con el mismo token que forge.ts, guarda el último estado en memoria y avisa cuando algo cambia.
import type { CiCheck, CiPr, CiStatus, RemoteInfo, Task } from '../shared/types'
import { clip } from '../shared/util'
import { commit, getDb } from './db'
import { ghApi, remoteInfo } from './forge'
import { notify } from './notify'
import { activeEntry, stopActive } from './timer'

const cache = new Map<string, CiStatus>()
const nextAt = new Map<string, number>()
let polling = false

interface GhCheckRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  html_url?: string
}
interface GhCombined {
  statuses: Array<{ context: string; state: string; target_url?: string | null }>
}
interface GhPrRow {
  number: number
  html_url: string
  state: string
  merged_at?: string | null
  draft?: boolean
  mergeable_state?: string
  comments?: number
  review_comments?: number
}

function runState(r: GhCheckRun): CiCheck['state'] {
  if (r.status !== 'completed') return 'pending'
  if (r.conclusion === 'success') return 'success'
  if (r.conclusion === 'neutral' || r.conclusion === 'skipped') return 'skipped'
  return 'failure'
}

function overall(checks: CiCheck[]): CiStatus['state'] {
  if (checks.some((c) => c.state === 'failure')) return 'failure'
  if (checks.some((c) => c.state === 'pending')) return 'pending'
  if (checks.some((c) => c.state === 'success')) return 'success'
  return 'none'
}

const enc = (b: string): string => b.split('/').map(encodeURIComponent).join('/')

async function fetchPr(info: RemoteInfo, branch: string): Promise<CiPr | undefined> {
  const { repo } = info
  const owner = info.owner
  const list = await ghApi<GhPrRow[]>(info, `/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(owner.split('/')[0] + ':' + branch)}&state=all&per_page=1&sort=updated&direction=desc`)
  const row = list[0]
  if (!row) return undefined
  const detail = await ghApi<GhPrRow>(info, `/repos/${owner}/${repo}/pulls/${row.number}`)
  const state: CiPr['state'] = detail.merged_at ? 'merged' : detail.state === 'open' ? 'open' : 'closed'
  let review: CiPr['review'] = 'pending'
  if (state === 'open') {
    const reviews = await ghApi<Array<{ state: string; user?: { login?: string } }>>(info, `/repos/${owner}/${repo}/pulls/${row.number}/reviews?per_page=100`).catch(() => [])
    const last = new Map<string, string>()
    for (const r of reviews) if (r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED' || r.state === 'DISMISSED') last.set(r.user?.login ?? '?', r.state)
    const states = [...last.values()]
    if (states.includes('CHANGES_REQUESTED')) review = 'changes'
    else if (states.includes('APPROVED')) review = 'approved'
  }
  return {
    number: detail.number,
    url: detail.html_url,
    state,
    draft: !!detail.draft,
    review,
    comments: (detail.comments ?? 0) + (detail.review_comments ?? 0),
    conflicts: detail.mergeable_state === 'dirty'
  }
}

/** Consulta el estado de CI y PR de la rama de la tarea. Devuelve null si la tarea no tiene rama o el remoto no es GitHub. */
async function query(task: Task): Promise<CiStatus | null> {
  if (!task.branch || !task.branchDir) return null
  const info = await remoteInfo(task.branchDir)
  if (!info || info.kind !== 'github') return null
  const base = { taskId: task.id, branch: task.branch, ts: Date.now() }
  const repoPath = `/repos/${info.owner}/${info.repo}`
  try {
    const [runs, combined] = await Promise.all([
      ghApi<{ check_runs: GhCheckRun[] }>(info, `${repoPath}/commits/${enc(task.branch)}/check-runs?per_page=100`).catch((e: Error) => {
        if (/no encontró/.test(e.message)) return { check_runs: [] as GhCheckRun[] } // la rama aún no está publicada
        throw e
      }),
      ghApi<GhCombined>(info, `${repoPath}/commits/${enc(task.branch)}/status`).catch(() => ({ statuses: [] }) as GhCombined)
    ])
    const checks: CiCheck[] = [
      ...runs.check_runs.map((r): CiCheck => ({ id: r.id, name: r.name, state: runState(r), url: r.html_url })),
      ...combined.statuses.map((s): CiCheck => ({ name: s.context, state: s.state === 'success' ? 'success' : s.state === 'pending' ? 'pending' : 'failure', url: s.target_url ?? undefined }))
    ]
    const pr = await fetchPr(info, task.branch).catch(() => undefined)
    return { ...base, state: overall(checks), checks, pr }
  } catch (e) {
    return { ...base, state: 'none', checks: [], error: (e as Error).message }
  }
}

function announce(task: Task, prev: CiStatus | undefined, cur: CiStatus): void {
  if (!prev || prev.error || cur.error) return // la primera lectura no avisa
  const name = clip(task.title, 60)
  if ((prev.state === 'pending' && cur.state !== 'pending') || (prev.state === 'success' && cur.state === 'failure')) {
    if (cur.state === 'failure') {
      const bad = cur.checks.filter((c) => c.state === 'failure').map((c) => c.name)
      notify({ kind: 'ci', title: `CI falló · ${name}`, body: `${clip(bad.join(', '), 160) || 'Un check falló'} en la rama ${task.branch}.`, goto: 'today', flash: true })
    } else if (cur.state === 'success') {
      notify({ kind: 'ci', title: `CI pasó · ${name}`, body: `Todos los checks de ${task.branch} están en verde.`, goto: 'today' })
    }
  }
  if (cur.pr && prev.pr && cur.pr.number === prev.pr.number) {
    if (prev.pr.state === 'open' && cur.pr.state === 'merged') notify({ kind: 'ci', title: `PR fusionado · ${name}`, body: `El PR #${cur.pr.number} se fusionó en la rama base.`, goto: 'today' })
    else if (prev.pr.state === 'open' && cur.pr.state === 'closed') notify({ kind: 'ci', title: `PR cerrado · ${name}`, body: `El PR #${cur.pr.number} se cerró sin fusionar.`, goto: 'today' })
    if (prev.pr.review !== cur.pr.review && cur.pr.review === 'approved') notify({ kind: 'ci', title: `PR aprobado · ${name}`, body: `El PR #${cur.pr.number} fue aprobado.`, goto: 'today' })
    if (prev.pr.review !== cur.pr.review && cur.pr.review === 'changes') notify({ kind: 'ci', title: `Piden cambios · ${name}`, body: `Quien revisa pidió cambios en el PR #${cur.pr.number}.`, goto: 'today', flash: true })
    if (cur.pr.comments > prev.pr.comments && cur.pr.state === 'open') notify({ kind: 'ci', title: `Comentarios nuevos · ${name}`, body: `El PR #${cur.pr.number} tiene ${cur.pr.comments - prev.pr.comments} comentario(s) nuevo(s).`, goto: 'today' })
    if (!prev.pr.conflicts && cur.pr.conflicts) notify({ kind: 'ci', title: `Conflictos en el PR · ${name}`, body: `El PR #${cur.pr.number} ya no se puede fusionar sin resolver conflictos.`, goto: 'today' })
  }
}

/**
 * Mueve la tarea según el PR de su rama: abierto (y listo para revisar) → «En revisión»; fusionado → «Hecha»; cerrado sin fusionar → «En curso».
 * Solo actúa una vez por PR y únicamente sobre tareas en el estado esperado, para respetar lo que muevas a mano.
 */
function syncStatus(task: Task, cur: CiStatus): void {
  const db = getDb()
  const pr = cur.pr
  if (db.settings.prAutoReview === false || cur.error || !pr) return
  const name = clip(task.title, 60)
  if (pr.state === 'open' && !pr.draft && task.reviewPr !== pr.number && (task.status === 'next' || task.status === 'today' || task.status === 'doing')) {
    task.status = 'review'
    task.reviewPr = pr.number
    commit()
    notify({ kind: 'ci', title: `En revisión · ${name}`, body: `El PR #${pr.number} está abierto: la tarea pasó a «En revisión».`, goto: 'today' })
  } else if (pr.state === 'merged' && task.status === 'review') {
    task.status = 'done'
    task.doneAt = Date.now()
    if (activeEntry()?.taskId === task.id) stopActive()
    if (db.paused === task.id) db.paused = null
    commit()
    notify({ kind: 'ci', title: `Hecha · ${name}`, body: `El PR #${pr.number} se fusionó: la tarea quedó como hecha.`, goto: 'today' })
  } else if (pr.state === 'closed' && task.status === 'review') {
    task.status = 'doing'
    commit()
    notify({ kind: 'ci', title: `PR cerrado · ${name}`, body: `El PR #${pr.number} se cerró sin fusionar: la tarea volvió a «En curso».`, goto: 'today' })
  }
}

async function refreshTask(task: Task): Promise<CiStatus | null> {
  const cur = await query(task)
  if (!cur) {
    cache.delete(task.id)
    return null
  }
  const prev = cache.get(task.id)
  // un error de red no borra el último estado bueno: se conserva y se marca
  if (cur.error && prev && !prev.error) cache.set(task.id, { ...prev, error: cur.error })
  else cache.set(task.id, cur)
  announce(task, prev, cur)
  syncStatus(task, cur)
  // mientras algo corre se consulta seguido; en reposo, cada 5 min
  nextAt.set(task.id, Date.now() + (cur.state === 'pending' || cur.pr?.state === 'open' ? 60_000 : 300_000))
  return cache.get(task.id) ?? null
}

/** Revisa las tareas con rama que ya les toca. Se llama cada ~30 s; nunca lanza. */
export async function pollCi(): Promise<void> {
  if (polling) return
  polling = true
  try {
    const live = getDb().tasks.filter((t) => t.branch && t.branchDir && !t.archived && (t.status !== 'done' || (t.pr && Date.now() - (t.doneAt ?? 0) < 7 * 86400000)))
    for (const id of [...cache.keys()]) if (!live.some((t) => t.id === id)) cache.delete(id)
    for (const t of live.slice(0, 12)) {
      if ((nextAt.get(t.id) ?? 0) > Date.now()) continue
      await refreshTask(t).catch(() => undefined)
    }
  } finally {
    polling = false
  }
}

export const allCi = (): Record<string, CiStatus> => Object.fromEntries(cache)

export async function refreshCi(taskId: string): Promise<CiStatus | null> {
  const t = getDb().tasks.find((x) => x.id === taskId)
  return t ? refreshTask(t) : null
}

/** Texto con los checks fallidos (nombre, resumen y anotaciones) para pegarlo a la IA. '' si todo está bien. */
export async function failureText(taskId: string): Promise<string> {
  const task = getDb().tasks.find((x) => x.id === taskId)
  if (!task) return ''
  let st: CiStatus | null | undefined = cache.get(taskId)
  if (!st || Date.now() - st.ts > 30_000) st = await refreshTask(task)
  if (!st) return ''
  const bad = st.checks.filter((c) => c.state === 'failure')
  if (!bad.length && !st.pr?.conflicts) return ''
  const info = task.branchDir ? await remoteInfo(task.branchDir) : null
  const parts: string[] = [`Rama ${st.branch}${st.pr ? ` · PR #${st.pr.number} (${st.pr.state})` : ''}`]
  if (st.pr?.conflicts) parts.push('El PR tiene conflictos con la rama base.')
  for (const c of bad.slice(0, 6)) {
    const lines = [`### ${c.name} — falló${c.url ? ` (${c.url})` : ''}`]
    if (c.id && info) {
      const run = await ghApi<{ output?: { title?: string | null; summary?: string | null; text?: string | null } }>(info, `/repos/${info.owner}/${info.repo}/check-runs/${c.id}`).catch(() => null)
      const o = run?.output
      if (o?.title) lines.push(o.title)
      if (o?.summary) lines.push(clip(o.summary, 1500))
      if (o?.text) lines.push(clip(o.text, 2500))
      const ann = await ghApi<Array<{ path: string; start_line: number; annotation_level: string; message: string }>>(info, `/repos/${info.owner}/${info.repo}/check-runs/${c.id}/annotations?per_page=30`).catch(() => [])
      for (const a of ann) lines.push(`- ${a.path}:${a.start_line} [${a.annotation_level}] ${clip(a.message, 300)}`)
    }
    parts.push(lines.join('\n'))
  }
  return parts.join('\n\n')
}
