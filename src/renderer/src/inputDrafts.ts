import type { Attachment } from '../../shared/types'

/**
 * Lo que hay escrito en el cuadro de cada conversación. El chat se vuelve a montar al cambiar de conversación,
 * de modo (Diseño, Git…) o de pantalla; sin esto el texto se perdía. El texto sobrevive también al reiniciar la app.
 */
const KEY = 'shutoki.inputDrafts'
const files = new Map<string, Attachment[]>() // los adjuntos solo viven mientras la app está abierta

function load(): Map<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Record<string, string> | null
    return new Map(Object.entries(v && typeof v === 'object' ? v : {}).filter(([, t]) => typeof t === 'string' && t))
  } catch {
    return new Map()
  }
}

const texts = load()

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(texts)))
  } catch {
    /* sin storage */
  }
}

export const getInputDraft = (convId: string): string => texts.get(convId) ?? ''

export function saveInputDraft(convId: string, text: string): void {
  if (text) texts.set(convId, text)
  else texts.delete(convId)
  persist()
}

export const getFilesDraft = (convId: string): Attachment[] => files.get(convId) ?? []

export function saveFilesDraft(convId: string, list: Attachment[]): void {
  if (list.length) files.set(convId, list)
  else files.delete(convId)
}
