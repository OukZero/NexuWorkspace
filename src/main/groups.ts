import fs from 'fs'
import path from 'path'
import type { Task } from '../shared/types'
import { getDb } from './db'

/** Comillas para la línea de comandos de Windows (las rutas pueden tener espacios). */
const q = (s: string): string => `"${s.replace(/"/g, '\\"')}"`

/**
 * Patrón de permisos de Claude Code para una ruta absoluta: C:\a\b -> //c/a/b
 * (verificado en Windows con `--disallowedTools "Edit(//c/ruta/**)"`).
 */
function denyPattern(folder: string): string | null {
  const p = path.resolve(folder).replace(/\\/g, '/')
  const m = /^([A-Za-z]):(\/.*)?$/.exec(p)
  if (!m) return null // ruta de red u otro formato: no podemos garantizar el solo lectura
  return `Edit(//${m[1].toLowerCase()}${m[2] ?? ''}/**)`
}

export interface GroupAccess {
  args: string[] // fragmentos de línea de comandos ya entrecomillados
  folders: string[] // carpetas que quedan accesibles (además de la de la tarea)
  skipped: string[] // carpetas ignoradas (no existen o no se puede garantizar solo lectura)
}

/** Argumentos de Claude Code para dar acceso a los grupos de carpetas de una tarea. */
export function groupAccess(task: Task): GroupAccess {
  const db = getDb()
  const main = task.folder ? path.resolve(task.folder).toLowerCase() : ''
  const seen = new Set<string>([main])
  const args: string[] = []
  const folders: string[] = []
  const skipped: string[] = []
  const deny: string[] = []

  for (const id of task.groupIds ?? []) {
    const g = db.groups.find((x) => x.id === id)
    if (!g) continue
    for (const f of g.folders) {
      const key = path.resolve(f.path).toLowerCase()
      if (seen.has(key)) continue
      if (!fs.existsSync(f.path)) {
        skipped.push(f.path)
        continue
      }
      let pattern: string | null = null
      if (f.access === 'read') {
        pattern = denyPattern(f.path)
        if (!pattern) {
          skipped.push(f.path)
          continue
        }
      }
      seen.add(key)
      folders.push(f.path)
      args.push('--add-dir', q(f.path))
      if (pattern) deny.push(pattern)
    }
  }
  if (deny.length) args.push('--disallowedTools', ...deny.map(q))
  return { args, folders, skipped }
}
