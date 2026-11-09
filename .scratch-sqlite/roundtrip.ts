import fs from 'fs'
import path from 'path'
import { sqliteStore } from '../src/main/sqlite-store'

const dir = path.resolve(__dirname, 'data')
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(dir, { recursive: true })

// datos sintéticos con la forma real de DB
const tasks = Array.from({ length: 300 }, (_, i) => ({ id: 't' + i, title: 'Tarea ' + i, createdAt: 1700000000000 + i }))
const entries = Array.from({ length: 2000 }, (_, i) => ({ id: 'e' + i, taskId: 't' + (i % 300), minutes: i % 90 }))
const usage = Array.from({ length: 500 }, (_, i) => ({ taskId: 't' + (i % 300), tokens: i })) // sin id: clave por posición
const chats: Record<string, unknown> = {}
for (let i = 0; i < 300; i += 3) chats['t' + i] = { taskId: 't' + i, createdAt: 1, messages: Array.from({ length: 20 }, (_, m) => ({ role: 'user', text: 'msg ' + m })) }
const db = { tasks, entries, groups: [{ id: 'g1', name: 'G' }], usage, notifications: [], focusBlocks: [], chats, settings: { openMode: 'chat', targetHours: 8 }, lastReminderDay: '', paused: null }

const s = sqliteStore(dir)
const check = (label: string, ok: boolean) => console.log((ok ? 'OK  ' : 'FAIL') + ' ' + label)
check('isNew on fresh db', s.isNew())
s.write(db as any)
const back = sqliteStore(dir).read() as any
const eq = (f: string) => JSON.stringify((db as any)[f]) === JSON.stringify(back[f])
check('roundtrip all fields', ['tasks', 'entries', 'groups', 'usage', 'notifications', 'focusBlocks', 'chats', 'settings', 'lastReminderDay', 'paused'].every(eq))
check('isNew false after write', !sqliteStore(dir).isNew())

// edición: renombrar una tarea, borrar una entrada, quitar un chat, reordenar tareas
const s2 = sqliteStore(dir)
const d = s2.read() as any
d.tasks[0].title = 'editada'
d.entries = d.entries.slice(1)
delete d.chats['t0']
d.tasks.reverse()
s2.write(d)
const after = sqliteStore(dir).read() as any
check('edit persisted', after.tasks.find((t: any) => t.id === 't0').title === 'editada' && after.tasks[299].id === 't0')
check('deleted entry gone', after.entries.length === 1999 && after.entries[0].id === 'e1')
check('deleted chat gone', !('t0' in after.chats))

// escritura con un solo cambio vs. serializar todo
const N = 20
let t0 = performance.now()
for (let i = 0; i < N; i++) { d.lastReminderDay = 'x' + i; s2.write(d) }
const sqlMs = (performance.now() - t0) / N
t0 = performance.now()
for (let i = 0; i < N; i++) JSON.stringify(d, null, 2)
const jsonMs = (performance.now() - t0) / N
console.log(`tiempo medio: sqlite (1 cambio) ${sqlMs.toFixed(2)} ms | JSON.stringify completo ${jsonMs.toFixed(2)} ms | tamaño JSON ${(JSON.stringify(d).length / 1024).toFixed(0)} KB`)

s2.snapshot('test')
check('snapshot created', fs.readdirSync(dir).some((f) => f.startsWith('shutoki.test-')))
check('daily backup created', fs.readdirSync(path.join(dir, 'backups')).length === 1)
