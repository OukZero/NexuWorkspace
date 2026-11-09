import type { ContextKind } from '../../shared/types'

/** Borrador que otra vista deja para el chat de una tarea (texto y contexto a adjuntar). El chat lo recoge al abrirse o en cuanto aparece. */

export interface ChatDraft {
  taskId: string
  text: string
  kinds: ContextKind[]
}

let draft: ChatDraft | null = null
const subs = new Set<() => void>()

export function queueChatDraft(d: ChatDraft): void {
  draft = d
  subs.forEach((f) => f())
}

/** Devuelve el borrador pendiente de la tarea y lo consume; null si no hay. */
export function takeChatDraft(taskId: string): ChatDraft | null {
  if (!draft || draft.taskId !== taskId) return null
  const d = draft
  draft = null
  return d
}

export function onChatDraft(cb: () => void): () => void {
  subs.add(cb)
  return () => subs.delete(cb)
}
