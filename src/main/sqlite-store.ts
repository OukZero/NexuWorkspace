import fs from 'fs'
import path from 'path'
import { DatabaseSync } from 'node:sqlite'
import type { DB } from '../shared/types'
import { dayKey } from '../shared/util'
import type { Store } from './store'

/** Listas con una fila por elemento. La posición en la lista se guarda en `ord`. */
const LISTS = ['tasks', 'entries', 'groups', 'usage', 'notifications', 'focusBlocks'] as const
/** Chats: una fila por clave (id de la tarea). */
const CHATS = 'chats'
/** Campos sueltos del estado (ajustes, recordatorios, límites…). */
const KV = ['settings', 'lastReminderDay', 'paused', 'commands', 'limits', 'heartbeat', 'lastDailyDay', 'agentTeam'] as const
const TABLES = [...LISTS, CHATS, 'kv'] as const
type Table = (typeof TABLES)[number]

/** Una fila lista para escribir. `json` es el valor serializado; `ord`, la posición. */
type Row = { ord: number; json: string }
type Snapshot = Map<Table, Map<string, Row>>

/** Convierte el estado en filas por tabla. Las listas sin `id` usan su posición como clave. */
function snapshotOf(db: DB): Snapshot {
  const out: Snapshot = new Map()
  for (const t of LISTS) {
    const rows = new Map<string, Row>()
    ;((db[t] ?? []) as unknown[]).forEach((item, ord) => {
      const id = (item as { id?: unknown }).id
      let key = typeof id === 'string' && id !== '' ? id : `#${ord}`
      if (rows.has(key)) key = `#${ord}`
      rows.set(key, { ord, json: JSON.stringify(item) })
    })
    out.set(t, rows)
  }
  const chats = new Map<string, Row>()
  for (const [k, v] of Object.entries(db.chats ?? {})) chats.set(k, { ord: 0, json: JSON.stringify(v) })
  out.set(CHATS, chats)
  const kv = new Map<string, Row>()
  for (const k of KV) {
    const v = db[k]
    if (v !== undefined) kv.set(k, { ord: 0, json: JSON.stringify(v) })
  }
  out.set('kv', kv)
  return out
}

/** Lee todas las tablas y reconstruye el estado; también devuelve las filas para comparar en la próxima escritura. */
function readAll(conn: DatabaseSync): { data: Partial<DB>; snap: Snapshot } {
  const snap: Snapshot = new Map()
  const data: Record<string, unknown> = {}
  for (const t of TABLES) {
    const rows = conn.prepare(`SELECT key, ord, data FROM ${t} ORDER BY ord, rowid`).all() as { key: string; ord: number; data: string }[]
    const m = new Map<string, Row>()
    for (const r of rows) m.set(r.key, { ord: r.ord, json: r.data })
    snap.set(t, m)
    if (t === 'kv') for (const r of rows) data[r.key] = JSON.parse(r.data)
    else if (t === CHATS) data.chats = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.data)]))
    else data[t] = rows.map((r) => JSON.parse(r.data))
  }
  return { data: data as Partial<DB>, snap }
}

/** Escribe solo las filas nuevas o cambiadas y borra las que ya no existen. Debe ir dentro de una transacción. */
function apply(conn: DatabaseSync, next: Snapshot, prev: Snapshot): void {
  for (const t of TABLES) {
    const rows = next.get(t)!
    const old = prev.get(t) ?? new Map<string, Row>()
    const up = conn.prepare(`INSERT INTO ${t} (key, ord, data) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET ord = excluded.ord, data = excluded.data`)
    for (const [k, r] of rows) {
      const p = old.get(k)
      if (!p || p.ord !== r.ord || p.json !== r.json) up.run(k, r.ord, r.json)
    }
    const del = conn.prepare(`DELETE FROM ${t} WHERE key = ?`)
    for (const k of old.keys()) if (!rows.has(k)) del.run(k)
  }
}

const sqlText = (p: string): string => `'${p.replace(/'/g, "''")}'`

/** Almacén SQLite (`shutoki.db`, módulo `node:sqlite` integrado en Electron). */
export function sqliteStore(userDataDir: string): Store {
  const file = path.join(userDataDir, 'shutoki.db')
  const bdir = path.join(userDataDir, 'backups')
  const conn = new DatabaseSync(file)
  conn.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
  for (const t of TABLES) conn.exec(`CREATE TABLE IF NOT EXISTS ${t} (key TEXT PRIMARY KEY, ord INTEGER NOT NULL, data TEXT NOT NULL)`)

  // sin ajustes guardados no hay datos: primera ejecución o migración que no llegó a completarse
  const isNew = (conn.prepare('SELECT count(*) AS n FROM kv').get() as { n: number }).n === 0
  let cache = readAll(conn).snap

  return {
    location: () => file,
    backupsDir: () => bdir,
    isNew: () => isNew,
    read: () => {
      const r = readAll(conn)
      cache = r.snap
      return r.data
    },
    write(db) {
      const next = snapshotOf(db)
      conn.exec('BEGIN IMMEDIATE')
      try {
        apply(conn, next, cache)
        conn.exec('COMMIT')
      } catch (e) {
        conn.exec('ROLLBACK')
        throw e
      }
      cache = next
      // copia de seguridad diaria
      const bfile = path.join(bdir, `shutoki-${dayKey(new Date())}.db`)
      if (!fs.existsSync(bfile)) {
        fs.mkdirSync(bdir, { recursive: true })
        conn.exec(`VACUUM INTO ${sqlText(bfile)}`)
      }
    },
    snapshot(label) {
      conn.exec(`VACUUM INTO ${sqlText(path.join(userDataDir, `shutoki.${label}-${Date.now()}.db`))}`)
    }
  }
}
