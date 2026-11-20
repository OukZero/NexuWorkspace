import { api } from '../../api'
import { commit, getDb, uid } from '../../db'
import { gitCommits } from '../dev/launch'
import { exportExcel } from './excel'
import * as redmine from './redmine'
import { activeEntry, startTimer, stopActive } from './timer'

/** Timer, horas (entradas), borrador del día, Redmine y exportación a Excel. */
export function registerTimeIpc(): void {
  api('timer:start', (taskId) => {
    startTimer(taskId)
    commit()
  })
  api('timer:stop', () => {
    stopActive()
    getDb().paused = null
    commit()
  })
  api('timer:pause', () => {
    const e = activeEntry()
    if (!e) return
    stopActive()
    getDb().paused = e.taskId
    commit()
  })
  api('timer:resume', () => {
    const db = getDb()
    if (db.paused && db.tasks.some((t) => t.id === db.paused)) startTimer(db.paused)
    db.paused = null
    commit()
  })

  api('entry:update', (e) => {
    const db = getDb()
    const i = db.entries.findIndex((x) => x.id === e.id)
    if (i >= 0) db.entries[i] = { ...db.entries[i], ...e }
    commit()
  })
  api('entry:delete', (id) => {
    const db = getDb()
    db.entries = db.entries.filter((e) => e.id !== id)
    commit()
  })
  api('entry:add', (e) => {
    getDb().entries.push({ id: uid(), note: '', ...e })
    commit()
  })

  // rellena la nota de las entradas vacías del día con los commits del proyecto
  api('draft:fillNotes', async (day) => {
    const db = getDb()
    const from = new Date(day + 'T00:00:00').getTime()
    let filled = 0
    const cache: Record<string, string[]> = {}
    for (const e of db.entries) {
      if (e.note || e.start < from || e.start >= from + 86400000) continue
      const folder = db.tasks.find((t) => t.id === e.taskId)?.folder
      if (!folder) continue
      cache[folder] ??= await gitCommits(folder, day)
      if (!cache[folder].length) continue
      e.note = cache[folder].slice(0, 5).join('; ')
      filled++
    }
    if (filled) commit()
    return filled
  })

  api('redmine:lines', (day) => redmine.lines(day))
  api('redmine:draft', (day, key, draft) => redmine.saveDraft(day, key, draft))
  api('redmine:aiComment', (day, key) => redmine.aiComment(day, key))
  api('redmine:login', () => redmine.openLogin())
  api('redmine:days', (from, to) => redmine.days(from, to))
  api('redmine:send', (day, keys, hours, acts) => redmine.send(day, keys, hours, acts))
  api('redmine:catalog', () => redmine.loadCatalog())

  api('excel:export', (from, to) => exportExcel(from, to))
}
