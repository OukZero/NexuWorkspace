import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'fs'
import { dayKey, pad } from '../shared/util'
import type { DB, IpcChannels, Task } from '../shared/types'
import * as auth from './auth'
import { isSignedIn } from './auth'
import * as attachments from './attachments'
import * as chat from './chat'
import * as git from './git'
import * as ci from './ci'
import * as forge from './forge'
import { buildContext, expandVars, repoDirOf, taskById, withContext } from './context'
import { startReview } from './review'
import * as sessions from './sessions'
import * as updater from './updater'
import * as iso from './isolation'
import * as checks from './checks'
import { applyMini, dockPopout, hideMini, openPopout } from './windows'
import { backupsDir, commit, getDb, replaceDb, uid } from './db'
import { exportExcel } from './excel'
import { gitCommits, launchTask, openClaude, openLogin, openTerminalHere, openVSCode, renderPrompt } from './launch'
import { createPty, killPty, killPtysOf, resizePty, writePty } from './pty'
import { applyLoginItem } from './tray'
import { deleteMockup, exportMockup, listMockups, revealMockups } from './mockups'
import * as files from './files'
import { clearAll, markRead } from './notify'
import * as redmine from './redmine'
import { registerApi } from './apiRegistry'
import * as calendar from './calendar'
import { planAssistant, readAndAnswer } from './assistant'
import { attachGuest, markActive } from './web'
import { deleteNote, listNotes, saveNote, saveNoteImage, unlinkTask } from './notes'
import { appendChunk, deleteMeeting, listMeetings, retryMeeting, startMeeting, stopMeeting, updateMeeting } from './meetings'
import { attachWhatsApp, getBadges, openWhatsApp, setWhatsAppVisible, WSP_SLOT } from './whatsapp'
import { generateRecurring } from './scheduler'
import * as telegram from './telegram'
import * as spotify from './spotify'
import * as skills from './skills'
import { askClaude, summarizeConversation } from './summary'
import { activeEntry, startTimer, stopActive } from './timer'
import { getMain, openSkills, showWin } from './windows'

type Handler<K extends keyof IpcChannels> = (...args: IpcChannels[K]['args']) => IpcChannels[K]['ret'] | Promise<IpcChannels[K]['ret']>

function api<K extends keyof IpcChannels>(name: K, fn: Handler<K>): void {
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
  // ---------- sesión ----------
  api('auth:status', () => auth.getStatus())
  api('auth:signIn', (email, password) => auth.signIn(email, password))
  api('auth:newPassword', (password) => auth.setNewPassword(password))
  api('auth:signOut', () => auth.signOut())
  api('auth:forgot', (email) => auth.forgotPassword(email))
  api('auth:confirmForgot', (email, code, password) => auth.confirmForgotPassword(email, code, password))

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
    calendar.dropFocusBlocksOf(id)
    unlinkTask(id) // las notas se conservan, solo pierden el vínculo
    commit()
  })

  // ---------- calendario y bloques de enfoque ----------
  api('calendar:status', () => calendar.getStatus())
  api('calendar:save', (c) => calendar.saveSettings(c))
  api('calendar:connect', () => calendar.connect())
  api('calendar:disconnect', () => calendar.disconnect())
  api('calendar:events', (force) => calendar.listEvents(!!force))
  api('focus:save', (b) => calendar.saveFocusBlock(b))
  api('focus:delete', (id) => calendar.deleteFocusBlock(id))

  // ---------- notas ----------
  api('notes:list', () => listNotes())
  api('notes:save', (n) => saveNote(n))
  api('notes:delete', (id) => deleteNote(id))
  api('notes:image', (id, mime, data) => saveNoteImage(id, mime, data))
  api('meetings:list', () => listMeetings())
  api('meetings:start', (title, taskId) => startMeeting(title, taskId))
  api('meetings:chunk', (id, data) => appendChunk(id, data))
  api('meetings:stop', (id, ms) => stopMeeting(id, ms))
  api('meetings:update', (id, p) => updateMeeting(id, p))
  api('meetings:summarize', (id) => retryMeeting(id, 'summary'))
  api('meetings:retry', (id) => retryMeeting(id, 'auto'))
  api('meetings:delete', (id) => deleteMeeting(id))

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
  api('mini:hide', () => hideMini())
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

  api('file:pick', async (kind) => {
    const main = getMain()
    const opts = { properties: ['openFile' as const], ...(kind === 'app' ? { filters: [{ name: 'Programas', extensions: ['exe', 'lnk', 'bat', 'cmd'] }, { name: 'Todos', extensions: ['*'] }] } : {}) }
    const r = main ? await dialog.showOpenDialog(main, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? null : r.filePaths[0]
  })
  api('web:attach', (id, wcId, kind) => (id === WSP_SLOT && kind === 'wsp' ? attachWhatsApp(wcId) : kind === 'web' && id !== WSP_SLOT ? !!attachGuest(id, wcId, 'web') : false))
  api('web:active', (id) => markActive(id))
  api('assistant:plan', (text) => planAssistant(text))
  api('assistant:read', (url, question) => readAndAnswer(url, question))
  api('launch:run', (taskId, itemId) => launchTask(taskId, itemId))

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
  api('chat:worktree', async (convId, op) => {
    const c = getDb().chats[convId]
    if (!c) throw new Error('Conversación no encontrada')
    if (c.running) throw new Error('Espera a que termine la respuesta.')
    if (op === 'create') {
      if (c.worktree) throw new Error('Esta conversación ya trabaja en una copia aislada.')
      // las sesiones de Claude van ligadas a la carpeta donde empezaron: cambiarla a medias las pierde
      if (c.sessionId) throw new Error('Solo se puede aislar una conversación nueva (aún sin mensajes). Crea otra conversación con «＋».')
      const task = findTask(c.taskId)
      const dir = await repoDirOf(task)
      if (!dir) throw new Error('La tarea no tiene un repositorio de Git.')
      c.worktree = await iso.createWorktree(dir, convId, task.branch || task.title)
      commit()
      return `Copia aislada creada en la rama «${c.worktree.branch}».`
    }
    if (!c.worktree) throw new Error('Esta conversación no usa una copia aislada.')
    if (op === 'merge') return iso.mergeWorktree(c.worktree)
    await iso.removeWorktree(c.worktree)
    const branch = c.worktree.branch
    delete c.worktree
    commit()
    return `Copia eliminada. La rama «${branch}» se conserva en el repositorio.`
  })
  api('chat:worktreeInfo', async (convId) => {
    const wt = getDb().chats[convId]?.worktree
    return wt ? { ...wt, ...(await iso.worktreeInfo(wt)) } : null
  })
  api('chat:restore', async (convId, cpId) => {
    const c = getDb().chats[convId]
    if (!c) throw new Error('Conversación no encontrada')
    if (c.running) throw new Error('Espera a que termine la respuesta (o cancélala) antes de volver atrás.')
    const cp = c.checkpoints?.find((x) => x.id === cpId)
    if (!cp) throw new Error('Ese punto de restauración ya no existe.')
    const task = findTask(c.taskId)
    const dir = c.worktree?.dir ?? (await checks.checkDir(task))
    const msg = await iso.restoreCheckpoint(convId, c, dir, cp)
    c.messages.push({ role: 'system', text: msg, ts: Date.now() })
    commit()
    return msg
  })
  api('check:list', (taskId) => checks.listChecks(findTask(taskId)))
  api('check:run', (taskId, name, convId) => checks.runCheck(findTask(taskId), name, convId ? getDb().chats[convId]?.worktree?.dir : undefined))
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
  api('spotify:status', () => spotify.getStatus())
  api('spotify:save', (c) => {
    const s = getDb().settings
    const id = c.clientId.trim()
    const focus = c.focusUri.trim()
    if (focus && !spotify.toContextUri(focus)) throw new Error('La lista de enfoque debe ser un enlace de open.spotify.com o una URI spotify:playlist:…')
    if (id !== (s.spotifyClientId ?? '')) spotify.disconnect() // otra app: hay que volver a conectar
    s.spotifyClientId = id
    s.spotifyFocusUri = focus
    s.spotifyAuto = c.auto
    commit()
    return spotify.getStatus()
  })
  api('spotify:connect', () => spotify.connect())
  api('spotify:disconnect', () => spotify.disconnect())
  api('spotify:now', () => spotify.now())
  api('spotify:control', (a) => spotify.control(a))
  api('spotify:devices', () => spotify.listDevices())
  api('spotify:volume', (v) => spotify.setVolume(v))
  api('spotify:transfer', (id) => spotify.transfer(id))
  api('spotify:search', (q) => spotify.search(q))
  api('spotify:playlists', () => spotify.myPlaylists())
  api('spotify:play', (uri) => spotify.playUri(uri))
  api('spotify:queue', (uri) => spotify.queueUri(uri))
  api('redmine:lines', (day) => redmine.lines(day))
  api('redmine:draft', (day, key, draft) => redmine.saveDraft(day, key, draft))
  api('redmine:aiComment', (day, key) => redmine.aiComment(day, key))
  api('redmine:login', () => redmine.openLogin())
  api('redmine:days', (from, to) => redmine.days(from, to))
  api('redmine:send', (day, keys, hours, acts) => redmine.send(day, keys, hours, acts))
  api('redmine:catalog', () => redmine.loadCatalog())
  api('settings:save', (s) => {
    const db = getDb()
    db.settings = { ...db.settings, ...s }
    commit()
    applyLoginItem()
    applyMini()
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
  api('update:state', () => updater.getState())
  api('update:check', () => updater.check())
  api('update:download', () => updater.download())
  api('update:install', () => updater.install())
  api('window:popout', (taskId, convId, atCursor) => {
    if (!getDb().tasks.some((t) => t.id === taskId)) throw new Error('Tarea no encontrada')
    openPopout(taskId, convId, !!atCursor)
  })
  api('skills:list', () => skills.listSkills())
  api('skills:install', (n) => skills.installSkill(n))
  api('skills:remove', (n) => skills.removeSkill(n))
  api('window:skills', () => openSkills())
  api('badges:get', () => getBadges())
  api('whatsapp:open', () => openWhatsApp())
  api('whatsapp:visible', (v) => setWhatsAppVisible(v))
  api('window:fullscreen', (on) => {
    const w = BrowserWindow.getFocusedWindow() ?? getMain()
    if (!w || w.isDestroyed()) return false
    w.setFullScreen(on ?? !w.isFullScreen())
    return w.isFullScreen()
  })
  api('window:dock', (taskId, convId) => dockPopout(taskId, convId))
  api('url:open', async (url) => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Solo se pueden abrir enlaces http(s).')
    await shell.openExternal(url)
  })
  api('git:remote', (dir) => forge.remoteInfo(dir))
  api('git:push', (dir, taskId) => forge.pushWithPr(dir, taskId))
  api('git:prText', (dir, taskId) => forge.prText(dir, taskId))
  api('ci:all', () => ci.allCi())
  api('ci:refresh', (taskId) => ci.refreshCi(taskId))
  api('ci:failure', (taskId) => ci.failureText(taskId))
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


