import { contextBridge, ipcRenderer } from 'electron'
import type { Api, DB, IpcChannels, Unsubscribe } from '../shared/types'

type Reply<T> = { ok: true; data: T } | { ok: false; error: string }

const on = <T>(channel: string, cb: (payload: T) => void): Unsubscribe => {
  const handler = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: Api = {
  async call<K extends keyof IpcChannels>(name: K, ...args: IpcChannels[K]['args']) {
    const r = (await ipcRenderer.invoke(name, ...args)) as Reply<IpcChannels[K]['ret']>
    if (!r.ok) throw new Error(r.error)
    return r.data
  },
  onState: (cb) => on<DB>('state', cb),
  onDelta: (cb) => on('chat:delta', cb),
  onPtyData: (cb) => on('pty:data', cb),
  onPtyExit: (cb) => on('pty:exit', cb),
  onQuickAdd: (cb) => on<void>('quickadd', () => cb()),
  onGoto: (cb) => on<string>('goto', cb)
}

contextBridge.exposeInMainWorld('api', api)
