import { dialog, ipcMain, shell } from 'electron'
import fs from 'fs'
import { dayKey, pad } from '../shared/util'
import type { DB, IpcChannels, Task } from '../shared/types'
import * as attachments from './attachments'
import * as chat from './chat'
import * as git from './git'
import * as forge from './forge'
import { buildContext, expandVars, taskById, withContext } from './context'
import { startReview } from './review'
import * as sessions from './sessions'
import { backupsDir, commit, getDb, replaceDb, uid } from './db'
import { exportExcel } from './excel'
import { gitCommits, openClaude, openLogin, openTerminalHere, openVSCode, renderPrompt } from './launch'
import { createPty, killPty, killPtysOf, resizePty, writePty } from './pty'
import { applyLoginItem } from './tray'
import { deleteMockup, exportMockup, listMockups, revealMockups } from './mockups'
import * as files from './files'
import { clearAll, markRead } from './notify'
import * as redmine from './redmine'
import { generateRecurring } from './scheduler'
import * as telegram from './telegram'
import { askClaude, summarizeConversation } from './summary'
import { activeEntry, startTimer, stopActive } from './timer'
import { getMain, showWin } from './windows'

type Handler<K extends keyof IpcChannels> = (...args: IpcChannels[K]['args']) => IpcChannels[K]['ret'] | Promise<IpcChannels[K]['ret']>

function api<K extends keyof IpcChannels>(name: K, fn: Handler<K>): void {
  ipcMain.handle(name, async (_e, ...args: unknown[]) => {
    try {
      return { ok: true, data: await fn(...(args as IpcChannels[K]['args'])) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}

const findTask = (id: string): Task => {
  const t = getDb().tasks.find((x) => x.id === id)
  if (!t) throw new Error('Tarea no encontrada')
  return t
}

const stamp = (): string => {
  const d = new Date()
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const summarizing = new Set<string>()

export function registerIpc(): void {
  api('state', () => getDb())

  // ---------- tareas ----------
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
    commit()
  })

  api('task:prompt', (id) => renderPrompt(findTask(id)))

  // ---------- timer ----------
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

  // ---------- lanzadores ----------
  api('win:restore', () => showWin())
  api('claude:login', () => openLogin())
  api('claude:open', (taskId) => {
    openClaude(findTask(taskId))
    if (activeEntry()?.taskId !== taskId) startTimer(taskId)
    commit()
  })
  api('vscode:open', (folder) => openVSCode(folder))
  api('folder:pick', async () => {
    const main = getMain()
    const opts = { properties: ['openDirectory' as const] }
    const r = main ? await dialog.showOpenDialog(main, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? null : r.filePaths[0]
  })

  // ---------- chat ----------
  // las conversaciones se identifican por su propio id (una tarea puede tener varias)
  api('chat:new', (taskId, kind) => chat.createConversation(taskId, kind))

  // ---------- pestaña Diseño ----------
  api('mockup:list', (taskId) => listMockups(taskId))
  api('mockup:delete', (taskId, name) => deleteMockup(taskId, name))
  api('mockup:export', (taskId, name, format, width) => exportMockup(taskId, name, format, width))
  api('mockup:reveal', (taskId) => revealMockups(taskId))
  api('attach:pick', (convId) => attachments.pick(convId))
  api('attach:save', (convId, name, data) => attachments.saveBytes(convId, name, data))
  api('attach:preview', (p) => attachments.preview(p))
  api('chat:send', async (convId, rawText, files, ctx): Promise<true> => {
    const c = getDb().chats[convId]
    // los comandos / (p. ej. /compact) viajan sin contexto; las variables de plantilla se rellenan con los datos de la tarea
    if (c && !rawText.trimStart().startsWith('/')) {
      const task = findTask(c.taskId)
      const text = await expandVars(task, rawText)
      const preview = ctx?.kinds.length ? await buildContext(task, ctx) : null
      if (preview?.text || text !== rawText) {
        chat.send(convId, text, files, { model: preview ? withContext(preview, text) : text, labels: preview?.labels ?? [] })
        return true
      }
    }
    chat.send(convId, rawText, files)
    return true // aceptado (el renderer restaura el input si la llamada falla)
  })
  api('chat:context', async (taskId, kinds) => buildContext(taskById(taskId), { kinds }))
  api('review:start', (taskId, dir) => startReview(taskId, dir))
  api('session:note', (convId) => sessions.createNote(convId))
  api('session:delete', (taskId, noteId) => sessions.deleteNote(taskId, noteId))
  api('session:toSubtask', (taskId, text) => sessions.pendingToSubtask(taskId, text))
  api('chat:cancel', (convId) => chat.cancel(convId))
  api('chat:permit', (convId, id, choice) => chat.permit(convId, id, choice))
  api('chat:config', (convId, cfg) => chat.configure(convId, cfg))
  api('chat:reset', (convId) => chat.reset(convId))
  api('chat:close', (convId) => {
    const c = getDb().chats[convId]
    if (!c) return
    c.closed = true
    commit()
    // nota de sesión automática (en segundo plano: cerrar la pestaña no espera a la IA)
    if (getDb().settings.autoSessionNotes !== false && !c.running && c.kind !== 'design' && sessions.hasNewWork(c)) void sessions.createNote(convId).catch(() => undefined)
  })
  api('chat:reopen', (convId) => {
    const c = getDb().chats[convId]
    if (!c) return
    c.closed = false
    commit()
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

  // Resume la conversación (solo lo nuevo desde el último resumen) y lo agrega a "Lo realizado" de la tarea
  api('chat:summarize', async (convId) => {
    const db = getDb()
    const c = db.chats[convId]
    if (!c) throw new Error('No hay conversación para resumir.')
    const t = findTask(c.taskId)
    if (c.running) throw new Error('Espera a que Claude termine de responder.')
    if (summarizing.has(convId)) throw new Error('Ya se está generando el resumen.')
    const from = c.summarizedCount || 0
    const upto = c.messages.length
    const msgs = c.messages.slice(from).filter((m) => m.role === 'user' || m.role === 'assistant')
    if (!msgs.length) throw new Error('No hay mensajes nuevos desde el último resumen.')
    const since = c.messages[from]?.ts || 0
    const files = [...new Set(c.activity.filter((a) => a.kind === 'edit' && a.status !== 'error' && a.ts >= since).map((a) => a.target))]
    summarizing.add(convId)
    try {
      const r = await summarizeConversation({ messages: msgs, files, claudeCmd: db.settings.claudeCmd })
      const task = db.tasks.find((x) => x.id === t.id)
      if (!task) throw new Error('La tarea ya no existe.')
      const block = `[${stamp()}]\n${r.text}`
      task.workDone = task.workDone ? `${task.workDone.trimEnd()}\n\n${block}` : block
      c.summarizedCount = upto // si el chat se reinició mientras tanto, c es un objeto descartado y no afecta
      commit()
      return r
    } finally {
      summarizing.delete(convId)
    }
  })

  // ---------- horas ----------
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
  api('files:roots', (taskId) => files.roots(taskId))
  api('files:list', (taskId, root, rel) => files.list(taskId, root, rel))
  api('files:read', (taskId, root, rel) => files.read(taskId, root, rel))
  api('files:find', (taskId, root, q) => files.find(taskId, root, q))
  api('notif:read', (id) => markRead(id))
  api('notif:clear', () => clearAll())
  api('telegram:status', () => telegram.getStatus())
  api('telegram:save', (c) => {
    const s = getDb().settings
    const token = c.token.trim()
    if (token !== (s.telegramToken ?? '')) delete s.telegramChat // otro bot: hay que vincular de nuevo
    s.telegramToken = token
    s.telegramOn = c.on && !!token
    s.telegramDetails = c.details
    commit()
    telegram.restart()
    return telegram.getStatus()
  })
  api('telegram:link', () => telegram.newLinkCode())
  api('telegram:unlink', () => {
    telegram.unlink()
    return telegram.getStatus()
  })
  api('telegram:test', () => telegram.test())
  api('redmine:lines', (day) => redmine.lines(day))
  api('redmine:login', () => redmine.openLogin())
  api('redmine:days', (from, to) => redmine.days(from, to))
  api('redmine:send', (day, keys, hours, acts) => redmine.send(day, keys, hours, acts))
  api('redmine:catalog', () => redmine.loadCatalog())
  api('settings:save', (s) => {
    const db = getDb()
    db.settings = { ...db.settings, ...s }
    commit()
    applyLoginItem()
  })

  // ---------- terminal ----------
  api('terminal:open', (taskId, sessionId) => openTerminalHere(findTask(taskId), sessionId))
  api('pty:create', (taskId, cols, rows, sessionId) => createPty(findTask(taskId), cols, rows, sessionId))
  api('pty:write', (id, data) => writePty(id, data))
  api('pty:resize', (id, cols, rows) => resizePty(id, cols, rows))
  api('pty:kill', (id) => killPty(id))

  // ---------- control de Git ----------
  api('git:repos', (taskId) => git.repos(findTask(taskId)))
  api('git:init', (dir) => git.init(dir))
  api('git:status', (dir) => git.status(dir))
  api('git:diff', (dir, file, kind) => git.diff(dir, file, kind))
  api('git:stage', (dir, paths) => git.stage(dir, paths))
  api('git:unstage', (dir, paths) => git.unstage(dir, paths))
  api('git:discard', (dir, tracked, untracked) => git.discard(dir, tracked, untracked))
  api('git:commit', (dir, message) => git.commit(dir, message))
  api('git:message', (dir) => git.commitMessage(dir))
  api('git:branches', (dir) => git.branches(dir))
  api('git:checkout', (dir, name, create) => git.checkout(dir, name, create))
  api('git:sync', (dir, op) => git.sync(dir, op))
  api('url:open', async (url) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Solo se pueden abrir enlaces http(s).')
    await shell.openExternal(url)
  })
  api('git:remote', (dir) => forge.remoteInfo(dir))
  api('git:push', (dir, taskId) => forge.pushWithPr(dir, taskId))
  api('git:prText', (dir, taskId) => forge.prText(dir, taskId))
  api('issue:list', (dir) => forge.listIssues(dir))
  api('issue:create', (dir, title, body, labels) => forge.createIssue(dir, title, body, labels))
  api('issue:branch', (taskId, dir, n) => forge.branchFromIssue(taskId, dir, n))
  api('issue:link', (taskId, issue) => forge.linkIssue(taskId, issue))
  api('task:branch', (taskId, dir, name) => forge.branchForTask(taskId, dir, name))
  api('git:log', (dir, n) => git.log(dir, n))
  api('git:show', (dir, hash) => git.show(dir, hash))

  // ---------- daily: Claude redacta el borrador ----------
  api('daily:polish', async (draft) => {
    const prompt =
      'Redacta un daily de equipo (stand-up) en español, en primera persona, claro y breve, a partir de este borrador. ' +
      'Mantén los hechos y las cifras tal cual, sin inventar nada. Formato con tres secciones: «Ayer», «Hoy» y «Bloqueos», cada una con viñetas "- " cortas ' +
      '(agrupa lo parecido, quita el detalle técnico innecesario). Responde SOLO con el daily, sin introducción.\n\nBORRADOR:\n' +
      draft
    return (await askClaude(prompt, getDb().settings.claudeCmd, 120000)).trim()
  })

  // ---------- exportar / importar / copias ----------
  api('data:export', async () => {
    const opts = { defaultPath: `shutoki-datos-${dayKey(new Date())}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] }
    const main = getMain()
    const r = main ? await dialog.showSaveDialog(main, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return null
    fs.writeFileSync(r.filePath, JSON.stringify(getDb(), null, 2))
    shell.showItemInFolder(r.filePath)
    return r.filePath
  })
  api('data:import', async () => {
    const opts = { properties: ['openFile' as const], filters: [{ name: 'JSON', extensions: ['json'] }] }
    const main = getMain()
    const r = main ? await dialog.showOpenDialog(main, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || !r.filePaths[0]) return false
    replaceDb(JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')) as Partial<DB>)
    return true
  })
  api('data:backups', () => {
    fs.mkdirSync(backupsDir(), { recursive: true })
    void shell.openPath(backupsDir())
  })

  // deshacer: devuelve tareas, horas o conversaciones borradas (si no existen ya)
  api('undo:restore', (p) => {
    const db = getDb()
    for (const t of p.tasks ?? []) if (!db.tasks.some((x) => x.id === t.id)) db.tasks.push(t)
    for (const e of p.entries ?? []) if (!db.entries.some((x) => x.id === e.id)) db.entries.push(e)
    for (const [id, c] of Object.entries(p.chats ?? {})) if (!db.chats[id]) db.chats[id] = { ...c, running: false }
    commit()
  })

  api('git:commits', async (day) => {
    const folders = [...new Set(getDb().tasks.map((t) => t.folder).filter(Boolean))]
    const out: Record<string, string[]> = {}
    for (const f of folders) {
      const c = await gitCommits(f, day)
      if (c.length) out[f] = c
    }
    return out
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

  api('excel:export', (from, to) => exportExcel(from, to))
}


