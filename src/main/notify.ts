import { Notification } from 'electron'
import type { AppNotification, NotificationKind } from '../shared/types'
import { commit, getDb, uid } from './db'
import { forward } from './telegram'
import { emit, getMain, showWin } from './windows'

const MAX = 100

interface Opts {
  kind: NotificationKind
  title: string
  body: string
  /** Destino al hacer click (vista o «chat:<id>»). */
  goto?: string
  /** Mostrar además el aviso del sistema (por defecto sí). Se guarda en el centro de notificaciones de todos modos. */
  os?: boolean
  /** Parpadeo en la barra de tareas junto con el aviso. */
  flash?: boolean
  /** Reenviar también a Telegram (por defecto sí; los permisos van con botones por otra vía). */
  tg?: boolean
}

/** Guarda la notificación en el centro de notificaciones (campanita) y, si se pide, muestra el aviso del sistema. */
export function notify({ kind, title, body, goto, os = true, flash = false, tg = true }: Opts): void {
  const db = getDb()
  const item: AppNotification = { id: uid(), ts: Date.now(), kind, title, body, ...(goto ? { goto } : {}), read: false }
  db.notifications = [item, ...(db.notifications ?? [])].slice(0, MAX)
  commit()
  if (tg) forward(item)
  if (!os) return
  const n = new Notification({ title, body })
  n.on('click', () => {
    markRead(item.id)
    showWin()
    if (goto) emit('goto', goto)
  })
  n.show()
  if (flash) getMain()?.flashFrame(true)
}

/** Marca una notificación (o todas con «all») como leída. */
export function markRead(id: string): void {
  const list = getDb().notifications ?? []
  let changed = false
  for (const n of list) {
    if (!n.read && (id === 'all' || n.id === id)) {
      n.read = true
      changed = true
    }
  }
  if (changed) commit()
}

export function clearAll(): void {
  getDb().notifications = []
  commit()
}
