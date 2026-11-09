import { useEffect, useSyncExternalStore } from 'react'
import type { Note, NoteInput } from '../../shared/types'

/** Notas locales en memoria del renderer: se cargan una vez y se actualizan al guardar o borrar. */

let list: Note[] = []
let loaded = false
const subs = new Set<() => void>()

const sort = (a: Note, b: Note): number => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt
const set = (next: Note[]): void => {
  list = next
  subs.forEach((f) => f())
}

export async function loadNotes(): Promise<void> {
  loaded = true
  try {
    set(await window.api.call('notes:list'))
  } catch {
    loaded = false
  }
}

export function useNotes(): Note[] {
  const notes = useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => list
  )
  useEffect(() => {
    if (!loaded) void loadNotes()
  }, [])
  return notes
}

export async function saveNote(input: NoteInput): Promise<Note> {
  const n = await window.api.call('notes:save', input)
  set([n, ...list.filter((x) => x.id !== n.id)].sort(sort))
  return n
}

export async function deleteNote(id: string): Promise<void> {
  await window.api.call('notes:delete', id)
  set(list.filter((x) => x.id !== id))
}

/** Petición pendiente para la vista «Notas» (abrir una nota o crear una nueva vinculada a una tarea). */
export interface NoteRequest {
  id?: string
  newForTask?: string
  title?: string
  body?: string
}
let wanted: NoteRequest | null = null
export const requestNote = (r: NoteRequest): void => {
  wanted = r
}
export const takeNoteRequest = (): NoteRequest | null => {
  const r = wanted
  wanted = null
  return r
}

export const NOTE_TEMPLATES: Array<{ id: string; label: string; title: string; body: string }> = [
  { id: 'blank', label: 'En blanco', title: '', body: '' },
  { id: 'meeting', label: 'Reunión', title: 'Reunión', body: '## Asistentes\n- \n\n## Temas\n- \n\n## Acuerdos\n- \n\n## Pendientes\n- ' },
  { id: 'daily', label: 'Daily', title: 'Daily', body: '## Ayer\n- \n\n## Hoy\n- \n\n## Bloqueos\n- ' },
  { id: 'idea', label: 'Idea', title: 'Idea', body: '## Qué\n\n## Por qué\n\n## Siguientes pasos\n- ' }
]
