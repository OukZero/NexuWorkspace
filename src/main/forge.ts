// Remoto del repositorio (GitHub, GitLab, Azure DevOps): enlaces de PR, issues y ramas de issue.
// No usa el CLI `gh`: habla con la API de GitHub con el token de Ajustes o el del Administrador de credenciales de Git.
import { execFile } from 'child_process'
import type { IssueRef, PrLink, PushResult, RemoteInfo, Task } from '../shared/types'
import { clip } from '../shared/util'
import { commit, getDb } from './db'
import * as g from './git'
import { askClaude } from './summary'

/** Interpreta la URL del remoto (https, ssh, scp-like y las variantes de Azure DevOps). */
export function parseRemote(url: string): Omit<RemoteInfo, 'base'> | null {
  const raw = url.trim()
  if (!raw || /^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\')) return null // ruta local de Windows, no un remoto
  let host = ''
  let p = ''
  let m = /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i.exec(raw)
  if (m) {
    host = m[1]
    p = m[2]
  } else if ((m = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(raw))) {
    host = m[1]
    p = m[2]
  } else return null
  p = p.replace(/\.git$/i, '').replace(/\/+$/, '')
  const low = host.toLowerCase()

  // Azure DevOps: https://dev.azure.com/org/proyecto/_git/repo · git@ssh.dev.azure.com:v3/org/proyecto/repo
  if (low.endsWith('dev.azure.com') || low.endsWith('visualstudio.com')) {
    const parts = p.split('/').filter(Boolean)
    let org = ''
    let project = ''
    let repo = ''
    if (parts[0] === 'v3') [, org, project, repo] = parts
    else if (parts.includes('_git')) {
      const i = parts.indexOf('_git')
      repo = parts[i + 1]
      project = parts[i - 1]
      org = low.endsWith('visualstudio.com') ? low.split('.')[0] : parts[0]
    }
    if (!org || !project || !repo) return null
    const web = `https://dev.azure.com/${org}/${project}/_git/${repo}`
    return { url: raw, kind: 'azure', host: 'dev.azure.com', owner: `${org}/${project}`, repo, web }
  }

  const parts = p.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const repo = parts[parts.length - 1]
  const owner = parts.slice(0, -1).join('/')
  const kind: RemoteInfo['kind'] = low.includes('github') ? 'github' : low.includes('gitlab') ? 'gitlab' : 'other'
  return { url: raw, kind, host, owner, repo, web: `https://${host}/${owner}/${repo}` }
}

export async function remoteInfo(dir: string): Promise<RemoteInfo | null> {
  const parsed = parseRemote(await g.remoteUrl(dir)) ?? parseRemote(await g.remoteUrl(dir, true))
  if (!parsed) return null
  return { ...parsed, base: await g.baseBranch(dir) }
}

const enc = (b: string): string => b.split('/').map(encodeURIComponent).join('/')

/** Enlace para crear el PR de `branch` contra `base`, con título y cuerpo precargados cuando la plataforma lo permite. */
export function newPrUrl(info: RemoteInfo, branch: string, title?: string, body?: string): string | null {
  const q = (o: Record<string, string | undefined>): string =>
    Object.entries(o)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
      .join('&')
  let url: string | null = null
  if (info.kind === 'github') {
    url = `${info.web}/compare/${enc(info.base)}...${enc(branch)}?${q({ expand: '1', title, body })}`
    if (url.length > 7000) url = `${info.web}/compare/${enc(info.base)}...${enc(branch)}?${q({ expand: '1', title })}` // GitHub rechaza URL demasiado largas
  } else if (info.kind === 'gitlab') {
    url = `${info.web}/-/merge_requests/new?merge_request[source_branch]=${encodeURIComponent(branch)}&merge_request[target_branch]=${encodeURIComponent(info.base)}${title ? `&merge_request[title]=${encodeURIComponent(title)}` : ''}`
  } else if (info.kind === 'azure') {
    url = `${info.web}/pullrequestcreate?sourceRef=${encodeURIComponent(branch)}&targetRef=${encodeURIComponent(info.base)}`
  }
  return url
}

// ---------- GitHub API ----------

let credCache: { host: string; token: string; at: number } | null = null

/** Token guardado por Git para el host (lo que usa `git push`); '' si no hay. */
function credentialToken(host: string): Promise<string> {
  if (credCache && credCache.host === host && Date.now() - credCache.at < 10 * 60_000) return Promise.resolve(credCache.token)
  return new Promise((resolve) => {
    const child = execFile('git', ['credential', 'fill'], { timeout: 20000, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, out) => {
      const token = err ? '' : (/^password=(.*)$/m.exec(out)?.[1] ?? '').trim()
      if (token) credCache = { host, token, at: Date.now() }
      resolve(token)
    })
    child.stdin?.end(`protocol=https\nhost=${host}\n\n`)
  })
}

async function tokenFor(info: RemoteInfo): Promise<string> {
  const own = getDb().settings.githubToken?.trim()
  if (own) return own
  return credentialToken(info.host)
}

const NO_TOKEN = 'No se encontró un token de GitHub. Inicia sesión en Git (se guarda en el Administrador de credenciales al hacer push) o pega un token en Ajustes → Integraciones.'

async function ghApi<T>(info: RemoteInfo, apiPath: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (info.kind !== 'github') throw new Error('Las issues solo están disponibles para repositorios de GitHub.')
  const token = await tokenFor(info)
  if (!token) throw new Error(NO_TOKEN)
  const api = info.host === 'github.com' ? 'https://api.github.com' : `https://${info.host}/api/v3`
  const res = await fetch(`${api}${apiPath}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Shutoki-AI-Workspace', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20000)
  })
  if (res.status === 401 || res.status === 403) {
    credCache = null
    throw new Error(`GitHub rechazó el token (${res.status}). Debe tener acceso al repositorio (permiso «repo» o Issues y Pull requests).`)
  }
  if (res.status === 404) throw new Error('GitHub no encontró el repositorio o la issue (¿el token tiene acceso a ese repositorio?).')
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}: ${clip(await res.text(), 200)}`)
  return (await res.json()) as T
}

interface GhIssue {
  number: number
  title: string
  html_url: string
  state: 'open' | 'closed'
  labels: Array<string | { name?: string }>
  pull_request?: unknown
  body?: string | null
}

const toRef = (i: GhIssue): IssueRef => ({
  number: i.number,
  title: i.title,
  url: i.html_url,
  state: i.state,
  labels: i.labels.map((l) => (typeof l === 'string' ? l : (l.name ?? ''))).filter(Boolean)
})

async function need(dir: string): Promise<RemoteInfo> {
  const info = await remoteInfo(dir)
  if (!info) throw new Error('Este repositorio no tiene remoto «origin». Publica el repositorio primero.')
  return info
}

export async function listIssues(dir: string): Promise<IssueRef[]> {
  const info = await need(dir)
  const rows = await ghApi<GhIssue[]>(info, `/repos/${info.owner}/${info.repo}/issues?state=open&per_page=50&sort=updated`)
  return rows.filter((i) => !i.pull_request).map(toRef)
}

export async function createIssue(dir: string, title: string, body: string, labels?: string[]): Promise<IssueRef> {
  const t = title.trim()
  if (!t) throw new Error('Escribe un título para la issue.')
  const info = await need(dir)
  const row = await ghApi<GhIssue>(info, `/repos/${info.owner}/${info.repo}/issues`, { method: 'POST', body: { title: t, body, ...(labels?.length ? { labels } : {}) } })
  return toRef(row)
}

async function getIssue(dir: string, n: number): Promise<IssueRef> {
  const info = await need(dir)
  return toRef(await ghApi<GhIssue>(info, `/repos/${info.owner}/${info.repo}/issues/${n}`))
}

/** Nombre de rama a partir de una issue: «fix/123-titulo-corto» o «feat/123-…» según sus etiquetas. */
export function branchNameFor(issue: IssueRef): string {
  const labels = (issue.labels ?? []).join(' ').toLowerCase()
  const type = /bug|fix|error|defect/.test(labels) ? 'fix' : /doc/.test(labels) ? 'docs' : /refactor|chore|tech/.test(labels) ? 'chore' : 'feat'
  return `${type}/${issue.number}-${slug(issue.title)}`
}

export function slug(s: string, max = 40): string {
  const out = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
  return out || 'cambio'
}

const taskOf = (id: string): Task => {
  const t = getDb().tasks.find((x) => x.id === id)
  if (!t) throw new Error('Tarea no encontrada')
  return t
}

/** Crea la rama de una issue desde la base actualizada, la deja activa y la vincula a la tarea. */
export async function branchFromIssue(taskId: string, dir: string, number: number): Promise<{ branch: string; issue: IssueRef }> {
  const task = taskOf(taskId)
  const issue = await getIssue(dir, number)
  const branch = branchNameFor(issue)
  await g.createBranch(dir, branch, await g.baseBranch(dir))
  task.issue = issue
  task.branch = branch
  task.branchDir = dir
  commit()
  return { branch, issue }
}

/** Rama de la tarea sin issue (el nombre lo elige quien llama); parte de la base actualizada. */
export async function branchForTask(taskId: string, dir: string, name: string): Promise<string> {
  const task = taskOf(taskId)
  const branch = name.trim()
  await g.createBranch(dir, branch, await g.baseBranch(dir))
  task.branch = branch
  task.branchDir = dir
  commit()
  return branch
}

export function linkIssue(taskId: string, issue: IssueRef | null): void {
  const task = taskOf(taskId)
  if (issue) task.issue = issue
  else delete task.issue
  commit()
}

interface GhPr {
  number: number
  title: string
  html_url: string
}

/** PR abierto de esta rama, si ya existe. Cualquier fallo (sin token, sin red) cuenta como «no se sabe»: se ofrece el enlace para crearlo. */
async function findPr(info: RemoteInfo, branch: string): Promise<GhPr | null> {
  if (info.kind !== 'github') return null
  try {
    const rows = await ghApi<GhPr[]>(info, `/repos/${info.owner}/${info.repo}/pulls?head=${encodeURIComponent(info.owner.split('/')[0] + ':' + branch)}&state=open&per_page=1`)
    return rows[0] ?? null
  } catch {
    return null
  }
}

/** Texto precargado del PR a partir de la tarea e issue (corto: va dentro de una URL). */
function prefill(task: Task | undefined, branch: string): { title: string; body: string } {
  const issue = task?.issue
  const title = issue ? issue.title : task?.title || branch
  const parts: string[] = []
  if (task?.description.trim()) parts.push(clip(task.description.trim(), 600))
  if (issue) parts.push(`Closes #${issue.number}`)
  return { title: clip(title, 120), body: parts.join('\n\n') }
}

/** Publica la rama y entrega el enlace al PR (el existente o el de creación), que queda guardado en la tarea. */
export async function pushWithPr(dir: string, taskId?: string): Promise<PushResult> {
  const message = await g.sync(dir, 'push')
  const branch = await g.currentBranch(dir)
  if (!branch) return { message, note: 'HEAD no está en una rama: no se puede abrir un PR.' }
  const info = await remoteInfo(dir)
  if (!info) {
    const url = await g.remoteUrl(dir)
    return { message, note: url ? `No se reconoce la dirección del remoto («${clip(url, 60)}»): no se puede armar el enlace del PR.` : 'El repositorio no tiene remoto «origin».' }
  }
  if (branch === info.base) return { message, note: `Estás en la rama base («${info.base}»): un PR necesita una rama de trabajo.` }
  const task = taskId ? getDb().tasks.find((t) => t.id === taskId) : undefined

  const existing = await findPr(info, branch)
  let pr: PrLink | undefined
  if (existing) {
    pr = { url: existing.html_url, branch, base: info.base, exists: true, number: existing.number, title: existing.title, ts: Date.now() }
  } else {
    const { title, body } = prefill(task, branch)
    const url = newPrUrl(info, branch, title, body)
    if (url) pr = { url, branch, base: info.base, exists: false, title, ts: Date.now() }
  }
  if (!pr) return { message, note: 'Este tipo de remoto no permite generar el enlace del PR.' }
  if (task) {
    task.pr = pr
    if (!task.branch) {
      task.branch = branch
      task.branchDir = dir
    }
    commit()
  }
  return { message, pr }
}

/** Título y descripción del PR redactados por la IA a partir de los commits y el diff de la rama. */
export async function prText(dir: string, taskId?: string): Promise<{ title: string; body: string }> {
  const task = taskId ? getDb().tasks.find((t) => t.id === taskId) : undefined
  const [commits, diff] = await Promise.all([g.branchCommits(dir), g.diffAgainstBase(dir, 14000)])
  if (diff.empty && !commits.length) throw new Error(`La rama no tiene cambios respecto a «${diff.base}».`)
  const prompt =
    'Redacta el título y la descripción de un Pull Request en español para que otra persona lo revise. ' +
    'Formato EXACTO: primera línea = título (máx. 70 caracteres, sin prefijos como «PR:»); línea en blanco; luego el cuerpo en Markdown con estas secciones: ' +
    '«## Qué cambia», «## Por qué», «## Cómo probarlo» (pasos concretos) y «## Riesgos / qué revisar primero». Sé concreto, sin relleno ni inventar nada que no esté en los cambios.' +
    (task?.issue ? ` Termina con la línea «Closes #${task.issue.number}».` : '') +
    (task ? `\n\nTAREA: ${task.title}\n${clip(task.description, 800)}` : '') +
    `\n\nCOMMITS:\n${commits.map((c) => `- ${c.subject}`).join('\n')}\n\nARCHIVOS:\n${diff.stat}\n\nCAMBIOS:\n${diff.patch}`
  const out = (await askClaude(prompt, getDb().settings.claudeCmd, 150000)).replace(/\r/g, '').trim()
  const [first, ...rest] = out.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').split('\n')
  return { title: clip(first.replace(/^#+\s*/, '').trim(), 100), body: rest.join('\n').trim() }
}
