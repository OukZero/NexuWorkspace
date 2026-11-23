import { api } from '../../api'
import { commit, getDb } from '../../db'
import { pad } from '../../../shared/util'
import * as checks from '../dev/checks'
import * as iso from '../dev/isolation'
import { planAssistant, readAndAnswer } from './assistant'
import * as attachments from './attachments'
import * as chat from './chat'
import { buildContext, expandVars, repoDirOf, taskById as findTask, withContext } from './context'
import { addStyleRef, deleteMockup, exportMockup, getStyle, listMockups, removeStyleRef, revealMockups, saveStyle } from './mockups'
import * as sessions from './sessions'
import * as skills from './skills'
import { summarizeConversation } from './summary'
import { refreshLimits } from './usage'

const stamp = (): string => {
  const d = new Date()
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const summarizing = new Set<string>()

/** Chat con la IA, contexto, notas de sesión, diseño (mockups), adjuntos, asistente, skills y uso. */
export function registerAiIpc(): void {
  api('assistant:plan', (text) => planAssistant(text))
  api('assistant:read', (url, question) => readAndAnswer(url, question))

  // las conversaciones se identifican por su propio id (una tarea puede tener varias)
  api('chat:new', (taskId, kind) => chat.createConversation(taskId, kind))

  // ---------- pestaña Diseño ----------
  api('mockup:list', (taskId) => listMockups(taskId))
  api('mockup:delete', (taskId, name) => deleteMockup(taskId, name))
  api('mockup:export', (taskId, name, format, width) => exportMockup(taskId, name, format, width))
  api('design:style-get', () => getStyle())
  api('design:style-save', (p) => saveStyle(p))
  api('design:style-add', (name, data) => addStyleRef(name, data))
  api('design:style-remove', (name) => removeStyleRef(name))
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
  api('chat:context', async (taskId, kinds) => buildContext(findTask(taskId), { kinds }))
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

  api('skills:list', () => skills.listSkills())
  api('skills:install', (n) => skills.installSkill(n))
  api('skills:remove', (n) => skills.removeSkill(n))
  api('skills:installRecommended', () => skills.installRecommended())
  api('usage:refresh', async (): Promise<true> => {
    await refreshLimits()
    return true
  })
}
