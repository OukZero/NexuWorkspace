import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'fs'
import { dayKey } from '../shared/util'
import type { DB } from '../shared/types'
import { api } from './api'
import * as auth from './auth'
import * as updater from './updater'
import { quitApp } from './quit'
import { applyMini, dockPopout, hideMini, openPopout, resizeMini } from './windows'
import { backupsDir, commit, getDb, replaceDb } from './db'
import { openClaude, openLogin, openVSCode } from './features/dev/launch'
import { applyLoginItem } from './tray'
import { clearAll, markRead } from './notify'
import { registerCalendarIpc } from './features/calendar/ipc'
import { registerWebIpc } from './features/web/ipc'
import { registerNotesIpc } from './features/notes/ipc'
import { registerMeetingsIpc } from './features/meetings/ipc'
import { registerWhatsAppApi } from './features/whatsapp/ipc'
import { registerTelegramIpc } from './features/telegram/ipc'
import { registerSpotifyIpc } from './features/spotify/ipc'
import { registerAiIpc } from './features/ai/ipc'
import { registerTeamIpc } from './features/team/ipc'
import { registerDevIpc } from './features/dev/ipc'
import { registerTasksIpc } from './features/tasks/ipc'
import { registerTimeIpc } from './features/time/ipc'
import { askClaude } from './features/ai/summary'
import { activeEntry, startTimer } from './features/time/timer'
import { getMain, openSkills, showWin } from './windows'
import { tasksRepo } from './data/repos'

const findTask = tasksRepo.get

/** Núcleo: sesión, ventanas, ajustes, actualizaciones y datos. El resto vive en cada feature (`features/<dominio>/ipc.ts`). */
export function registerIpc(): void {
  // ---------- sesión ----------
  api('auth:status', () => auth.getStatus())
  api('auth:signIn', (email, password) => auth.signIn(email, password))
  api('auth:newPassword', (password) => auth.setNewPassword(password))
  api('auth:signOut', () => auth.signOut())
  api('auth:forgot', (email) => auth.forgotPassword(email))
  api('auth:confirmForgot', (email, code, password) => auth.confirmForgotPassword(email, code, password))

  api('state', () => getDb())

  // ---------- features ----------
  registerTasksIpc()
  registerTimeIpc()
  registerCalendarIpc()
  registerNotesIpc()
  registerMeetingsIpc()
  registerWebIpc()
  registerTelegramIpc()
  registerSpotifyIpc()
  registerAiIpc()
  registerTeamIpc()
  registerDevIpc()
  registerWhatsAppApi()

  // ---------- ventanas y lanzadores ----------
  api('win:restore', () => showWin())
  api('mini:hide', () => hideMini())
  api('mini:resize', (w, h) => resizeMini(w, h))
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
  api('window:popout', (taskId, convId, atCursor) => {
    if (!getDb().tasks.some((t) => t.id === taskId)) throw new Error('Tarea no encontrada')
    openPopout(taskId, convId, !!atCursor)
  })
  api('window:skills', () => openSkills())
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

  api('notif:read', (id) => markRead(id))
  api('notif:clear', () => clearAll())

  // ---------- ajustes, actualizaciones y ciclo de vida ----------
  api('settings:save', (s) => {
    const db = getDb()
    db.settings = { ...db.settings, ...s }
    commit()
    applyLoginItem()
    applyMini()
  })
  api('update:state', () => updater.getState())
  api('update:check', () => updater.check())
  api('update:download', () => updater.download())
  api('update:install', () => updater.install())
  api('app:restart', () => {
    commit() // guarda antes de salir
    // la nueva instancia arranca con --restarted: espera a que esta suelte el bloqueo de instancia única.
    // Se quita --hidden: un reinicio manual tiene que mostrar la ventana, no dejarla en la bandeja.
    const args = process.argv.slice(1).filter((a) => a !== '--restarted' && a !== '--hidden')
    app.relaunch({ args: [...args, '--restarted'] })
    // mismo cierre que «Salir» (timer, procesos, ventanas) con salida forzada si algo se retrasa, para liberar el bloqueo
    setTimeout(() => quitApp(), 200) // después de responder a la llamada
  })
  api('app:quit', () => {
    setTimeout(() => quitApp(), 100) // después de responder a la llamada
  })

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
}
