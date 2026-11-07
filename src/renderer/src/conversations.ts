import type { Chat, DB } from '../../shared/types'
import { clip } from '../../shared/util'

export interface Conv {
  id: string
  chat: Chat
}

/** Conversación de la pestaña Diseño de la tarea (una sola, no aparece entre las normales). */
export function designConv(db: DB, taskId: string): Conv | undefined {
  const e = Object.entries(db.chats).find(([, c]) => c.taskId === taskId && c.kind === 'design')
  return e ? { id: e[0], chat: e[1] } : undefined
}

/** Conversaciones abiertas (no cerradas) de una tarea, de la más antigua a la más reciente. */
export function openConvs(db: DB, taskId: string): Conv[] {
  return Object.entries(db.chats)
    .filter(([, c]) => c.taskId === taskId && !c.closed && (!c.kind || c.kind === 'review'))
    .map(([id, chat]) => ({ id, chat }))
    .sort((a, b) => a.chat.createdAt - b.chat.createdAt)
}

/** Conversaciones cerradas de una tarea, la más reciente primero. */
export function closedConvs(db: DB, taskId: string): Conv[] {
  return Object.entries(db.chats)
    .filter(([, c]) => c.taskId === taskId && c.closed && (!c.kind || c.kind === 'review'))
    .map(([id, chat]) => ({ id, chat }))
    .sort((a, b) => b.chat.createdAt - a.chat.createdAt)
}

/** Nombre de la pestaña: el título (primer mensaje) o un texto por defecto. */
export function convLabel(c: Chat): string {
  const first = c.messages.find((m) => m.role === 'user' && !m.text.startsWith('/'))
  return c.title || (first ? clip(first.text.replace(/\s+/g, ' '), 28) : 'Conversación nueva')
}

/** Hay alguna respuesta en curso en las conversaciones de la tarea. */
export const taskRunning = (db: DB, taskId: string): boolean => Object.values(db.chats).some((c) => c.taskId === taskId && c.running)
