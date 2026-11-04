import type { Entry } from '../shared/types'
import { commit, getDb, uid } from './db'
import { summarize } from './summary'

export const activeEntry = (): Entry | undefined => getDb().entries.find((e) => !e.end)

export function stopActive(at: number = Date.now()): void {
  const e = activeEntry()
  if (!e) return
  e.end = Math.max(e.start, at)
  queueSummary(e.id)
}

// Al cerrar un tramo (pausa, stop, completar, cambio de tarea) resume en segundo plano lo hecho en Claude
function queueSummary(entryId: string): void {
  setTimeout(async () => {
    try {
      const db = getDb()
      const e = db.entries.find((x) => x.id === entryId)
      const t = e && db.tasks.find((x) => x.id === e.taskId)
      if (!e || !e.end || !t || !t.folder || e.end - e.start < 120000) return
      const r = await summarize({ folder: t.folder, from: e.start, to: e.end, mode: db.settings.summaryMode, claudeCmd: db.settings.claudeCmd })
      if (!r) return
      if (!e.note) e.note = r.text
      ;(t.log = t.log || []).push({ ts: e.end, entryId, text: r.text, mode: r.mode })
      commit()
    } catch {
      /* el resumen nunca debe romper el timer */
    }
  }, 2000)
}

export function startTimer(taskId: string): void {
  const db = getDb()
  stopActive()
  db.paused = null
  db.entries.push({ id: uid(), taskId, start: Date.now(), end: null, note: '' })
  const t = db.tasks.find((x) => x.id === taskId)
  if (t && (t.status === 'today' || t.status === 'next')) t.status = 'doing'
}

export function ensureTimer(taskId: string): void {
  if (activeEntry()?.taskId !== taskId) startTimer(taskId)
}

export function minutesToday(): number {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  let ms = 0
  for (const e of getDb().entries) {
    const end = e.end || Date.now()
    const s = Math.max(e.start, start.getTime())
    if (end > s) ms += end - s
  }
  return ms / 60000
}
