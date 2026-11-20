import { api } from '../../api'
import { commit, getDb, uid } from '../../db'
import * as chat from '../ai/chat'
import * as calendar from '../calendar/service'
import { killPtysOf } from '../dev/pty'
import { renderPrompt } from '../dev/launch'
import { unlinkTask } from '../notes/service'
import { generateRecurring } from '../time/scheduler'
import { activeEntry, stopActive } from '../time/timer'
import { tasksRepo } from '../../data/repos'

/** Tareas, grupos de carpetas y deshacer. */
export function registerTasksIpc(): void {
  api('task:save', (t) => {
    const db = getDb()
    const i = t.id ? db.tasks.findIndex((x) => x.id === t.id) : -1
    if (i >= 0) {
      const cur = { ...db.tasks[i], ...t }
      db.tasks[i] = cur
      if (t.status === 'done' && !cur.doneAt) {
        cur.doneAt = Date.now()
        if (activeEntry()?.taskId === cur.id) stopActive()
        if (db.paused === cur.id) db.paused = null
      }
      if (t.status && t.status !== 'done') cur.doneAt = null
    } else {
      db.tasks.push({
        title: '',
        description: '',
        project: '',
        client: '',
        folder: '',
        priority: 'med',
        estimateMin: 0,
        status: 'today',
        recurrence: { type: 'none' },
        createdAt: Date.now(),
        doneAt: null,
        ...t,
        id: t.id ?? uid()
      })
    }
    commit()
    generateRecurring()
  })

  api('task:delete', (id) => {
    const db = getDb()
    if (activeEntry()?.taskId === id) stopActive()
    if (db.paused === id) db.paused = null
    killPtysOf(id)
    for (const [convId, c] of Object.entries(db.chats)) {
      if (c.taskId !== id) continue
      chat.cancel(convId)
      delete db.chats[convId]
    }
    db.tasks = db.tasks.filter((t) => t.id !== id)
    db.entries = db.entries.filter((e) => e.taskId !== id)
    calendar.dropFocusBlocksOf(id)
    unlinkTask(id) // las notas se conservan, solo pierden el vínculo
    commit()
  })

  api('task:prompt', (id) => {
    return renderPrompt(tasksRepo.get(id))
  })

  // ---------- grupos de carpetas ----------
  api('group:save', (g) => {
    const db = getDb()
    const clean = { ...g, name: g.name.trim() || 'Grupo sin nombre', folders: g.folders.filter((f) => f.path.trim()) }
    const i = db.groups.findIndex((x) => x.id === g.id)
    if (i >= 0) db.groups[i] = clean
    else db.groups.push({ ...clean, id: g.id || uid() })
    commit()
  })
  api('group:delete', (id) => {
    const db = getDb()
    db.groups = db.groups.filter((g) => g.id !== id)
    for (const t of db.tasks) if (t.groupIds?.includes(id)) t.groupIds = t.groupIds.filter((x) => x !== id)
    commit()
  })

  // deshacer: devuelve tareas, horas o conversaciones borradas (si no existen ya)
  api('undo:restore', (p) => {
    const db = getDb()
    for (const t of p.tasks ?? []) if (!db.tasks.some((x) => x.id === t.id)) db.tasks.push(t)
    for (const e of p.entries ?? []) if (!db.entries.some((x) => x.id === e.id)) db.entries.push(e)
    for (const [id, c] of Object.entries(p.chats ?? {})) if (!db.chats[id]) db.chats[id] = { ...c, running: false }
    commit()
  })
}
