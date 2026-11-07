// Seguridad al trabajar con la IA: puntos de restauración antes de cada respuesta y copias aisladas del repositorio (git worktree).
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { Chat, Checkpoint } from '../shared/types'
import { clip } from '../shared/util'
import { git } from './git'

/** Raíz del repositorio de una carpeta (sin la restricción a carpetas de tareas: la copia aislada vive dentro del repo). */
const root = async (dir: string): Promise<string> => path.normalize((await git(dir, ['rev-parse', '--show-toplevel'])).stdout.trim())
const currentBranch = async (dir: string): Promise<string> => (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
const baseBranch = async (dir: string): Promise<string> => {
  for (const b of ['main', 'master']) if (await git(dir, ['rev-parse', '--verify', b]).then(() => true, () => false)) return b
  return currentBranch(dir)
}

const MAX_CHECKPOINTS = 30
const IDENT = ['-c', 'user.name=Shutoki AI Workspace', '-c', 'user.email=shutoki@local', '-c', 'commit.gpgsign=false']
const rid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

/** Árbol de Git con TODO el contenido actual de la carpeta (incluye archivos nuevos y respeta .gitignore), sin tocar el índice real. */
async function treeOf(dir: string): Promise<string> {
  const idx = path.join(os.tmpdir(), `shutoki-idx-${rid()}`)
  const env = { GIT_INDEX_FILE: idx }
  try {
    await git(dir, ['read-tree', 'HEAD'], { env, timeout: 20000 })
    await git(dir, ['add', '-A'], { env, timeout: 60000 })
    return (await git(dir, ['write-tree'], { env })).stdout.trim()
  } finally {
    fs.rmSync(idx, { force: true })
  }
}

async function commitOf(dir: string, tree: string, msg: string): Promise<string> {
  return (await git(dir, [...IDENT, 'commit-tree', tree, '-p', 'HEAD', '-m', msg])).stdout.trim()
}

/** ¿La carpeta está en un repositorio con al menos una confirmación? (sin eso no se puede guardar el punto de restauración) */
async function usable(dir: string): Promise<boolean> {
  try {
    await git(dir, ['rev-parse', '--verify', 'HEAD'])
    return true
  } catch {
    return false
  }
}

/** Guarda el estado actual antes de que la IA responda. Si algo falla, el mensaje se envía igual (sin punto de restauración). */
export async function takeCheckpoint(convId: string, chat: Chat, folder: string, msgTs: number): Promise<void> {
  try {
    const dir = await root(folder) // la carpeta de la tarea puede estar dentro del repositorio
    if (!(await usable(dir))) return
    const sha = await commitOf(dir, await treeOf(dir), `Shutoki: antes del mensaje de ${new Date(msgTs).toISOString()}`)
    const id = rid()
    await git(dir, ['update-ref', `refs/shutoki/${convId}/${id}`, sha])
    const list = (chat.checkpoints ??= [])
    list.push({ id, ts: Date.now(), msgTs, sha })
    while (list.length > MAX_CHECKPOINTS) {
      const old = list.shift()!
      await git(dir, ['update-ref', '-d', `refs/shutoki/${convId}/${old.id}`]).catch(() => undefined)
    }
  } catch {
    /* sin punto de restauración para este mensaje */
  }
}

/** Vuelve los archivos al estado del punto de restauración. Antes guarda el estado actual por si se quiere deshacer el deshacer. */
export async function restoreCheckpoint(convId: string, chat: Chat, folder: string, cp: Checkpoint): Promise<string> {
  const dir = await root(folder)
  if (!(await usable(dir))) throw new Error('La carpeta ya no es un repositorio con confirmaciones.')
  await git(dir, ['cat-file', '-e', `${cp.sha}^{commit}`]).catch(() => {
    throw new Error('Ese punto de restauración ya no existe en Git (¿se limpió el repositorio?).')
  })
  const nowTree = await treeOf(dir)
  const safety = await commitOf(dir, nowTree, 'Shutoki: antes de volver a un punto anterior')
  const sid = rid()
  await git(dir, ['update-ref', `refs/shutoki/${convId}/${sid}`, safety])
  ;(chat.checkpoints ??= []).push({ id: sid, ts: Date.now(), msgTs: 0, sha: safety })

  const snapTree = (await git(dir, ['rev-parse', `${cp.sha}^{tree}`])).stdout.trim()
  const out = (await git(dir, ['-c', 'core.quotepath=off', 'diff-tree', '-r', '-z', '--name-status', snapTree, nowTree])).stdout
  const parts = out.split('\0').filter(Boolean)
  const toDelete: string[] = []
  const toRestore: string[] = []
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const [st, file] = [parts[i], parts[i + 1]]
    if (st === 'A') toDelete.push(file) // lo creó la IA después del punto
    else toRestore.push(file) // modificado o borrado después del punto
  }
  for (let i = 0; i < toRestore.length; i += 80) await git(dir, ['restore', `--source=${cp.sha}`, '--worktree', '--', ...toRestore.slice(i, i + 80)])
  for (const f of toDelete) {
    const full = path.resolve(dir, f)
    if (full.startsWith(path.resolve(dir) + path.sep)) fs.rmSync(full, { force: true })
  }
  return `Archivos vueltos al punto anterior: ${toRestore.length} restaurados, ${toDelete.length} eliminados. Antes se guardó el estado actual (se puede volver a él).`
}

/** Borra los puntos de restauración de una conversación (al eliminarla). */
export async function dropCheckpoints(dir: string, convId: string): Promise<void> {
  try {
    const refs = (await git(dir, ['for-each-ref', '--format=%(refname)', `refs/shutoki/${convId}/`])).stdout.split('\n').filter(Boolean)
    for (const r of refs) await git(dir, ['update-ref', '-d', r]).catch(() => undefined)
  } catch {
    /* nada que limpiar */
  }
}

// ---------- copias aisladas (git worktree) ----------
const slug = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'tarea'

/** Crea una copia del repositorio en su propia rama, dentro de la carpeta del repo (oculta en .git/info/exclude). */
export async function createWorktree(repoDir: string, convId: string, label: string): Promise<{ dir: string; branch: string; base: string; repo: string }> {
  const repo = await root(repoDir)
  if (!(await usable(repo))) throw new Error('El repositorio necesita al menos una confirmación para crear una copia aislada.')
  const base = (await currentBranch(repo)) || (await baseBranch(repo))
  const short = convId.slice(-5)
  const branch = `shutoki/${slug(label)}-${short}`
  const dir = path.join(repo, '.shutoki-worktrees', `${slug(label)}-${short}`)
  fs.mkdirSync(path.dirname(dir), { recursive: true })
  await git(repo, ['worktree', 'add', '-b', branch, dir, 'HEAD'])
  try {
    const ex = (await git(repo, ['rev-parse', '--git-path', 'info/exclude'])).stdout.trim()
    const file = path.resolve(repo, ex)
    const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
    if (!cur.includes('.shutoki-worktrees')) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, `${cur.trimEnd()}\n.shutoki-worktrees/\n`)
    }
  } catch {
    /* si no se puede ocultar, solo se verá como carpeta sin seguimiento */
  }
  return { dir, branch, base, repo }
}

export async function worktreeInfo(wt: { dir: string; branch: string; base: string; repo: string }): Promise<{ changed: number; ahead: number; exists: boolean }> {
  if (!fs.existsSync(wt.dir)) return { changed: 0, ahead: 0, exists: false }
  const st = await git(wt.dir, ['status', '--porcelain']).catch(() => ({ stdout: '' }))
  const ahead = await git(wt.dir, ['rev-list', '--count', `${wt.base}..HEAD`]).catch(() => ({ stdout: '0' }))
  return { changed: st.stdout.split('\n').filter(Boolean).length, ahead: Number(ahead.stdout.trim()) || 0, exists: true }
}

/** Trae a la rama original lo hecho en la copia. Si hay conflictos, deshace la fusión y lo explica. */
export async function mergeWorktree(wt: { dir: string; branch: string; base: string; repo: string }): Promise<string> {
  const info = await worktreeInfo(wt)
  if (!info.exists) throw new Error('La copia aislada ya no existe.')
  if (info.changed > 0) {
    // lo pendiente se confirma en la rama de la copia para poder fusionarlo
    await git(wt.dir, ['add', '-A'])
    await git(wt.dir, [...IDENT, 'commit', '-m', 'Cambios de la conversación (Shutoki)'])
  }
  const cur = await currentBranch(wt.repo)
  if (cur !== wt.base) throw new Error(`El repositorio original está en «${cur}», no en «${wt.base}». Vuelve a esa rama para fusionar.`)
  const dirty = (await git(wt.repo, ['status', '--porcelain', '--untracked-files=no'])).stdout.trim()
  if (dirty) throw new Error('El repositorio original tiene cambios sin confirmar. Confírmalos o guárdalos antes de fusionar.')
  try {
    await git(wt.repo, [...IDENT, 'merge', '--no-ff', wt.branch, '-m', `Fusiona ${wt.branch}`])
  } catch (e) {
    await git(wt.repo, ['merge', '--abort']).catch(() => undefined)
    throw new Error(`Hay conflictos al fusionar; no se cambió nada. Resuélvelo desde la rama «${wt.branch}». (${clip((e as Error).message, 200)})`)
  }
  return `Fusionado en «${wt.base}». La rama «${wt.branch}» sigue disponible.`
}

/** Elimina la carpeta de la copia (la rama se conserva). */
export async function removeWorktree(wt: { dir: string; branch: string; base: string; repo: string }): Promise<void> {
  if (fs.existsSync(wt.dir)) await git(wt.repo, ['worktree', 'remove', '--force', wt.dir])
  await git(wt.repo, ['worktree', 'prune']).catch(() => undefined)
}
