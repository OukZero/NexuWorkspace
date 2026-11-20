import { ipcMain } from 'electron'
import type { IpcChannels } from '../shared/types'
import { registerApi } from './apiRegistry'
import { isSignedIn } from './auth'

export type Handler<K extends keyof IpcChannels> = (...args: IpcChannels[K]['args']) => IpcChannels[K]['ret'] | Promise<IpcChannels[K]['ret']>

/** Registra un canal IPC (y lo deja accesible desde main con `callApi`). Lo usan `ipc.ts` y cada feature. */
export function api<K extends keyof IpcChannels>(name: K, fn: Handler<K>): void {
  registerApi(name, fn as never)
  ipcMain.handle(name, async (_e, ...args: unknown[]) => {
    try {
      // sin sesión válida solo responde la autenticación
      if (!name.startsWith('auth:') && !isSignedIn()) throw new Error('Inicia sesión para usar la aplicación.')
      return { ok: true, data: await fn(...(args as IpcChannels[K]['args'])) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
