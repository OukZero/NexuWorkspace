import fs from 'fs'
import path from 'path'
import type { FileContent, FileEntry, FileRoot } from '../shared/types'
import { getDb } from './db'
import { effectiveTask } from './groups'

/** Visor de archivos de solo lectura: solo las carpetas de la tarea y de sus grupos, y nada fuera de ellas. */

const IGNORE = new Set(['node_modules', '.git', 'out', 'dist', 'bin', 'obj', '.next', '.venv', '__pycache__', 'target', 'build', '.idea', '.vs', '.gradle', 'coverage'])
const MAX_READ = 1_500_000
const MAX_ENTRIES = 3000

/** Carpetas que se pueden ver de una tarea: la suya (o la de su grupo) y las de sus grupos, con cualquier permiso. */
export function roots(taskId: string): FileRoot[] {
  const db = getDb()
  const task = db.tasks.find((t) => t.id === taskId)
  if (!task) throw new Error('Tarea no encontrada')
  const seen = new Set<string>()
  const out: FileRoot[] = []
  const add = (p: string, name: string): void => {
    if (!p || !fs.existsSync(p)) return
    const key = path.resolve(p).toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ name, path: path.resolve(p) })
  }
  const t = effectiveTask(task)
  if (t.folder) add(t.folder, path.basename(t.folder))
  for (const id of task.groupIds ?? []) for (const f of db.groups.find((g) => g.id === id)?.folders ?? []) add(f.path, path.basename(f.path))
  return out
}

/** Resuelve una ruta relativa dentro de una carpeta permitida; rechaza cualquier intento de salirse de ella. */
function resolveIn(taskId: string, root: string, rel: string): string {
  const allowed = roots(taskId).find((r) => path.resolve(r.path).toLowerCase() === path.resolve(root).toLowerCase())
  if (!allowed) throw new Error('Esa carpeta no pertenece a la tarea.')
  const full = path.resolve(allowed.path, rel)
  const back = path.relative(allowed.path, full)
  if (back.startsWith('..') || path.isAbsolute(back)) throw new Error('Ruta fuera de la carpeta de la tarea.')
  return full
}

export function list(taskId: string, root: string, rel: string): FileEntry[] {
  const dir = resolveIn(taskId, root, rel)
  const items = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !(e.isDirectory() && IGNORE.has(e.name)))
  return items
    .slice(0, MAX_ENTRIES)
    .map((e) => ({ name: e.name, dir: e.isDirectory() }))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

export function read(taskId: string, root: string, rel: string): FileContent {
  const file = resolveIn(taskId, root, rel)
  const st = fs.statSync(file)
  if (!st.isFile()) throw new Error('No es un archivo.')
  const fd = fs.openSync(file, 'r')
  try {
    const len = Math.min(st.size, MAX_READ)
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, 0)
    // un byte nulo en el principio indica un archivo binario
    if (buf.subarray(0, 8000).includes(0)) return { text: '', size: st.size, binary: true, truncated: false }
    return { text: buf.toString('utf8'), size: st.size, binary: false, truncated: st.size > MAX_READ }
  } finally {
    fs.closeSync(fd)
  }
}

/** Busca por nombre (sin distinguir mayúsculas) en una carpeta, hasta 80 resultados. */
export function find(taskId: string, root: string, query: string): string[] {
  const base = resolveIn(taskId, root, '')
  const q = query.trim().toLowerCase()
  const out: string[] = []
  let visited = 0
  const walk = (dir: string, depth: number): void => {
    if (out.length >= 80 || depth > 8 || visited > 20000) return
    let items: fs.Dirent[]
    try {
      items = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of items) {
      visited++
      if (e.isDirectory()) {
        if (!IGNORE.has(e.name)) walk(path.join(dir, e.name), depth + 1)
      } else if (e.name.toLowerCase().includes(q)) {
        out.push(path.relative(base, path.join(dir, e.name)))
        if (out.length >= 80) return
      }
    }
  }
  if (q) walk(base, 0)
  return out
}
