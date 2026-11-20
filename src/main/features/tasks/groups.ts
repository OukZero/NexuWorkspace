import fs from 'fs'
import os from 'os'
import path from 'path'
import type { Task } from '../../../shared/types'
import { workFolder } from '../../../shared/util'
import { getDb } from '../../db'

/** La tarea con su carpeta de trabajo efectiva: si no tiene una propia, la primera carpeta de escritura de sus grupos. */
export function effectiveTask(task: Task): Task {
  const db = getDb()
  const folder = workFolder(task, db.groups, fs.existsSync)
  return folder === task.folder ? task : { ...task, folder }
}

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
export function groupAccess(task: Task, extraDeny: string[] = []): GroupAccess {
  const db = getDb()
  const main = task.folder ? path.resolve(task.folder).toLowerCase() : ''
  const seen = new Set<string>([main])
  const args: string[] = []
  const folders: string[] = []
  const skipped: string[] = []
  const deny: string[] = [...extraDeny]

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

/**
 * Nota para el modelo con todas las carpetas del proyecto (la de trabajo y las de los grupos de la tarea, con su acceso),
 * para que trabaje en el conjunto y no solo en la carpeta donde arranca. '' si la tarea no tiene grupos con carpetas.
 */
export function groupNote(task: Task): string {
  const db = getDb()
  const main = task.folder ? path.resolve(task.folder).toLowerCase() : ''
  const seen = new Set<string>([main])
  const lines: string[] = []
  for (const id of task.groupIds ?? []) {
    const g = db.groups.find((x) => x.id === id)
    if (!g) continue
    for (const f of g.folders) {
      const key = path.resolve(f.path).toLowerCase()
      if (seen.has(key) || !fs.existsSync(f.path)) continue
      seen.add(key)
      lines.push(`- ${f.path} (${f.access === 'read' ? 'solo lectura: no la modifiques' : 'lectura y escritura'}) · grupo «${g.name}»`)
    }
  }
  if (!lines.length) return ''
  return [
    'Esta tarea abarca varias carpetas, no solo la actual. Tienes acceso a todas y debes trabajar en el conjunto cuando la tarea lo requiera:',
    `- ${task.folder} (carpeta de trabajo actual)`,
    ...lines,
    'Para cambios que cruzan proyectos, revisa cada carpeta con rutas absolutas antes de editar y menciona en qué carpeta hiciste cada cambio.'
  ].join('\n')
}

/** Guarda la nota en un archivo temporal para pasarla a Claude con --append-system-prompt-file (evita problemas de comillas en cmd). */
export function groupNoteFile(task: Task): string | null {
  const note = groupNote(task)
  if (!note) return null
  const dir = path.join(os.tmpdir(), 'mis-tareas')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `carpetas-${task.id}.txt`)
  fs.writeFileSync(file, note, 'utf8')
  return file
}

/**
 * Carpetas de los grupos para el CLI de Copilot. No tiene una regla de «solo lectura» por carpeta como Claude Code,
 * así que las de solo lectura se omiten (se avisa en el chat) en lugar de dejarlas editables.
 */
export function copilotDirs(task: Task): { dirs: string[]; skipped: string[] } {
  const db = getDb()
  const seen = new Set<string>([task.folder ? path.resolve(task.folder).toLowerCase() : ''])
  const dirs: string[] = []
  const skipped: string[] = []
  for (const id of task.groupIds ?? []) {
    for (const f of db.groups.find((x) => x.id === id)?.folders ?? []) {
      const key = path.resolve(f.path).toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      if (f.access === 'read' || !fs.existsSync(f.path)) skipped.push(f.path)
      else dirs.push(f.path)
    }
  }
  return { dirs, skipped }
}
