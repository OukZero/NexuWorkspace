import { Notification, powerMonitor } from 'electron'
import { dayKey } from '../shared/util'
import { commit, getDb, save, uid } from './db'
import { activeEntry, minutesToday, stopActive } from './timer'
import { emit, showWin } from './windows'

// Una tarea con recurrence != none es plantilla. Cada día genera una copia para hoy.
export function generateRecurring(): void {
  const db = getDb()
  const today = new Date()
  const key = dayKey(today)
  const dow = today.getDay() // 0 dom
  let changed = false
  for (const t of [...db.tasks]) {
    const r = t.recurrence
    if (!r || r.type === 'none' || t.archived) continue
    if (t.lastGenerated === key) continue
    const ok =
      r.type === 'daily' ||
      (r.type === 'weekdays' && dow >= 1 && dow <= 5) ||
      (r.type === 'weekly' && (r.days || []).includes(dow))
    t.lastGenerated = key
    changed = true
    if (!ok) continue
    // si la copia anterior sigue abierta, se arrastra a hoy en vez de duplicarla
    const open = db.tasks.find((x) => x.fromTemplate === t.id && x.status !== 'done')
    if (open) {
      if (open.status !== 'doing') open.status = 'today'
      open.carried = (open.carried || 0) + 1
      continue
    }
    db.tasks.push({
      id: uid(),
      title: t.title,
      description: t.description,
      project: t.project,
      client: t.client,
      folder: t.folder,
      priority: t.priority,
      estimateMin: t.estimateMin,
      status: 'today',
      recurrence: { type: 'none' },
      fromTemplate: t.id,
      createdAt: Date.now(),
      doneAt: null
    })
  }
  if (changed) commit()
}

let idleNotified = false
export function checkIdle(): void {
  const db = getDb()
  const e = activeEntry()
  if (!e) {
    idleNotified = false
    return
  }
  const idleSec = powerMonitor.getSystemIdleTime()
  const limit = db.settings.idleMinutes * 60
  if (limit > 0 && idleSec >= limit && !idleNotified) {
    // detenemos el timer descontando el tiempo inactivo
    stopActive(Date.now() - idleSec * 1000)
    db.paused = e.taskId
    idleNotified = true
    commit()
    new Notification({
      title: 'Timer pausado por inactividad',
      body: `Descontamos ${Math.round(idleSec / 60)} min. Reanúdalo cuando vuelvas.`
    }).show()
  }
  if (idleSec < 10) idleNotified = false
}

export function checkReminder(): void {
  const db = getDb()
  const now = new Date()
  const key = dayKey(now)
  const [h, m] = db.settings.reminderTime.split(':').map(Number)
  const reached = now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)
  if (!reached || db.lastReminderDay === key) return
  const dow = now.getDay()
  if (dow === 0 || dow === 6) return
  db.lastReminderDay = key
  save()
  const hours = minutesToday() / 60
  const pending = db.tasks.filter((t) => t.status === 'today' || t.status === 'doing').length
  const missing = db.settings.targetHours - hours
  const n = new Notification({
    title: 'Cierre del día',
    body:
      (missing > 0
        ? `Llevas ${hours.toFixed(1)} h de ${db.settings.targetHours} h: te faltan ${missing.toFixed(1)} h por registrar.`
        : `Objetivo cumplido: ${hours.toFixed(1)} h registradas.`) + ` ${pending} tareas pendientes hoy. Abre el borrador del día para revisarlo.`
  })
  n.on('click', () => {
    showWin()
    emit('goto', 'hours')
  })
  n.show()
}

/** Aviso matutino (días hábiles) de que el daily está listo. Si la app se abre muy tarde, ese día se omite. */
export function checkDaily(): void {
  const db = getDb()
  const at = db.settings.dailyTime
  if (!at) return
  const now = new Date()
  const key = dayKey(now)
  if (db.lastDailyDay === key) return
  const [h, m] = at.split(':').map(Number)
  const minutes = now.getHours() * 60 + now.getMinutes() - (h * 60 + m)
  const dow = now.getDay()
  if (minutes < 0 || dow === 0 || dow === 6) return
  db.lastDailyDay = key
  save()
  if (minutes > 180) return
  const n = new Notification({ title: 'Tu daily está listo', body: 'Revisa lo de ayer y lo de hoy, y cópialo para tu equipo.' })
  n.on('click', () => {
    showWin()
    emit('goto', 'daily')
  })
  n.show()
}