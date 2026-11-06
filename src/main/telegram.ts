import { randomInt } from 'node:crypto'
import type { AppNotification, NotificationKind, PermissionChoice, PermissionRequest, TelegramStatus } from '../shared/types'
import { cancel, createConversation, permit, send as sendToChat } from './chat'
import { commit, getDb } from './db'

/**
 * Bot de Telegram (etapa 1): la app consulta a Telegram desde este equipo (long-polling, no se abre ningún puerto),
 * reenvía los avisos de la campanita y deja responder los permisos de Claude con botones.
 * Solo obedece al chat vinculado con un código; todo lo demás se ignora.
 */

const API = 'https://api.telegram.org'
const CODE_MINUTES = 10
const MAX_TRIES = 5

interface Update {
  update_id: number
  message?: { message_id: number; text?: string; chat: { id: number; type: string }; reply_to_message?: { message_id: number } }
  callback_query?: { id: string; data?: string; from: { id: number }; message?: { message_id: number; text?: string; chat: { id: number } } }
}

let gen = 0
let abort: AbortController | null = null
let status: TelegramStatus = { running: false, linked: false }
let link: { code: string; exp: number; tries: number } | null = null
let offset = 0
let seq = 0
const buttons = new Map<number, { convId: string; id: string }>()
// mensaje enviado a Telegram → conversación a la que pertenece (responderle continúa esa conversación)
const msgConv = new Map<number, string>()
const taskPick = new Map<number, string>()
// conversaciones cuyo último mensaje salió de Telegram: al terminar se envía la respuesta completa
const fromTg = new Set<string>()
const remember = (m: unknown, convId: string): void => {
  const id = (m as { message_id?: number } | undefined)?.message_id
  if (!id) return
  msgConv.set(id, convId)
  if (msgConv.size > 300) msgConv.delete(msgConv.keys().next().value as number)
}

const settings = (): ReturnType<typeof getDb>['settings'] => getDb().settings
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

async function call<T>(token: string, method: string, body: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new Error('Sin conexión con Telegram')
  }
  const j = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null
  if (!j?.ok) throw new Error(j?.description || `Telegram respondió ${res.status}`)
  return j.result as T
}

export function getStatus(): TelegramStatus {
  return { ...status, linked: !!settings().telegramChat }
}

/** Reinicia la conexión con los datos actuales de Ajustes (token, activado). */
export function restart(): void {
  gen++
  abort?.abort()
  abort = null
  const s = settings()
  status = { running: false, linked: !!s.telegramChat }
  if (s.telegramOn && s.telegramToken) void loop(gen, s.telegramToken)
}

export function stop(): void {
  gen++
  abort?.abort()
}

async function loop(my: number, token: string): Promise<void> {
  try {
    const me = await call<{ username?: string }>(token, 'getMe')
    if (my !== gen) return
    status = { ...status, running: true, bot: me.username ? `@${me.username}` : undefined, error: undefined }
  } catch (e) {
    if (my === gen) status = { ...status, running: false, error: e instanceof Error ? e.message : String(e) }
    return
  }
  while (my === gen) {
    try {
      abort = new AbortController()
      const ups = await call<Update[]>(token, 'getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] }, abort.signal)
      if (my !== gen) return
      status = { ...status, running: true, error: undefined }
      for (const u of ups) {
        offset = u.update_id + 1
        await handle(token, u).catch(() => undefined)
      }
    } catch (e) {
      if (my !== gen) return
      const msg = e instanceof Error ? e.message : String(e)
      status = { ...status, running: false, error: msg }
      if (/unauthorized|not found/i.test(msg)) return // token inválido: no tiene sentido reintentar
      await sleep(5000)
    }
  }
}

const say = (token: string, chat: number, text: string, markup?: unknown): Promise<{ message_id: number }> =>
  call(token, 'sendMessage', { chat_id: chat, text: clip(text, 3500), ...(markup ? { reply_markup: markup } : {}) })

async function handle(token: string, u: Update): Promise<void> {
  const linked = settings().telegramChat

  if (u.callback_query) {
    const cq = u.callback_query
    if (!linked || cq.from.id !== linked) return void (await call(token, 'answerCallbackQuery', { callback_query_id: cq.id }).catch(() => undefined))
    const pick = /^t(\d+)$/.exec(cq.data ?? '')
    if (pick) {
      const taskId = taskPick.get(Number(pick[1]))
      const db = getDb()
      let note = 'Esta lista ya no está disponible. Usa /tareas.'
      if (taskId && db.tasks.some((t) => t.id === taskId)) {
        const convs = Object.entries(db.chats)
          .filter(([, c]) => c.taskId === taskId && !c.closed && !c.kind)
          .sort((a, b) => b[1].createdAt - a[1].createdAt)
        const convId = convs[0]?.[0] ?? createConversation(taskId)
        settings().telegramConv = convId
        commit()
        note = `✔ Ahora hablas con «${taskOf(convId)}». Escribe tu mensaje.`
      }
      await call(token, 'answerCallbackQuery', { callback_query_id: cq.id }).catch(() => undefined)
      if (cq.message) {
        await call(token, 'editMessageText', { chat_id: cq.message.chat.id, message_id: cq.message.message_id, text: note, reply_markup: { inline_keyboard: [] } }).catch(() => undefined)
      }
      return
    }
    const m = /^p(\d+):([akd])$/.exec(cq.data ?? '')
    const target = m ? buttons.get(Number(m[1])) : undefined
    let result = ''
    if (!m || !target) result = 'Esta solicitud ya no está disponible.'
    else {
      const choice: PermissionChoice = m[2] === 'a' ? 'allow' : m[2] === 'k' ? 'always' : 'deny'
      try {
        permit(target.convId, target.id, choice)
        buttons.delete(Number(m[1]))
        result = choice === 'deny' ? '✖ Rechazado' : choice === 'always' ? '✔ Permitido siempre' : '✔ Permitido'
      } catch {
        result = 'Ya se respondió en la app.'
      }
    }
    await call(token, 'answerCallbackQuery', { callback_query_id: cq.id, text: result }).catch(() => undefined)
    if (cq.message) {
      await call(token, 'editMessageText', {
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        text: clip(`${cq.message.text ?? ''}\n\n${result}`, 3500),
        reply_markup: { inline_keyboard: [] }
      }).catch(() => undefined)
    }
    return
  }

  const msg = u.message
  if (!msg || msg.chat.type !== 'private') return
  const text = (msg.text ?? '').trim()

  if (!linked) {
    const m = /^\/(?:vincular|start)(?:@\w+)?\s+(\d{6})$/.exec(text)
    if (m && link && Date.now() < link.exp && link.tries < MAX_TRIES) {
      if (m[1] === link.code) {
        settings().telegramChat = msg.chat.id
        link = null
        commit()
        status = { ...status, linked: true }
        return void (await say(token, msg.chat.id, '✅ Vinculado. Desde ahora recibirás aquí los avisos de Shutoki AI Workspace y podrás responder los permisos de Claude.'))
      }
      link.tries++
    }
    return void (await say(token, msg.chat.id, 'Para vincular este chat, genera un código en Shutoki AI Workspace (Ajustes → Telegram) y escribe /vincular CÓDIGO.'))
  }
  if (msg.chat.id !== linked) return // otro usuario: se ignora sin responder
  await command(token, linked, msg, text)
}

const taskOf = (convId: string): string => {
  const db = getDb()
  const c = db.chats[convId]
  return db.tasks.find((t) => t.id === c?.taskId)?.title ?? 'Tarea'
}

const HELP = [
  'Qué puedes hacer:',
  '• Responder a un aviso de Shutoki AI Workspace → tu mensaje va a esa conversación.',
  '• /tareas → elegir la tarea con la que hablar.',
  '• Escribir sin responder → va a la tarea elegida (/actual).',
  '• /cancelar → detener la respuesta en curso.'
].join('\n')

async function command(token: string, chat: number, msg: NonNullable<Update['message']>, text: string): Promise<void> {
  const cmd = /^\/(\w+)(?:@\w+)?\s*$/.exec(text)?.[1]?.toLowerCase()
  const s = settings()
  if (cmd === 'start' || cmd === 'ayuda' || cmd === 'help') return void (await say(token, chat, HELP))
  if (cmd === 'tareas') return void (await listTasks(token, chat))
  if (cmd === 'actual') {
    const cur = s.telegramConv ? getDb().chats[s.telegramConv] : undefined
    if (!cur) return void (await say(token, chat, 'No hay tarea elegida. Usa /tareas.'))
    return void (await say(token, chat, `Hablas con «${taskOf(s.telegramConv!)}»${cur.running ? ' (Claude está respondiendo ahora)' : ''}.`))
  }
  if (cmd === 'cancelar') {
    const cur = s.telegramConv ? getDb().chats[s.telegramConv] : undefined
    if (!cur?.running) return void (await say(token, chat, 'No hay ninguna respuesta en curso.'))
    cancel(s.telegramConv!)
    return void (await say(token, chat, '⏹ Cancelado.'))
  }
  if (!text || text.startsWith('/')) return void (await say(token, chat, HELP))

  // responder a un aviso lo dirige a su conversación
  const replied = msg.reply_to_message ? msgConv.get(msg.reply_to_message.message_id) : undefined
  if (replied && getDb().chats[replied] && !getDb().chats[replied].closed) {
    s.telegramConv = replied
    commit()
  }
  const convId = s.telegramConv
  const c = convId ? getDb().chats[convId] : undefined
  if (!convId || !c || c.closed) return void (await say(token, chat, 'Primero elige una tarea con /tareas, o responde a un aviso de Shutoki AI Workspace.'))
  try {
    sendToChat(convId, text)
  } catch (e) {
    return void (await say(token, chat, `⚠ ${e instanceof Error ? e.message : String(e)}`))
  }
  fromTg.add(convId)
  remember(await say(token, chat, `➡ Enviado a «${clip(taskOf(convId), 50)}». Te aviso cuando termine.`), convId)
}

/** Tareas abiertas, las de actividad más reciente primero. */
async function listTasks(token: string, chat: number): Promise<void> {
  const db = getDb()
  const last = (taskId: string): number => Math.max(0, ...Object.values(db.chats).filter((c) => c.taskId === taskId).map((c) => c.messages[c.messages.length - 1]?.ts ?? c.createdAt))
  const tasks = db.tasks
    .filter((t) => t.status !== 'done' && !t.archived)
    .sort((a, b) => last(b.id) - last(a.id))
    .slice(0, 8)
  if (!tasks.length) return void (await say(token, chat, 'No tienes tareas abiertas.'))
  taskPick.clear()
  const rows = tasks.map((t, i) => {
    taskPick.set(i, t.id)
    return [{ text: clip(t.title, 50), callback_data: `t${i}` }]
  })
  await say(token, chat, 'Elige la tarea con la que quieres hablar:', { inline_keyboard: rows })
}

/** Código de 6 dígitos para vincular el chat (vale 10 minutos). */
export function newLinkCode(): string {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  link = { code, exp: Date.now() + CODE_MINUTES * 60_000, tries: 0 }
  return code
}

export function unlink(): void {
  delete settings().telegramChat
  link = null
  commit()
  status = { ...status, linked: false }
}

function ready(): { token: string; chat: number } | null {
  const s = settings()
  return s.telegramOn && s.telegramToken && s.telegramChat && status.running ? { token: s.telegramToken, chat: s.telegramChat } : null
}

export async function test(): Promise<void> {
  const r = ready()
  if (!r) throw new Error('El bot no está conectado o no está vinculado.')
  await say(r.token, r.chat, '✅ Shutoki AI Workspace está conectado a Telegram.')
}

const ICON: Record<NotificationKind, string> = { daily: '📋', reminder: '⏰', done: '✅', attention: '⚠️', permission: '🔐', idle: '💤' }
const GENERIC: Record<NotificationKind, string> = {
  daily: 'El resumen del daily está listo.',
  reminder: 'Recordatorio: cierre del día.',
  done: 'Una tarea terminó.',
  attention: 'Una tarea necesita atención.',
  permission: 'Claude pide permiso en una tarea. Ábrelo en Shutoki AI Workspace para responder.',
  idle: 'Llevas un rato sin actividad.'
}

/** Reenvía un aviso de la campanita a Telegram (si está conectado). */
export function forward(n: AppNotification): void {
  const r = ready()
  if (!r) return
  const convId = n.goto?.startsWith('chat:') ? n.goto.slice(5) : undefined
  const details = settings().telegramDetails !== false
  let body = n.body
  // si el mensaje salió de Telegram, se manda la respuesta completa
  if (convId && n.kind === 'done' && fromTg.delete(convId) && details) {
    const lastReply = [...(getDb().chats[convId]?.messages ?? [])].reverse().find((m) => m.role === 'assistant')
    if (lastReply?.text.trim()) body = clip(lastReply.text.trim(), 3000)
  }
  const text = details ? `${n.title}${body ? `\n${body}` : ''}` : GENERIC[n.kind]
  void say(r.token, r.chat, `${ICON[n.kind]} ${text}`).then((m) => convId && remember(m, convId), () => undefined)
}

/** Pide el permiso por Telegram con botones Permitir / Permitir siempre / Rechazar. */
export function sendPermission(convId: string, req: PermissionRequest, taskTitle: string): void {
  const r = ready()
  if (!r) return
  if (settings().telegramDetails === false) return void say(r.token, r.chat, `${ICON.permission} ${GENERIC.permission}`).then(undefined, () => undefined)
  const n = ++seq
  buttons.set(n, { convId, id: req.id })
  if (buttons.size > 200) buttons.delete(buttons.keys().next().value as number)
  const what = req.tool === 'Bash' ? 'ejecutar un comando' : req.tool
  const row = [{ text: 'Permitir', callback_data: `p${n}:a` }, { text: 'Rechazar', callback_data: `p${n}:d` }]
  const rows: Array<Array<{ text: string; callback_data: string }>> = [row]
  if (req.rule) rows.push([{ text: clip(`Permitir siempre «${req.rule}»`, 60), callback_data: `p${n}:k` }])
  void say(r.token, r.chat, `${ICON.permission} Claude pide permiso para ${what}\n${clip(taskTitle, 60)}\n\n${clip(req.target, 600)}`, { inline_keyboard: rows }).then((m) => remember(m, convId), () => undefined)
}
