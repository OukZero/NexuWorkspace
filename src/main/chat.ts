// Conversaciones con Claude: cada una ejecuta `claude -p` (stream-json) en la carpeta de su tarea y reanuda su propia sesión.
import fs from 'fs'
import path from 'path'
import { BrowserWindow, Notification } from 'electron'
import { ChildProcess, spawn } from 'child_process'
import { attachRoot, trusted as trustedAttachments } from './attachments'
import { designInstructions, mockupsDir } from './mockups'
import type { Activity, Attachment, Chat, ChatMessage, ChatUsage, Hunk, LimitWindow, Task } from '../shared/types'
import { clip } from '../shared/util'
import { broadcast, commit, getDb, push } from './db'
import { groupAccess } from './groups'
import { ensureTimer } from './timer'
import { emit, getMain, showWin } from './windows'

const MAX_ACTIVITY = 300
const HUNK_MAX = 4000
const MAX_USAGE_RECORDS = 5000
const DEFAULT_WINDOW = 200_000

// errores de sesión de Claude Code (login vencido, sin autenticar, token inválido)
const AUTH_RE = /authenticat|auth login|setup-token|OAUTH_TOKEN|not logged in|please run \/?login|invalid api key|credentials/i
const sysMsg = (text: string): ChatMessage => ({
  role: 'system',
  text: clip(text, 500),
  ts: Date.now(),
  ...(AUTH_RE.test(text) ? { action: 'login' as const } : {})
})

const procs = new Map<string, ChildProcess>() // id de conversación -> proceso

const newChat = (taskId: string, title?: string): Chat => ({ taskId, createdAt: Date.now(), title, sessionId: null, messages: [], activity: [], running: false })

function chatOf(convId: string): Chat {
  const c = getDb().chats[convId]
  if (!c) throw new Error('Conversación no encontrada')
  return c
}

/** Crea una conversación nueva (vacía) para la tarea y devuelve su id. */
export function createConversation(taskId: string, kind?: 'design'): string {
  const db = getDb()
  if (!db.tasks.some((t) => t.id === taskId)) throw new Error('Tarea no encontrada')
  const n = Object.values(db.chats).filter((c) => c.taskId === taskId && !c.kind).length + 1
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  db.chats[id] = { ...newChat(taskId, kind === 'design' ? 'Diseño' : `Conversación ${n}`), ...(kind ? { kind } : {}) }
  commit()
  return id
}

type Described = Pick<Activity, 'kind' | 'label' | 'target'> & { hunks?: Hunk[] }

interface ToolBlock {
  name: string
  input?: Record<string, unknown>
}

function describe(block: ToolBlock, folder: string): Described {
  const i = (block.input ?? {}) as Record<string, string | undefined> & { edits?: Array<{ old_string?: string; new_string?: string }> }
  const rel = (p?: string): string => {
    if (!p) return ''
    const r = path.relative(folder, p)
    return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : p
  }
  // fragmentos antes/después para poder ver qué cambió (recortados para no inflar data.json)
  const hunk = (o: string | null | undefined, n: string | undefined): Hunk => ({ old: o == null ? null : clip(o, HUNK_MAX), new: clip(n, HUNK_MAX) })
  switch (block.name) {
    case 'Edit':
      return { kind: 'edit', label: 'Editó', target: rel(i.file_path), hunks: [hunk(i.old_string, i.new_string)] }
    case 'MultiEdit':
      return { kind: 'edit', label: 'Editó', target: rel(i.file_path), hunks: (i.edits ?? []).slice(0, 30).map((e) => hunk(e.old_string, e.new_string)) }
    case 'Write':
      return { kind: 'edit', label: 'Escribió', target: rel(i.file_path), hunks: [hunk(null, i.content)] }
    case 'NotebookEdit':
      return { kind: 'edit', label: 'Editó', target: rel(i.notebook_path), hunks: [hunk(null, i.new_source)] }
    case 'Read':
      return { kind: 'read', label: 'Leyó', target: rel(i.file_path) }
    case 'Bash':
      return { kind: 'run', label: 'Ejecutó', target: clip(i.command, 160) }
    case 'Grep':
      return { kind: 'search', label: 'Buscó', target: clip(i.pattern, 100) }
    case 'Glob':
      return { kind: 'search', label: 'Listó', target: clip(i.pattern, 100) }
    case 'WebFetch':
      return { kind: 'other', label: 'Abrió', target: clip(i.url, 120) }
    case 'WebSearch':
      return { kind: 'other', label: 'Buscó en la web', target: clip(i.query, 100) }
    default:
      return { kind: 'other', label: block.name, target: '' }
  }
}

interface RawUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

interface ModelUsage {
  inputTokens?: number
  outputTokens?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
  costUSD?: number
  contextWindow?: number
}

interface StreamEvent {
  type?: string
  subtype?: string
  session_id?: string
  is_error?: boolean
  result?: string
  parent_tool_use_id?: string | null
  total_cost_usd?: number
  num_turns?: number
  duration_ms?: number
  usage?: RawUsage
  modelUsage?: Record<string, ModelUsage>
  rate_limit_info?: { unifiedWindows?: Record<string, { utilization?: number; resetsAt?: number; status?: string }> }
  slash_commands?: string[]
  compact_metadata?: { pre_tokens?: number; post_tokens?: number; trigger?: string }
  event?: { type?: string; delta?: { type?: string; text?: string } }
  message?: {
    model?: string
    usage?: RawUsage
    // los comandos / devuelven su salida como texto plano; el resto, bloques
    content?:
      | string
      | Array<{
          type: string
          text?: string
          id?: string
          name?: string
          input?: Record<string, unknown>
          tool_use_id?: string
          is_error?: boolean
          content?: string | Array<{ text?: string }>
        }>
  }
}

const blocksOf = (ev: StreamEvent): Exclude<NonNullable<StreamEvent['message']>['content'], string | undefined> => {
  const c = ev.message?.content
  return Array.isArray(c) ? c : []
}

const COMMAND_OUT = /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/

const newUsage = (): ChatUsage => ({
  contextTokens: 0,
  contextWindow: DEFAULT_WINDOW,
  turns: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreateTokens: 0,
  costUsd: 0,
  durationMs: 0,
  updatedAt: Date.now()
})

const toWindow = (w?: { utilization?: number; resetsAt?: number; status?: string }): LimitWindow | undefined =>
  w && typeof w.utilization === 'number' && typeof w.resetsAt === 'number' ? { utilization: w.utilization, resetsAt: w.resetsAt, status: w.status } : undefined

/** Tamaño del contexto del último turno + consumo acumulado de la sesión y del panel de consumo. */
function trackResult(taskId: string, chat: Chat, ev: StreamEvent): void {
  const cu = (chat.usage ??= newUsage())
  const models = Object.entries(ev.modelUsage ?? {})
  let input = 0
  let output = 0
  let cacheRead = 0
  let cacheCreate = 0
  let cost = ev.total_cost_usd ?? 0
  let model = cu.model ?? ''
  if (models.length) {
    cost = 0
    let top = -1
    for (const [name, m] of models) {
      input += m.inputTokens ?? 0
      output += m.outputTokens ?? 0
      cacheRead += m.cacheReadInputTokens ?? 0
      cacheCreate += m.cacheCreationInputTokens ?? 0
      cost += m.costUSD ?? 0
      if ((m.costUSD ?? 0) > top) {
        top = m.costUSD ?? 0
        model = name
      }
      if (m.contextWindow) cu.contextWindow = m.contextWindow
    }
  } else if (ev.usage) {
    input = ev.usage.input_tokens ?? 0
    output = ev.usage.output_tokens ?? 0
    cacheRead = ev.usage.cache_read_input_tokens ?? 0
    cacheCreate = ev.usage.cache_creation_input_tokens ?? 0
  }
  cu.model = model || cu.model
  cu.inputTokens += input
  cu.outputTokens += output
  cu.cacheReadTokens += cacheRead
  cu.cacheCreateTokens += cacheCreate
  cu.costUsd += cost
  cu.turns += ev.num_turns ?? 1
  cu.durationMs += ev.duration_ms ?? 0
  cu.updatedAt = Date.now()

  const db = getDb()
  db.usage.push({ ts: Date.now(), taskId, model: cu.model ?? '', input, output, cacheRead, cacheCreate, costUsd: cost })
  if (db.usage.length > MAX_USAGE_RECORDS) db.usage.splice(0, db.usage.length - MAX_USAGE_RECORDS)
}

function handle(convId: string, folder: string, ev: StreamEvent): void {
  const chat = chatOf(convId)
  if (ev.session_id && !chat.sessionId) chat.sessionId = ev.session_id

  if (ev.type === 'stream_event') {
    const d = ev.event?.delta
    if (ev.event?.type === 'content_block_delta' && d?.type === 'text_delta' && d.text) broadcast('chat:delta', { convId, text: d.text })
    return
  }
  if (ev.type === 'system' && ev.subtype === 'init' && ev.slash_commands?.length) {
    getDb().commands = ev.slash_commands // alimenta el autocompletado de comandos / del chat
    return
  }
  if (ev.type === 'system' && ev.subtype === 'compact_boundary') {
    const { pre_tokens: pre = 0, post_tokens: post = 0 } = ev.compact_metadata ?? {}
    const cu = (chat.usage ??= newUsage())
    if (post) cu.contextTokens = post
    chat.compactions = (chat.compactions ?? 0) + 1
    chat.messages.push({ role: 'system', text: `Conversación compactada${pre ? `: ${Math.round(pre / 1000)}k → ${Math.round(post / 1000)}k tokens` : ''}.`, ts: Date.now() })
    push()
    return
  }
  if (ev.type === 'rate_limit_event') {
    const w = ev.rate_limit_info?.unifiedWindows
    const five = toWindow(w?.['five_hour'])
    const seven = toWindow(w?.['seven_day'])
    if (five || seven) {
      const db = getDb()
      db.limits = { fiveHour: five ?? db.limits?.fiveHour, sevenDay: seven ?? db.limits?.sevenDay, updatedAt: Date.now() }
      push()
    }
    return
  }
  if (ev.type === 'assistant') {
    // el contexto de este turno = todo lo que se envió al modelo (entrada + caché), sin contar subagentes
    const u = ev.message?.usage
    if (u && !ev.parent_tool_use_id) {
      const ctx = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
      // los comandos / emiten mensajes sin uso real (todo en 0): no pisan el último tamaño conocido
      if (ctx > 0) {
        const cu = (chat.usage ??= newUsage())
        cu.contextTokens = ctx
        if (ev.message?.model) cu.model = ev.message.model
        cu.updatedAt = Date.now()
      }
    }
    for (const b of blocksOf(ev)) {
      if (b.type === 'text' && b.text?.trim()) chat.messages.push({ role: 'assistant', text: b.text.trim(), ts: Date.now() })
      if (b.type === 'tool_use' && b.id && b.name) {
        chat.activity.push({ id: b.id, ts: Date.now(), tool: b.name, status: 'running', ...describe({ name: b.name, input: b.input }, folder) })
        if (chat.activity.length > MAX_ACTIVITY) chat.activity.splice(0, chat.activity.length - MAX_ACTIVITY)
      }
    }
    push()
    return
  }
  if (ev.type === 'user') {
    // salida de un comando / (p. ej. /context): se muestra como respuesta; «Compacted» ya lo cubre el aviso de compactación
    const raw = ev.message?.content
    if (typeof raw === 'string') {
      const out = COMMAND_OUT.exec(raw)?.[1]?.trim()
      if (out && !/^compacted$/i.test(out)) chat.messages.push({ role: 'assistant', text: '```\n' + clip(out, 6000) + '\n```', ts: Date.now() })
      push()
      return
    }
    for (const b of blocksOf(ev)) {
      if (b.type !== 'tool_result') continue
      const a = chat.activity.find((x) => x.id === b.tool_use_id)
      if (!a) continue
      a.status = b.is_error ? 'error' : 'ok'
      if (b.is_error) {
        const txt = Array.isArray(b.content) ? b.content.map((c) => c.text || '').join(' ') : b.content
        a.detail = clip(txt, 200)
      }
    }
    push()
    return
  }
  if (ev.type === 'result') {
    chat.gotResult = true
    trackResult(chat.taskId, chat, ev)
    if (ev.is_error) chat.messages.push(sysMsg(ev.result || ev.subtype || 'Error de Claude'))
    push()
  }
}

/** Aviso de escritorio cuando Claude termina (o necesita atención) y la app no está en primer plano. */
function notifyDone(convId: string, task: Task, chat: Chat, runStart: number, failed: string | null): void {
  if (!getDb().settings.notifyOnDone) return
  if (BrowserWindow.getAllWindows().some((w) => w.isFocused())) return // ya lo estás viendo; la pestaña muestra un indicador
  const edited = [...new Set(chat.activity.filter((a) => a.kind === 'edit' && a.status !== 'error' && a.ts >= runStart).map((a) => a.target))]
  const last = [...chat.messages].reverse().find((m) => m.role === 'assistant')
  const body =
    failed ??
    (edited.length
      ? `Modificó ${edited.length} archivo${edited.length > 1 ? 's' : ''}: ${clip(edited.slice(0, 3).join(', '), 110)}${edited.length > 3 ? '…' : ''}`
      : clip((last?.text ?? 'Respuesta lista').replace(/\s+/g, ' '), 140))
  const n = new Notification({ title: `${failed ? 'Claude necesita atención' : 'Claude terminó'} · ${clip(task.title, 50)}`, body })
  n.on('click', () => {
    showWin()
    emit('goto', `chat:${convId}`)
  })
  n.show()
  getMain()?.flashFrame(true)
}

/** Contenido del mensaje para Claude: las fotos van como bloques de imagen; todos los adjuntos se mencionan por ruta. */
function buildContent(text: string, files: Attachment[]): string | Array<Record<string, unknown>> {
  if (!files.length) return text
  const list = files.map((f) => `- ${f.path}`).join('\n')
  const blocks: Array<Record<string, unknown>> = files
    .filter((f) => f.image)
    .map((f) => ({ type: 'image', source: { type: 'base64', media_type: f.mime, data: fs.readFileSync(f.path).toString('base64') } }))
  blocks.push({ type: 'text', text: `${text || 'Revisa los archivos adjuntos.'}\n\nArchivos adjuntos (puedes leerlos con tus herramientas):\n${list}` })
  return blocks
}

export function send(convId: string, rawText: string, rawFiles?: Attachment[]): void {
  const db = getDb()
  const chat = chatOf(convId)
  const task = db.tasks.find((t) => t.id === chat.taskId)
  if (!task) throw new Error('Tarea no encontrada')
  if (!task.folder || !fs.existsSync(task.folder)) throw new Error('Asigna una carpeta de proyecto válida a la tarea para chatear.')
  const text = String(rawText || '').trim()
  const files = trustedAttachments(rawFiles)
  if (!text && !files.length) return
  if (chat.running) throw new Error('Claude sigue respondiendo en esta conversación.')

  // la pestaña toma el nombre del primer mensaje (los comandos / no cuentan)
  if (!chat.messages.some((m) => m.role === 'user') && !text.startsWith('/')) {
    chat.title = clip((text || files[0].name).replace(/\s+/g, ' '), 28)
  }
  chat.messages.push({ role: 'user', text, ts: Date.now(), ...(files.length ? { attachments: files } : {}) })
  chat.running = true
  chat.gotResult = false
  ensureTimer(task.id)
  commit()

  // la entrada por stream-json (en vez de texto plano) es lo que permite ejecutar comandos / como /compact
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-mode', 'acceptEdits']
  if (chat.sessionId) args.push('--resume', chat.sessionId)
  if (db.settings.autocompactTokens >= 100_000) args.push('--autocompact', String(db.settings.autocompactTokens))
  // grupos de carpetas: acceso de lectura/escritura (--add-dir) y solo lectura (regla de denegación de edición)
  const access = groupAccess(task)
  args.push(...access.args)
  if (files.length) args.push('--add-dir', `"${attachRoot()}"`) // para que Claude pueda leer los adjuntos no gráficos
  // pestaña Diseño: acceso a la carpeta de mockups de la tarea e instrucciones de diseño como parte del system prompt
  if (chat.kind === 'design') {
    args.push('--add-dir', `"${mockupsDir(task.id)}"`, '--append-system-prompt-file', `"${designInstructions(task.id, task.title)}"`)
  }
  if (access.skipped.length) {
    chat.messages.push({ role: 'system', text: `Carpetas omitidas (no existen o no se pudo garantizar solo lectura): ${access.skipped.join(', ')}`, ts: Date.now() })
  }
  const runStart = Date.now()
  const isCommand = text.startsWith('/')
  const child = spawn(`${db.settings.claudeCmd} ${args.join(' ')}`, { shell: true, cwd: task.folder, windowsHide: true })
  procs.set(convId, child)

  let buf = ''
  let err = ''
  child.stdout?.on('data', (b: Buffer) => {
    buf += b
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      try {
        handle(convId, task.folder, JSON.parse(line) as StreamEvent)
      } catch {
        /* línea no JSON */
      }
    }
  })
  child.stderr?.on('data', (b: Buffer) => (err += b))
  child.stdin?.on('error', () => {})
  child.stdin?.end(JSON.stringify({ type: 'user', message: { role: 'user', content: buildContent(text, files) } }) + '\n')

  const finish = (code: number | null, spawnErr?: Error): void => {
    if (procs.get(convId) !== child) return
    procs.delete(convId)
    chat.running = false
    for (const a of chat.activity) if (a.status === 'running') a.status = chat.cancelled ? 'error' : 'ok'
    let failed: string | null = null
    if (chat.cancelled) chat.messages.push({ role: 'system', text: 'Respuesta cancelada.', ts: Date.now() })
    else if (spawnErr || (code !== 0 && !chat.gotResult)) {
      const m = sysMsg(spawnErr?.message || err.trim() || `claude terminó con código ${code}. ¿Responde "${db.settings.claudeCmd} --version" en PowerShell?`)
      chat.messages.push(m)
      failed = m.text
    } else {
      const last = chat.messages[chat.messages.length - 1]
      if (last?.role === 'system' && last.ts >= runStart) failed = last.text // Claude respondió con un error (p. ej. sesión vencida)
    }
    const wasCancelled = chat.cancelled
    chat.cancelled = false
    commit()
    if (!wasCancelled && !isCommand) notifyDone(convId, task, chat, runStart, failed)
  }
  child.on('error', (e) => finish(1, e))
  child.on('close', (code) => finish(code))
}

const kill = (c: ChildProcess): void => {
  if (c.pid) spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { windowsHide: true })
}

export function cancel(convId: string): void {
  const child = procs.get(convId)
  if (!child) return
  chatOf(convId).cancelled = true
  kill(child)
}

export function reset(convId: string): void {
  if (procs.has(convId)) throw new Error('Espera a que termine o cancela la respuesta.')
  const old = chatOf(convId)
  getDb().chats[convId] = { ...newChat(old.taskId, old.title), createdAt: old.createdAt }
  commit()
}

export function killAll(): void {
  for (const c of procs.values()) kill(c)
}
