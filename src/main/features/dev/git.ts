// Control de Git de las tareas: estado, diff, preparar, commit, ramas, sincronizar e historial (como el panel de control de código de VS Code).
import { execFile, execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { GitBranches, GitCommit, GitFile, GitRepo, GitStatus, Task } from '../../../shared/types'
import { clip } from '../../../shared/util'
import { getDb } from '../../db'
import { askClaude } from '../ai/summary'

// la app puede arrancar con un PATH sin Git (p. ej. desde el menú de inicio): se prueban las rutas habituales
const FALLBACKS = ['C:\\Program Files\\Git\\cmd\\git.exe', 'C:\\Program Files (x86)\\Git\\cmd\\git.exe', path.join(os.homedir(), 'AppData\\Local\\Programs\\Git\\cmd\\git.exe')]
let bin: string | null = null
function gitBin(): string {
  if (bin) return bin
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore', windowsHide: true })
    bin = 'git'
  } catch {
    bin = FALLBACKS.find((p) => fs.existsSync(p)) ?? 'git'
  }
  return bin
}

interface Result {
  stdout: string
  stderr: string
}

/** Ejecuta git sin shell (no hay inyección de comandos). Un código de salida fuera de `ok` es un error con el mensaje de git. */
export function git(cwd: string, args: string[], opts: { timeout?: number; ok?: number[]; env?: Record<string, string> } = {}): Promise<Result> {
  const ok = opts.ok ?? [0]
  return new Promise((resolve, reject) => {
    execFile(
      gitBin(),
      args,
      {
        cwd,
        timeout: opts.timeout ?? 60000,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
        // sin pedir nada por la terminal (colgaría); el gestor de credenciales de Git sí puede abrir su propia ventana
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', GIT_MERGE_AUTOEDIT: 'no', LC_ALL: 'C.UTF-8', ...opts.env }
      },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code as number) : -1) : 0
        if (err && !ok.includes(code)) {
          const msg = (stderr || stdout || '').toString().trim()
          reject(new Error((code === -1 && /ENOENT/.test(err.message) ? 'Git no está instalado o no se encuentra en el PATH.' : msg) || err.message))
          return
        }
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() })
      }
    )
  })
}

/** Solo se opera en carpetas de tareas o de grupos de carpetas (el renderer no puede pedir rutas arbitrarias). */
function allowed(dir: string): string {
  const d = path.resolve(dir)
  const db = getDb()
  const roots = [...db.tasks.map((t) => t.folder), ...db.groups.flatMap((g) => g.folders.map((f) => f.path))].filter(Boolean).map((p) => path.resolve(p).toLowerCase())
  const low = d.toLowerCase()
  if (!roots.some((r) => low === r || low.startsWith(r + path.sep))) throw new Error('Esa carpeta no pertenece a ninguna tarea.')
  if (!fs.existsSync(d)) throw new Error('La carpeta no existe: ' + d)
  return d
}

const toplevelCache = new Map<string, string>()
/** Raíz del repositorio que contiene la carpeta (puede estar por encima de la carpeta de la tarea). */
export async function root(dir: string): Promise<string> {
  const d = allowed(dir)
  const hit = toplevelCache.get(d)
  if (hit && fs.existsSync(hit)) return hit
  const r = await git(d, ['rev-parse', '--show-toplevel']).catch(() => {
    throw new Error('Esta carpeta no es un repositorio de Git.')
  })
  const top = path.normalize(r.stdout.trim())
  toplevelCache.set(d, top)
  return top
}

const safePaths = (paths: string[]): string[] => {
  if (!paths.length) throw new Error('No hay archivos seleccionados.')
  return paths
}

export async function repos(task: Task): Promise<GitRepo[]> {
  const db = getDb()
  const dirs = [task.folder, ...(task.groupIds ?? []).flatMap((id) => db.groups.find((g) => g.id === id)?.folders.map((f) => f.path) ?? [])].filter((d) => d && fs.existsSync(d))
  const out: GitRepo[] = []
  const seen = new Set<string>()
  for (const dir of dirs) {
    let isRepo = false
    let key = path.resolve(dir).toLowerCase()
    try {
      key = (await root(dir)).toLowerCase()
      isRepo = true
    } catch {
      /* no es un repositorio */
    }
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ dir, name: path.basename(path.resolve(dir)), isRepo })
  }
  return out
}

export async function init(dir: string): Promise<void> {
  await git(allowed(dir), ['init'])
  toplevelCache.clear()
}

export async function status(dir: string): Promise<GitStatus> {
  const top = await root(dir)
  const r = await git(top, ['status', '--porcelain=v1', '-z', '-b', '--untracked-files=all'])
  const parts = r.stdout.split('\0')
  let branch = 'HEAD'
  let upstream: string | undefined
  let ahead = 0
  let behind = 0
  const files: GitFile[] = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (!p) continue
    if (p.startsWith('## ')) {
      const m = /^## (?:No commits yet on |Initial commit on )?(.+?)(?:\.\.\.(\S+))?(?: \[(.*)\])?$/.exec(p)
      if (m) {
        branch = m[1]
        upstream = m[2]
        ahead = Number(/ahead (\d+)/.exec(m[3] ?? '')?.[1] ?? 0)
        behind = Number(/behind (\d+)/.exec(m[3] ?? '')?.[1] ?? 0)
      }
      continue
    }
    const x = p[0]
    const y = p[1]
    const file = p.slice(3)
    const orig = x === 'R' || x === 'C' ? parts[++i] : undefined
    const untracked = x === '?'
    const conflicted = x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')
    files.push({
      path: file,
      orig,
      index: x,
      work: y,
      untracked,
      conflicted,
      staged: !untracked && !conflicted && x !== ' ',
      unstaged: !untracked && !conflicted && y !== ' '
    })
  }
  return { root: top, branch, upstream, ahead, behind, files }
}

export async function diff(dir: string, file: string, kind: 'staged' | 'work' | 'untracked'): Promise<string> {
  const top = await root(dir)
  if (kind === 'untracked') {
    const full = path.resolve(top, file)
    if (!full.startsWith(top) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return ''
    const buf = fs.readFileSync(full)
    if (buf.subarray(0, 8000).includes(0)) return `(archivo binario, ${buf.length} bytes)`
    const lines = buf.toString('utf8').split(/\r?\n/)
    return `archivo nuevo: ${file}\n@@ -0,0 +1,${lines.length} @@\n` + lines.map((l) => '+' + l).join('\n')
  }
  const r = await git(top, ['diff', ...(kind === 'staged' ? ['--cached'] : []), '--no-color', '--no-ext-diff', '--', file])
  return clip(r.stdout, 400_000) || '(sin diferencias de texto)'
}

export async function stage(dir: string, paths: string[]): Promise<void> {
  await git(await root(dir), ['add', '--', ...safePaths(paths)])
}

export async function unstage(dir: string, paths: string[]): Promise<void> {
  const top = await root(dir)
  const p = safePaths(paths)
  // en un repositorio sin commits no hay HEAD al que volver: se quita del índice
  await git(top, ['restore', '--staged', '--', ...p]).catch(() => git(top, ['rm', '--cached', '-r', '-q', '--', ...p]))
}

export async function discard(dir: string, tracked: string[], untracked: string[]): Promise<void> {
  const top = await root(dir)
  if (tracked.length) await git(top, ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...tracked])
  if (untracked.length) await git(top, ['clean', '-f', '--', ...untracked])
}

export async function commit(dir: string, message: string): Promise<string> {
  const top = await root(dir)
  const msg = message.trim()
  if (!msg) throw new Error('Escribe un mensaje para el commit.')
  const file = path.join(os.tmpdir(), `shutoki-commit-${Date.now()}.txt`)
  fs.writeFileSync(file, msg + '\n', 'utf8')
  try {
    return (await git(top, ['commit', '-F', file])).stdout.trim()
  } finally {
    fs.rmSync(file, { force: true })
  }
}

/** Deja solo el mensaje: sin comillas, bloques de código ni la frase introductoria que a veces añade el modelo. */
function cleanMessage(raw: string): string {
  // Claude Code añade por defecto un pie «Co-Authored-By: Claude…»: se quita, la autoría del commit es tuya
  let m = raw.replace(/\r/g, '').replace(/^Co-authored-by:.*$/gim, '').trim().replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim()
  const first = m.split('\n').findIndex((l) => /^(feat|fix|refactor|docs|style|test|chore|perf|build|ci|revert)(\([^)]+\))?!?:\s/.test(l))
  if (first > 0) m = m.split('\n').slice(first).join('\n') // descarta «Aquí tienes el mensaje:» y similares
  // comillas que envuelven todo el mensaje (solo si abren y cierran: un «'1.0.0'» final es contenido, no comillas)
  if (/^["'«“`]/.test(m) && /["'»”`]$/.test(m) && !/\n/.test(m.slice(0, 1))) m = m.slice(1, -1).trim()
  return m
}

/**
 * Mensaje de commit propuesto por Claude. Usa lo preparado; si no hay nada preparado, describe todos los cambios
 * pendientes (los de archivos con seguimiento y los archivos nuevos), igual que el botón de VS Code.
 */
export async function commitMessage(dir: string): Promise<string> {
  const top = await root(dir)
  let stat = (await git(top, ['diff', '--cached', '--stat', '--no-color'])).stdout.trim()
  let patch = ''
  let note = ''
  if (stat) {
    patch = (await git(top, ['diff', '--cached', '--no-color', '--no-ext-diff'])).stdout
  } else {
    const st = await status(dir)
    if (!st.files.length) throw new Error('No hay cambios que describir.')
    note = 'Los cambios todavía no están preparados: describe todos los que aparecen. '
    const hasHead = await git(top, ['rev-parse', '--verify', '-q', 'HEAD'], { ok: [0, 1] }).then((r) => !!r.stdout.trim(), () => false)
    const tracked = st.files.filter((f) => !f.untracked)
    if (hasHead && tracked.length) {
      stat = (await git(top, ['diff', 'HEAD', '--stat', '--no-color'])).stdout.trim()
      patch = (await git(top, ['diff', 'HEAD', '--no-color', '--no-ext-diff'])).stdout
    }
    // los archivos nuevos no salen en un diff: se agregan con el comienzo de su contenido
    for (const f of st.files.filter((x) => x.untracked).slice(0, 12)) {
      stat += `${stat ? '\n' : ''} ${f.path} (archivo nuevo)`
      const full = path.resolve(top, f.path)
      if (!full.startsWith(top) || !fs.existsSync(full) || fs.statSync(full).isDirectory() || fs.statSync(full).size > 200_000) continue
      const buf = fs.readFileSync(full)
      if (buf.subarray(0, 4000).includes(0)) continue // binario
      patch += `\n\n--- archivo nuevo: ${f.path}\n` + buf.toString('utf8').split('\n').slice(0, 60).join('\n')
    }
  }
  const prompt =
    'Escribe el mensaje de commit de estos cambios, en español, en formato convencional: «tipo(ámbito): resumen» de máximo 72 caracteres ' +
    '(tipos: feat, fix, refactor, docs, style, test, chore). Si hace falta contexto, deja una línea en blanco y 2 a 4 viñetas con "- ". ' +
    note +
    'Responde SOLO con el mensaje, sin comillas ni explicaciones.\n\nRESUMEN:\n' +
    stat +
    '\n\nCAMBIOS:\n' +
    clip(patch, 14000)
  const out = cleanMessage(await askClaude(prompt, getDb().settings.claudeCmd, 120000))
  if (!out) throw new Error('Claude no devolvió ningún mensaje. Inténtalo de nuevo.')
  return out
}

export async function branches(dir: string): Promise<GitBranches> {
  const top = await root(dir)
  const lines = (s: string): string[] => s.split('\n').map((l) => l.trim()).filter(Boolean)
  const local = lines((await git(top, ['branch', '--format=%(refname:short)'])).stdout)
  const remote = lines((await git(top, ['branch', '-r', '--format=%(refname:short)'], { ok: [0, 128] }).catch(() => ({ stdout: '' }))).stdout).filter(
    (b) => !b.endsWith('/HEAD') && b.includes('/')
  )
  const current = (await git(top, ['symbolic-ref', '--short', 'HEAD'], { ok: [0, 128] }).catch(() => ({ stdout: '' }))).stdout.trim() || 'HEAD'
  return { current, local, remote }
}

export async function checkout(dir: string, name: string, create: boolean): Promise<void> {
  const top = await root(dir)
  if (!name.trim() || name.startsWith('-')) throw new Error('Nombre de rama no válido.')
  await git(top, ['check-ref-format', '--branch', name]).catch(() => {
    throw new Error('Nombre de rama no válido: sin espacios, sin «..» ni caracteres especiales.')
  })
  if (create) return void (await git(top, ['switch', '-c', name]))
  const exists = (ref: string): Promise<boolean> =>
    git(top, ['show-ref', '--verify', '--quiet', ref]).then(
      () => true,
      () => false
    )
  if (await exists(`refs/heads/${name}`)) return void (await git(top, ['switch', name]))
  if (await exists(`refs/remotes/${name}`)) {
    // rama remota («origin/x»): se crea la local «x» siguiéndola; si ya existe, se cambia a ella
    const localName = name.slice(name.indexOf('/') + 1)
    if (await exists(`refs/heads/${localName}`)) return void (await git(top, ['switch', localName]))
    return void (await git(top, ['switch', '-c', localName, '--track', name]))
  }
  await git(top, ['switch', name])
}

export async function sync(dir: string, op: 'fetch' | 'pull' | 'push'): Promise<string> {
  const top = await root(dir)
  const long = { timeout: 180000 }
  if (op === 'fetch') return ((await git(top, ['fetch', '--all', '--prune'], long)).stderr || 'Al día.').trim()
  if (op === 'pull') {
    const r = await git(top, ['pull', '--no-edit'], long)
    return (r.stdout || r.stderr).trim() || 'Al día.'
  }
  try {
    const r = await git(top, ['push'], long)
    return (r.stderr || r.stdout).trim() || 'Enviado.'
  } catch (e) {
    // rama nueva sin upstream: se publica con -u (lo mismo que hace «Publicar rama» en VS Code)
    if (!/no upstream|set-upstream/i.test((e as Error).message)) throw e
    const branch = (await git(top, ['symbolic-ref', '--short', 'HEAD'])).stdout.trim()
    const r = await git(top, ['push', '--set-upstream', 'origin', branch], long)
    return (r.stderr || r.stdout).trim() || 'Rama publicada.'
  }
}

export async function log(dir: string, n: number): Promise<GitCommit[]> {
  const top = await root(dir)
  const r = await git(top, ['log', '-n', String(Math.min(200, Math.max(1, n))), '--no-color', '--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ct'], { ok: [0, 128] }).catch(() => ({ stdout: '' }))
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [hash, short, subject, author, ct] = l.split('\x1f')
      return { hash, short, subject, author, date: Number(ct) * 1000 }
    })
}

export async function show(dir: string, hash: string): Promise<string> {
  const top = await root(dir)
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) throw new Error('Commit no válido.')
  return clip((await git(top, ['show', '--no-color', '--stat', '--patch', '--format=%h %s%n%an · %ad%n', '--date=short', hash])).stdout, 400_000)
}

// ---------- ramas de trabajo, base y comparación (para PR, revisión y contexto) ----------

const refExists = (top: string, ref: string): Promise<boolean> =>
  git(top, ['show-ref', '--verify', '--quiet', ref]).then(
    () => true,
    () => false
  )

/** Rama actual, o '' si HEAD está suelto. */
export async function currentBranch(dir: string): Promise<string> {
  const top = await root(dir)
  return (await git(top, ['symbolic-ref', '--short', 'HEAD'], { ok: [0, 128] }).catch(() => ({ stdout: '' }))).stdout.trim()
}

/** Rama base del repositorio (a la que irá el PR): la que declara el remoto, si no main/master/develop, si no la de Ajustes. */
export async function baseBranch(dir: string): Promise<string> {
  const top = await root(dir)
  const head = (await git(top, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { ok: [0, 128] }).catch(() => ({ stdout: '' }))).stdout.trim()
  if (head.startsWith('origin/')) return head.slice(7)
  for (const b of ['main', 'master', 'develop', 'dev']) {
    if ((await refExists(top, `refs/remotes/origin/${b}`)) || (await refExists(top, `refs/heads/${b}`))) return b
  }
  return getDb().settings.baseBranch?.trim() || 'main'
}

/** Referencia contra la que comparar la base: la remota si existe (más reciente), si no la local. */
async function baseRef(top: string, base: string): Promise<string | null> {
  if (await refExists(top, `refs/remotes/origin/${base}`)) return `origin/${base}`
  if (await refExists(top, `refs/heads/${base}`)) return base
  return null
}

/** Crea una rama (opcionalmente desde otro punto, p. ej. la base actualizada) y se cambia a ella; si ya existe, solo se cambia. */
export async function createBranch(dir: string, name: string, from?: string): Promise<void> {
  const top = await root(dir)
  if (!name.trim() || name.startsWith('-')) throw new Error('Nombre de rama no válido.')
  await git(top, ['check-ref-format', '--branch', name]).catch(() => {
    throw new Error('Nombre de rama no válido: sin espacios, sin «..» ni caracteres especiales.')
  })
  if (await refExists(top, `refs/heads/${name}`)) return void (await git(top, ['switch', name]))
  if (from) {
    await git(top, ['fetch', 'origin', from], { timeout: 60000 }).catch(() => undefined) // sin red: se parte de lo que haya
    const ref = await baseRef(top, from)
    if (ref) return void (await git(top, ['switch', '-c', name, '--no-track', ref]))
  }
  await git(top, ['switch', '-c', name])
}

/** Commits que la rama aporta frente a la base (más recientes primero). */
export async function branchCommits(dir: string, limit = 30): Promise<GitCommit[]> {
  const top = await root(dir)
  const base = await baseRef(top, await baseBranch(dir))
  const range = base ? [`${base}..HEAD`] : ['-n', '10']
  const r = await git(top, ['log', ...range, '-n', String(limit), '--no-color', '--pretty=format:%H%x1f%h%x1f%s%x1f%an%x1f%ct'], { ok: [0, 128] }).catch(() => ({ stdout: '' }))
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [hash, short, subject, author, ct] = l.split('\x1f')
      return { hash, short, subject, author, date: Number(ct) * 1000 }
    })
}

/** Diff y lista de archivos de lo que la rama aporta frente a la base (lo que verá quien revise el PR). */
export async function diffAgainstBase(dir: string, maxChars = 60000): Promise<{ base: string; stat: string; patch: string; empty: boolean }> {
  const top = await root(dir)
  const base = await baseBranch(dir)
  const ref = await baseRef(top, base)
  if (!ref) return { base, stat: '', patch: '', empty: true }
  // tres puntos: desde el ancestro común, para no mezclar lo que la base avanzó sin que la rama lo tenga
  const range = `${ref}...HEAD`
  const stat = (await git(top, ['diff', '--stat', '--no-color', range], { ok: [0, 1] }).catch(() => ({ stdout: '' }))).stdout.trim()
  const patch = (await git(top, ['diff', '--no-color', '--no-ext-diff', '-U4', range], { ok: [0, 1] }).catch(() => ({ stdout: '' }))).stdout
  return { base, stat, patch: clip(patch, maxChars), empty: !patch.trim() }
}

/** Cambios sin confirmar (preparados y no preparados) como un solo diff, más los archivos nuevos. */
export async function diffPending(dir: string, maxChars = 40000): Promise<{ stat: string; patch: string; empty: boolean }> {
  const top = await root(dir)
  const hasHead = await git(top, ['rev-parse', '--verify', '-q', 'HEAD'], { ok: [0, 1] }).then((r) => !!r.stdout.trim(), () => false)
  let stat = ''
  let patch = ''
  if (hasHead) {
    stat = (await git(top, ['diff', 'HEAD', '--stat', '--no-color'], { ok: [0, 1] }).catch(() => ({ stdout: '' }))).stdout.trim()
    patch = (await git(top, ['diff', 'HEAD', '--no-color', '--no-ext-diff', '-U4'], { ok: [0, 1] }).catch(() => ({ stdout: '' }))).stdout
  }
  const st = await status(dir)
  for (const f of st.files.filter((x) => x.untracked).slice(0, 12)) {
    stat += `${stat ? '\n' : ''} ${f.path} (archivo nuevo)`
    const full = path.resolve(top, f.path)
    if (!full.startsWith(top) || !fs.existsSync(full) || fs.statSync(full).isDirectory() || fs.statSync(full).size > 200_000) continue
    const buf = fs.readFileSync(full)
    if (buf.subarray(0, 4000).includes(0)) continue
    patch += `\n\n--- archivo nuevo: ${f.path}\n` + buf.toString('utf8').split('\n').slice(0, 120).join('\n')
  }
  return { stat, patch: clip(patch, maxChars), empty: !patch.trim() && !stat }
}

/**
 * URL del remoto «origin» ('' si no hay). `get-url` aplica las reglas insteadOf (p. ej. https→ssh); con `raw` se devuelve
 * la URL tal como está en la configuración, que suele ser la dirección web del repositorio.
 */
export async function remoteUrl(dir: string, raw = false): Promise<string> {
  const top = await root(dir)
  const args = raw ? ['config', '--get', 'remote.origin.url'] : ['remote', 'get-url', 'origin']
  return (await git(top, args, { ok: [0, 1, 2, 128] }).catch(() => ({ stdout: '' }))).stdout.trim()
}

/** Trae una rama que acaba de crearse en el remoto y se cambia a una local que la sigue (si la local ya existe, solo se cambia). */
export async function checkoutRemoteBranch(dir: string, name: string): Promise<void> {
  const top = await root(dir)
  await git(top, ['fetch', 'origin', `+refs/heads/${name}:refs/remotes/origin/${name}`], { timeout: 60000 })
  if (await refExists(top, `refs/heads/${name}`)) return void (await git(top, ['switch', name]))
  await git(top, ['switch', '-c', name, '--track', `origin/${name}`])
}
