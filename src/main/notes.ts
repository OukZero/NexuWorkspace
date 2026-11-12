import { protocol } from 'electron'
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
  fs.rmSync(path.join(dir(), 'assets', id), { recursive: true, force: true })
}

/** Quita el vínculo de las notas de una tarea que se elimina. */
export function unlinkTask(taskId: string): void {
  for (const n of load().values()) if (n.taskId === taskId) saveNote({ id: n.id, taskId: null })
}

/* Imágenes pegadas en una nota: se guardan en una carpeta por nota y se muestran con el esquema shutoki-note (sin red). */
export const NOTE_SCHEME = 'shutoki-note'
const IMG_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }
const IMG_TYPE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
const IMG_MAX = 15 * 1024 * 1024
const IMG_NAME = /^[A-Za-z0-9_-]{1,64}\.(png|jpg|gif|webp)$/

/** Debe llamarse antes de que la app esté lista. */
export function registerNoteScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: NOTE_SCHEME, privileges: { standard: true, secure: true } }])
}

/** shutoki-note://img/<nota>/<archivo>: solo sirve las imágenes de las notas, sin acceso a nada más. */
export function registerNoteProtocol(): void {
  protocol.handle(NOTE_SCHEME, (req) => {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean).map(decodeURIComponent)
    const [noteId, name] = parts
    if (parts.length !== 2 || !ID.test(noteId) || !IMG_NAME.test(name)) return new Response('No encontrado', { status: 404 })
    const img = path.join(dir(), 'assets', noteId, name)
    if (!fs.existsSync(img)) return new Response('No encontrado', { status: 404 })
    const headers = { 'content-type': IMG_TYPE[path.extname(name).slice(1)] ?? 'application/octet-stream', 'content-security-policy': "default-src 'none'", 'cache-control': 'no-store' }
    return new Response(fs.readFileSync(img), { headers })
  })
}

/** Guarda una imagen pegada (en base64) dentro de la carpeta de su nota y devuelve la dirección para el Markdown. */
export function saveNoteImage(noteId: string, mime: string, data: string): string {
  if (!ID.test(noteId) || !load().has(noteId)) throw new Error('La nota ya no existe.')
  const ext = IMG_EXT[mime]
  if (!ext) throw new Error('Formato no compatible (usa PNG, JPG, GIF o WebP).')
  const buf = Buffer.from(data, 'base64')
  if (!buf.length) throw new Error('La imagen está vacía.')
  if (buf.length > IMG_MAX) throw new Error('La imagen supera 15 MB.')
  const folder = path.join(dir(), 'assets', noteId)
  fs.mkdirSync(folder, { recursive: true })
  const name = `${uid()}.${ext}`
  fs.writeFileSync(path.join(folder, name), buf)
  return `${NOTE_SCHEME}://img/${noteId}/${name}`
}
