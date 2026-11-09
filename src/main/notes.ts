import fs from 'fs'
import path from 'path'
import type { Note, NoteInput } from '../shared/types'
import { dataPath, uid } from './db'

/**
 * Notas locales: un archivo Markdown por nota en «<datos de la app>/notes».
 * Los metadatos van en una cabecera simple (---) al inicio del archivo, así cada nota es legible y portable por sí sola.
 */

const dir = (): string => path.join(path.dirname(dataPath()), 'notes')
const file = (id: string): string => path.join(dir(), `${id}.md`)
const ID = /^[A-Za-z0-9_-]{1,64}$/

let cache: Map<string, Note> | null = null

const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim()

function serialize(n: Note): string {
  const head = [`title: ${oneLine(n.title)}`, `tags: ${n.tags.map(oneLine).join(', ')}`, `task: ${n.taskId ?? ''}`, `pinned: ${n.pinned ? 'true' : 'false'}`, `created: ${n.createdAt}`, `updated: ${n.updatedAt}`]
  return `---\n${head.join('\n')}\n---\n${n.body}`
}

function parse(id: string, raw: string): Note {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text)
  const meta = new Map<string, string>()
  let body = text
  if (m) {
    body = m[2]
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':')
      if (i > 0) meta.set(line.slice(0, i).trim(), line.slice(i + 1).trim())
    }
  }
  const created = Number(meta.get('created')) || Date.now()
  return {
    id,
    title: meta.get('title') || 'Sin título',
    body,
    tags: (meta.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    taskId: meta.get('task') || undefined,
    pinned: meta.get('pinned') === 'true',
    createdAt: created,
    updatedAt: Number(meta.get('updated')) || created
  }
}

function load(): Map<string, Note> {
  if (cache) return cache
  const map = new Map<string, Note>()
  try {
    for (const f of fs.readdirSync(dir())) {
      const id = f.replace(/\.md$/, '')
      if (f.endsWith('.md') && ID.test(id)) {
        try {
          const raw = fs.readFileSync(path.join(dir(), f), 'utf8')
          const n = parse(id, raw)
          // un archivo sin cabecera (creado a mano) toma la primera línea como título
          if (!raw.trimStart().startsWith('---')) n.title = oneLine(raw.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '') ?? '') || 'Sin título'
          map.set(id, n)
        } catch {
          /* archivo ilegible: se ignora */
        }
      }
    }
  } catch {
    /* la carpeta aún no existe */
  }
  cache = map
  return map
}

export function listNotes(): Note[] {
  return [...load().values()].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt)
}

export function saveNote(input: NoteInput): Note {
  const map = load()
  const prev = input.id ? map.get(input.id) : undefined
  if (input.id && !ID.test(input.id)) throw new Error('Identificador de nota no válido.')
  const now = Date.now()
  const note: Note = {
    id: prev?.id ?? uid(),
    title: oneLine(input.title ?? prev?.title ?? '') || 'Sin título',
    body: input.body ?? prev?.body ?? '',
    tags: (input.tags ?? prev?.tags ?? []).map((t) => oneLine(t).replace(/,/g, '')).filter(Boolean).slice(0, 20),
    taskId: input.taskId === null ? undefined : (input.taskId ?? prev?.taskId),
    pinned: input.pinned ?? prev?.pinned ?? false,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now
  }
  if (!ID.test(note.id)) throw new Error('Identificador de nota no válido.')
  fs.mkdirSync(dir(), { recursive: true })
  const tmp = file(note.id) + '.tmp'
  fs.writeFileSync(tmp, serialize(note), 'utf8')
  fs.renameSync(tmp, file(note.id))
  map.set(note.id, note)
  return note
}

export function deleteNote(id: string): void {
  if (!ID.test(id)) throw new Error('Identificador de nota no válido.')
  try {
    fs.unlinkSync(file(id))
  } catch {
    /* ya no existía */
  }
  load().delete(id)
}

/** Quita el vínculo de las notas de una tarea que se elimina. */
export function unlinkTask(taskId: string): void {
  for (const n of load().values()) if (n.taskId === taskId) saveNote({ id: n.id, taskId: null })
}
