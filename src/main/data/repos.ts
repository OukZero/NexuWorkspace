import type { Chat, Entry, Task } from '../../shared/types'
import { commit, getDb } from '../db'

/**
 * Repositorios por agregado sobre el estado en memoria (`getDb()`), que `sqlite-store` persiste en una tabla por agregado.
 * Las features piden aquí sus datos en vez de recorrer `getDb().tasks` a mano: así la forma de guardar puede cambiar
 * (p. ej. consultas SQL directas) sin tocar a quien los usa. Tras mutar, llamar a `commit()`.
 */
export const tasksRepo = {
  all: (): Task[] => getDb().tasks,
  find: (id: string | undefined | null): Task | undefined => (id ? getDb().tasks.find((t) => t.id === id) : undefined),
  /** Como `find`, pero falla con un mensaje legible si la tarea no existe. */
  get(id: string): Task {
    const t = tasksRepo.find(id)
    if (!t) throw new Error('Tarea no encontrada')
    return t
  }
}

export const entriesRepo = {
  all: (): Entry[] => getDb().entries,
  find: (id: string): Entry | undefined => getDb().entries.find((e) => e.id === id),
  ofTask: (taskId: string): Entry[] => getDb().entries.filter((e) => e.taskId === taskId),
  removeOfTask(taskId: string): void {
    getDb().entries = getDb().entries.filter((e) => e.taskId !== taskId)
  }
}

export const chatsRepo = {
  get: (convId: string): Chat | undefined => getDb().chats[convId],
  ofTask: (taskId: string): Array<[string, Chat]> => Object.entries(getDb().chats).filter(([, c]) => c.taskId === taskId)
}

export { commit }
