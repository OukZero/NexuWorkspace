import { api } from '../../api'
import { deleteNote, listNotes, saveNote, saveNoteImage } from './service'

export function registerNotesIpc(): void {
  api('notes:list', () => listNotes())
  api('notes:save', (n) => saveNote(n))
  api('notes:delete', (id) => deleteNote(id))
  api('notes:image', (id, mime, data) => saveNoteImage(id, mime, data))
}
