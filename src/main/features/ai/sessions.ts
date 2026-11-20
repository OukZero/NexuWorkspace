// Notas de sesión: al cerrar una conversación se guarda en la tarea qué se hizo, qué se decidió y qué quedó pendiente.
// Las notas se anexan como contexto al empezar otra conversación, para retomar la tarea días después sin explicarla de nuevo.
import type { Chat, SessionNote } from '../../../shared/types'
import { clip } from '../../../shared/util'
import { commit, getDb, uid } from '../../db'
import { askClaude } from './summary'
import { tasksRepo } from '../../data/repos'

const MAX_NOTES = 30
const running = new Set<string>()

interface Parsed {
  title?: string
  done?: unknown
  decisions?: unknown
  pending?: unknown
}

const list = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string')
        .map((x) => clip(x.replace(/\s+/g, ' ').trim(), 240))
        .filter(Boolean)
        .slice(0, max)
    : []

/** El modelo a veces rodea el JSON con texto o con un bloque de código. */
function parseJson(raw: string): Parsed | null {
  const m = /\{[\s\S]*\}/.exec(raw.replace(/```(?:json)?/g, ''))
  if (!m) return null
  try {
    return JSON.parse(m[0]) as Parsed
  } catch {
    return null
  }
}

/** ¿Hay algo nuevo que registrar desde la última nota de esta conversación? */
export function hasNewWork(chat: Chat): boolean {
  const from = chat.noteAt ?? 0
  const fresh = chat.messages.slice(from).filter((m) => m.role === 'user' || m.role === 'assistant')
  return fresh.some((m) => m.role === 'user') && fresh.some((m) => m.role === 'assistant')
}

/** Genera y guarda la nota de la conversación (solo con lo ocurrido desde la nota anterior). null si no hay nada nuevo. */
export async function createNote(convId: string): Promise<SessionNote | null> {
  const db = getDb()
  const chat = db.chats[convId]
  if (!chat) throw new Error('Conversación no encontrada')
  if (chat.running) throw new Error('Espera a que termine la respuesta.')
  if (!hasNewWork(chat)) return null
  if (running.has(convId)) throw new Error('Ya se está generando la nota de esta sesión.')
  running.add(convId)
  try {
    const from = chat.noteAt ?? 0
    const upto = chat.messages.length
    const msgs = chat.messages.slice(from).filter((m) => m.role === 'user' || m.role === 'assistant')
    const since = chat.messages[from]?.ts ?? 0
    const files = [...new Set(chat.activity.filter((a) => a.kind === 'edit' && a.status !== 'error' && a.ts >= since).map((a) => a.target))]
    const task = db.tasks.find((t) => t.id === chat.taskId)
    if (!task) throw new Error('La tarea ya no existe.')

    let text = ''
    for (const l of msgs.map((m) => (m.role === 'user' ? 'USUARIO: ' : 'ASISTENTE: ') + clip(m.text.trim(), 1200)).reverse()) {
      if ((text + l).length > 16000) break
      text = l + '\n\n' + text // prioriza lo más reciente
    }
    const prompt =
      'Escribe una NOTA DE SESIÓN de esta conversación de programación, para que quien retome la tarea días después (tú mismo, sin memoria) sepa dónde quedó. ' +
      'Responde SOLO con un objeto JSON válido, sin texto alrededor ni bloques de código, con estas claves:\n' +
      '{"title": "máx. 60 caracteres, qué se trabajó",\n "done": ["cosas concretas ya hechas, en pasado"],\n "decisions": ["decisiones tomadas y su porqué: enfoque elegido, alternativas descartadas"],\n "pending": ["lo que falta o quedó a medias, en imperativo, accionable"]}\n' +
      'Máximo 6 elementos por lista, una frase corta cada uno, en español, sin relleno. Listas vacías si no hay nada. No inventes.\n\n' +
      `TAREA: ${task.title}\n\nCONVERSACIÓN:\n${text}` +
      (files.length ? `\n\nARCHIVOS MODIFICADOS: ${files.slice(0, 40).join(', ')}` : '')

    let parsed: Parsed | null = null
    try {
      parsed = parseJson(await askClaude(prompt, db.settings.claudeCmd, 150000))
    } catch {
      /* sin IA: nota mínima con lo que se sabe */
    }
    const asked = msgs.filter((m) => m.role === 'user').map((m) => clip(m.text.replace(/\s+/g, ' ').trim(), 160))
    const note: SessionNote = {
      id: uid(),
      ts: Date.now(),
      convId,
      title: clip(parsed?.title?.trim() || chat.title || asked[0] || 'Sesión de trabajo', 70),
      done: parsed ? list(parsed.done, 6) : asked.slice(0, 5),
      decisions: parsed ? list(parsed.decisions, 6) : [],
      pending: parsed ? list(parsed.pending, 6) : [],
      files: files.slice(0, 40),
      ...(task.branch ? { branch: task.branch } : {})
    }
    if (!note.done.length && !note.decisions.length && !note.pending.length && !note.files.length) return null
    // la conversación o la tarea pueden haber cambiado mientras la IA respondía
    const liveTask = tasksRepo.find(task.id)
    const liveChat = getDb().chats[convId]
    if (!liveTask) return null
    liveTask.sessions = [...(liveTask.sessions ?? []), note].slice(-MAX_NOTES)
    if (liveChat === chat) chat.noteAt = upto
    commit()
    return note
  } finally {
    running.delete(convId)
  }
}

export function deleteNote(taskId: string, noteId: string): void {
  const task = tasksRepo.find(taskId)
  if (!task) throw new Error('Tarea no encontrada')
  task.sessions = (task.sessions ?? []).filter((n) => n.id !== noteId)
  commit()
}

/** Convierte un pendiente de una nota en subtarea de la tarea (y lo quita de la nota). */
export function pendingToSubtask(taskId: string, text: string): void {
  const task = tasksRepo.find(taskId)
  if (!task) throw new Error('Tarea no encontrada')
  const t = text.trim()
  if (!t) return
  if (!(task.subtasks ?? []).some((s) => s.text === t)) task.subtasks = [...(task.subtasks ?? []), { id: uid(), text: t, done: false }]
  for (const n of task.sessions ?? []) n.pending = n.pending.filter((p) => p !== t)
  commit()
}

