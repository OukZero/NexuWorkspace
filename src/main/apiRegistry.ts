import type { IpcChannels } from '../shared/types'

/**
 * Registro de los manejadores IPC para poder llamarlos desde el propio proceso principal (p. ej. el asistente por voz,
 * que actúa sin ventana). Es el mismo código que usa la interfaz, así que las acciones se comportan igual.
 */

type AnyHandler = (...args: never[]) => unknown
const handlers = new Map<string, AnyHandler>()

export function registerApi(name: string, fn: AnyHandler): void {
  handlers.set(name, fn)
}

export async function callApi<K extends keyof IpcChannels>(name: K, ...args: IpcChannels[K]['args']): Promise<IpcChannels[K]['ret']> {
  const fn = handlers.get(name)
  if (!fn) throw new Error(`Acción no disponible: ${name}`)
  return (await (fn as (...a: unknown[]) => unknown)(...args)) as IpcChannels[K]['ret']
}
