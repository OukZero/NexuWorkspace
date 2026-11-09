import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ClipboardEvent, DragEvent, KeyboardEvent, ReactNode } from 'react'
import type { Attachment, ChatMode, ContextKind, Provider, PromptTemplate } from '../../../shared/types'
import { contextAdvice, fmtTokens } from '../../../shared/advice'
import { DEFAULT_CONTEXT, templatesOf } from '../../../shared/templates'
import { workFolder } from '../../../shared/util'
import { convLabel } from '../conversations'
import { findTask, useDB } from '../store'
import { readTerminal } from '../terminals'
import { baseName, hhmm } from '../utils'
import { useUi } from '../ui'
import { ContextBar, TemplateMenu } from './ChatExtras'
import { ChecksButton, LimitBanner, ProfileSelect, WorktreeBar } from './ChatSafety'
import { IconStop } from './icons'
import { G } from './glyphs'
import { setLayout, useLayout } from '../layout'
import { setConvsOpen, useConvsPane } from '../convsPane'
import { onChatDraft, takeChatDraft } from '../chatDraft'
import { getFilesDraft, getInputDraft, saveFilesDraft, saveInputDraft } from '../inputDrafts'
import { useTaskSlot } from '../taskSlot'
import { Markdown } from './Markdown'
import { Menu, type MenuItem } from './Menu'
import { Select, type SelectOption } from './Select'
import { ContextMeter } from './SessionPanel'
import { SidePanel } from './SidePanel'

// atajos fijos que no son plantillas: comandos / de Claude Code
const COMMAND_CHIPS = ['/compact', '/context']

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// comandos / de Claude Code; la lista real llega en cada respuesta (db.commands)
const DEFAULT_COMMANDS = ['compact', 'context', 'autocompact', 'clear', 'init', 'model', 'code-review', 'security-review']

const kb = (n: number): string => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

function Thumb({ a }: { a: Attachment }): ReactNode {
  const [src, setSrc] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    void window.api.call('attach:preview', a.path).then((s) => alive && setSrc(s)).catch(() => {})
    return () => {
      alive = false
    }
  }, [a.path])
  if (!src) return <span className="att-ph">🖼</span>
  return (
    <>
      <img className="att-img" src={src} alt={a.name} onClick={() => setOpen(true)} />
      {open && (
        <div className="modal" onClick={() => setOpen(false)}>
          <img src={src} alt={a.name} style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: 8 }} />
        </div>
      )}
    </>
  )
}

export function AttachmentList({ items, onRemove }: { items: Attachment[]; onRemove?: (i: number) => void }): ReactNode {
  return (
    <div className="atts">
      {items.map((a, i) => (
        <div key={a.path} className={`att ${a.image ? 'img' : ''}`} title={`${a.name} · ${kb(a.size)}`}>
          {a.image ? <Thumb a={a} /> : <span className="att-file">📄 {a.name}</span>}
          {onRemove && (
            <button className="att-x" title="Quitar" onClick={() => onRemove(i)}>
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

/** Una conversación con Claude. Cada una tiene su propio contexto, aunque comparta tarea con otras. */
/** `slot`: en un panel del Espacio, el lugar de su cabecera donde van los controles del chat; `extraMenu`: opciones que el panel suma al menú «⋯». */
export function ChatView({ convId, embedded, slot, extraMenu }: { convId: string; embedded?: boolean; slot?: HTMLElement | null; extraMenu?: MenuItem[] }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const lay = useLayout()
  const taskSlot = useTaskSlot()
  const convs = useConvsPane()
  const chat = db.chats[convId]
  const taskId = chat?.taskId ?? ''
  const task = findTask(db, taskId)
  const folder = task ? workFolder(task, db.groups) : ''
  const messages = chat?.messages ?? []
  const running = !!chat?.running

  const [input, setInputState] = useState(() => getInputDraft(convId))
  const [live, setLive] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [files, setFilesState] = useState<Attachment[]>(() => getFilesDraft(convId))
  // cada cambio se guarda por conversación: el chat se vuelve a montar al cambiar de conversación, modo o pantalla
  const setInput = (v: string | ((c: string) => string)): void =>
    setInputState((cur) => {
      const next = typeof v === 'function' ? v(cur) : v
      saveInputDraft(convId, next)
      return next
    })
  const setFiles = (v: Attachment[] | ((c: Attachment[]) => Attachment[])): void =>
    setFilesState((cur) => {
      const next = typeof v === 'function' ? v(cur) : v
      saveFilesDraft(convId, next)
      return next
    })
  const [ctxKinds, setCtxKinds] = useState<ContextKind[]>([])
  const [terminalText, setTerminalText] = useState('')
  const [noting, setNoting] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const stick = useRef(true) // true = el usuario está al final y seguimos el scroll

  // primera conversación de la tarea: precarga el prompt para revisarlo y enviarlo con Enter
  useEffect(() => {
    let alive = true
    area.current?.focus()
    const taskHasChat = Object.values(db.chats).some((c) => c.taskId === taskId && c.messages.length > 0)
    // conversación nueva: se anexa el contexto por defecto (si ya se precarga el prompt de la tarea, no se repite la tarea)
    const fresh = !db.chats[convId]?.messages.length
    const base = fresh ? (db.settings.defaultContext ?? DEFAULT_CONTEXT) : []
    setCtxKinds(taskHasChat || !taskId ? base : base.filter((k) => k !== 'task'))
    if (!taskHasChat && taskId) {
      void ui.run('task:prompt', taskId).then((p) => {
        if (alive && p) setInput((cur) => cur || p)
      })
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId])

  // borrador dejado por otra vista (p. ej. «Preguntar a Claude sobre esta página» del panel Web): texto y contexto a adjuntar
  useEffect(() => {
    const take = (): void => {
      const d = takeChatDraft(taskId)
      if (!d) return
      setCtxKinds((cur) => [...new Set([...cur, ...d.kinds])])
      setInput(d.text)
      area.current?.focus()
    }
    take()
    return onChatDraft(take)
  }, [taskId, convId])

  // salida reciente de la terminal de la tarea (para el contexto); se refresca de vez en cuando
  useEffect(() => {
    const read = (): void => setTerminalText(readTerminal(taskId))
    read()
    const id = setInterval(read, 4000)
    return () => clearInterval(id)
  }, [taskId])

  // texto en vivo mientras Claude escribe; al llegar el mensaje completo se descarta
  useEffect(() => window.api.onDelta((d) => d.convId === convId && setLive((l) => l + d.text)), [convId])
  useEffect(() => setLive(''), [messages.length])

  useLayoutEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages.length, live, running, chat?.pending?.length])

  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight + 2, 160) + 'px'
  }, [input])

  const send = async (override?: { text: string; kinds: ContextKind[] }): Promise<void> => {
    const text = (override?.text ?? input).trim()
    if (!text && !files.length) return
    const sent = files
    const kinds = text.startsWith('/') ? [] : (override?.kinds ?? ctxKinds)
    setInput('')
    setFiles([])
    setCtxKinds([]) // el contexto vale para un mensaje; la sesión de Claude ya lo recuerda
    setLive('')
    stick.current = true
    const ctx = kinds.length ? { kinds, ...(kinds.includes('terminal') ? { terminal: readTerminal(taskId) } : {}) } : undefined
    const r = await ui.run('chat:send', convId, text, sent, ctx)
    if (r === undefined) {
      // falló: no perder lo escrito, los adjuntos ni el contexto elegido
      setInput(text)
      setFiles(sent)
      setCtxKinds(kinds)
    }
  }

  // ---------- plantillas de prompts ----------
  const templates = templatesOf(db.settings)
  const hashQuery = /^#\S*$/.test(input) ? norm(input.slice(1)) : null
  const tplMatches = hashQuery === null ? [] : templates.filter((t) => norm(t.name).includes(hashQuery)).slice(0, 8)
  const pickTemplate = (t: PromptTemplate): void => {
    const kinds = [...new Set([...ctxKinds, ...(t.ctx ?? [])])]
    const base = hashQuery !== null ? '' : input.trim()
    const text = base ? base + '\n\n' + t.text : t.text
    if (t.autoSend && !running) return void send({ text, kinds })
    setCtxKinds(kinds)
    setInput(text)
    area.current?.focus()
    // si la plantilla tiene un [campo], se deja seleccionado para escribir encima
    requestAnimationFrame(() => {
      const el = area.current
      const m = /\[[^\]]+\]/.exec(text)
      if (el && m) el.setSelectionRange(m.index, m.index + m[0].length)
    })
  }

  const addBlobs = async (blobs: File[]): Promise<void> => {
    for (const f of blobs) {
      const a = await ui.run('attach:save', convId, f.name || 'captura.png', new Uint8Array(await f.arrayBuffer()))
      if (a) setFiles((cur) => [...cur, a])
    }
  }

  const pickFiles = async (): Promise<void> => {
    const r = await ui.run('attach:pick', convId)
    if (r?.length) setFiles((cur) => [...cur, ...r])
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const blobs = [...e.clipboardData.files]
    if (!blobs.length) return // texto normal: comportamiento por defecto
    e.preventDefault()
    void addBlobs(blobs)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragging(false)
    void addBlobs([...e.dataTransfer.files])
  }

  // autocompletado de comandos /: aparece mientras el mensaje es solo «/algo»
  const query = /^\/[^\s]*$/.test(input) ? input.slice(1).toLowerCase() : null
  const matches =
    query === null
      ? []
      : (db.commands?.length ? db.commands : DEFAULT_COMMANDS)
          .filter((c) => c.toLowerCase().includes(query))
          .sort((a, b) => Number(!a.toLowerCase().startsWith(query)) - Number(!b.toLowerCase().startsWith(query)) || a.localeCompare(b))
          .slice(0, 8)
  const pickCommand = (c: string): void => {
    setInput(`/${c} `)
    area.current?.focus()
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Tab' && matches.length && !e.shiftKey) {
      e.preventDefault()
      pickCommand(matches[0])
      return
    }
    if (e.key === 'Tab' && tplMatches.length && !e.shiftKey) {
      e.preventDefault()
      pickTemplate(tplMatches[0])
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!running) void send()
    }
  }

  const saveNote = async (): Promise<void> => {
    setNoting(true)
    const n = await ui.run('session:note', convId)
    setNoting(false)
    if (n === undefined) return
    ui.toast(n ? 'Nota de sesión guardada en la tarea' : 'No hay nada nuevo que registrar desde la última nota')
  }

  const review = async (): Promise<void> => {
    setReviewing(true)
    const id = await ui.run('review:start', taskId)
    setReviewing(false)
    if (id) ui.openChat(taskId, id)
  }

  const summarize = async (): Promise<void> => {
    setSummarizing(true)
    const r = await ui.run('chat:summarize', convId)
    setSummarizing(false)
    if (r) ui.toast(r.mode === 'local' ? 'Resumen simple agregado a «Lo realizado» (no se pudo usar la IA)' : 'Resumen agregado a «Lo realizado» de la tarea')
  }

  // abre la terminal elegida en Ajustes, en la carpeta de la tarea, ya retomando esta conversación
  const provider: Provider = chat?.provider ?? 'claude'
  const ai = provider === 'copilot' ? 'Copilot' : 'Claude'
  const copilotModels = db.settings.copilotModels
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const modelOptions: SelectOption[] =
    provider === 'copilot'
      ? [{ value: '', label: 'Modelo: predeterminado' }, ...copilotModels.map((m) => ({ value: m, label: m }))]
      : [
          { value: '', label: 'Modelo: predeterminado' },
          { value: 'sonnet', label: 'sonnet' },
          { value: 'opus', label: 'opus' },
          { value: 'haiku', label: 'haiku' }
        ]
  if (chat?.model && !modelOptions.some((o) => o.value === chat.model)) modelOptions.push({ value: chat.model, label: chat.model })

  const isolate = async (): Promise<void> => {
    const msg = await ui.run('chat:worktree', convId, 'create')
    if (msg) ui.toast(msg)
  }

  const rewind = async (msgTs: number): Promise<void> => {
    const cp = chat?.checkpoints?.find((c) => c.msgTs === msgTs)
    if (!cp) return
    const ok = await ui.confirm('Los archivos del proyecto volverán a como estaban antes de este mensaje: se deshacen los cambios de la IA y también los tuyos hechos desde entonces. Antes se guarda el estado actual, así que se puede deshacer.', {
      title: 'Volver a antes de este mensaje',
      confirmLabel: 'Volver atrás',
      danger: true
    })
    if (!ok) return
    const msg = await ui.run('chat:restore', convId, cp.id)
    if (msg) ui.toast(msg)
  }

  const continueInTerminal = async (): Promise<void> => {
    if (provider === 'copilot') return ui.toast('Continuar en terminal solo está disponible para conversaciones con Claude', true)
    if (!chat?.sessionId) return ui.toast('Aún no hay conversación que continuar: envía un mensaje primero', true)
    ui.openTerminal(taskId, chat.sessionId)
  }

  const login = async (): Promise<void> => {
    await ui.run('claude:login')
    ui.toast('Terminal abierta: completa el inicio de sesión en el navegador y luego pulsa "Reintentar mensaje"')
  }

  const retry = async (): Promise<void> => {
    const last = [...messages].reverse().find((m) => m.role === 'user')
    if (!last) return ui.toast('No hay mensaje que reintentar', true)
    await ui.run('chat:send', convId, last.text, last.attachments)
  }

  const reset = async (): Promise<void> => {
    if (!(await ui.confirm('Se borrarán los mensajes de esta conversación y empezará de cero. Las demás conversaciones de la tarea no se tocan.', { title: 'Reiniciar conversación', confirmLabel: 'Borrar mensajes', danger: true }))) return
    setLive('')
    await ui.run('chat:reset', convId)
  }

  const desktop = async (): Promise<void> => {
    await ui.run('claude:open', taskId)
    ui.toast('Abriendo Claude Desktop (sesión nueva)')
  }

  const ctxPill = chat?.usage?.contextTokens ? (
    <button className="pill ctx-pill" title="Sesión y contexto: consumo, compactar y resumir" onClick={() => setLayout({ sideOpen: !(lay.sideOpen && lay.sideTab === 'session'), sideTab: 'session' })}>
      <ContextMeter usage={chat.usage} settings={db.settings} />
    </button>
  ) : null
  const summarizeBtn = (
    <button className="ib" disabled={summarizing} onClick={summarize} title={summarizing ? 'Resumiendo…' : 'Resumir: agrega lo hecho a «Lo realizado» de la tarea'} aria-label="Resumir la conversación">
      <G n="sparkle" />
    </button>
  )
  const adv = contextAdvice(chat?.usage, db.settings)
  const tokenPill = chat?.usage?.contextTokens ? (
    <button className={`ctx-tokens ${adv.level}`} title={`${adv.title}: ${adv.text}`} onClick={() => setLayout({ sideOpen: !(lay.sideOpen && lay.sideTab === 'session'), sideTab: 'session' })}>
      <span>
        {fmtTokens(chat.usage.contextTokens)}
        {chat.usage.contextWindow ? ` / ${fmtTokens(chat.usage.contextWindow)}` : ''} tokens
      </span>
      <i>
        <b style={{ width: `${Math.min(100, adv.pct)}%` }} />
      </i>
    </button>
  ) : null
  const checksBtn = chat?.kind !== 'review' ? <ChecksButton taskId={taskId} convId={convId} /> : null
  const baseItems: MenuItem[] = [
            { label: 'Editar tarea', icon: '✎', onSelect: () => task && ui.editTask(task) },
            { label: 'Aislar en una copia propia', icon: '⎇', hint: chat?.worktree ? 'Ya trabaja en una copia aislada' : chat?.sessionId || messages.length ? 'Solo en conversaciones nuevas, sin mensajes' : 'Rama y carpeta propias: varias conversaciones a la vez sin pisarse', disabled: !!chat?.worktree || !!chat?.sessionId || messages.length > 0 || running, onSelect: () => void isolate() },
            { label: 'Revisar código de la rama', icon: '🔍', hint: 'Revisión con IA y simulación, solo lectura', disabled: reviewing, onSelect: () => void review() },
            { label: 'Guardar nota de sesión', icon: '🗒', hint: 'Lo hecho, decidido y pendiente, para retomar después', disabled: noting || running, onSelect: () => void saveNote() },
            { label: 'Abrir en Claude Desktop', icon: '🖥', hint: 'Sesión nueva con el prompt de la tarea', onSelect: () => void desktop() },
            { label: 'Continuar en terminal', icon: '⏎', hint: 'Retoma esta conversación con claude --resume', onSelect: () => void continueInTerminal() },
            { kind: 'sep' },
            { label: 'Reiniciar conversación', icon: '↺', danger: true, onSelect: () => void reset() }
  ]
  // en un panel del Espacio los botones sueltos (tarea, terminal, inspector) pasan al menú «⋯»
  // chat a pantalla completa: Resumir y el inspector pasan al menú «⋯»; Ver tarea, Terminal y Probar van en la fila de la tarea
  const standaloneItems: MenuItem[] = [
    { label: summarizing ? 'Resumiendo…' : 'Resumir en la tarea', icon: '✦', hint: 'Agrega lo hecho a «Lo realizado» de la tarea', disabled: summarizing, onSelect: () => void summarize() },
    { label: lay.sideOpen ? 'Ocultar el inspector' : 'Mostrar el inspector', icon: '▤', hint: 'Sesión, archivos y actividad', onSelect: () => setLayout({ sideOpen: !lay.sideOpen }) },
    { kind: 'sep' },
    ...baseItems
  ]
  const moreItems: MenuItem[] = embedded
    ? [
        { label: 'Ver el detalle de la tarea', icon: 'ℹ', onSelect: () => ui.viewTask(taskId) },
        { label: 'Terminal en la carpeta', icon: '>_', onSelect: () => ui.openTerminal(taskId) },
        { label: lay.sideOpen ? 'Ocultar el inspector' : 'Mostrar el inspector', icon: '▤', hint: 'Sesión, archivos y actividad', onSelect: () => setLayout({ sideOpen: !lay.sideOpen }) },
        { kind: 'sep' },
        ...(extraMenu?.length ? [...extraMenu, { kind: 'sep' } as MenuItem] : []),
        ...baseItems
      ]
    : standaloneItems
  const moreMenu = <Menu trigger={<G n="more" />} className="ib" title="Más acciones" items={moreItems} />

  const body = (
    <>
      <section className="chatpane">
      {!embedded && (
        <div className="chat-head">
          {!convs.open && (
            <button className="ib" title="Mostrar la lista de conversaciones" aria-label="Mostrar la lista de conversaciones" onClick={() => setConvsOpen(true)}>
              <G n="list" />
            </button>
          )}
          <div className="ch-title">
            <b title={task?.title}>{task?.title}</b>
            {folder && (
              <span className="chip" title={folder}>
                <G n="folders" size={11} /> {baseName(folder)}
              </span>
            )}
            {task?.project && task.project !== (folder ? baseName(folder) : '') && <span className="chip ai">{task.project}</span>}
          </div>
          <span className="ch-sp" />
          {tokenPill}
          {!taskSlot && checksBtn}
          {moreMenu}
        </div>
      )}
      {!embedded && taskSlot && checksBtn && createPortal(checksBtn, taskSlot)}
      {embedded && slot && createPortal(<>{ctxPill}{summarizeBtn}{checksBtn}{moreMenu}</>, slot)}
      <WorktreeBar convId={convId} />
      <LimitBanner convId={convId} />
        <div className="chat-main">
          <div
            className="msgs"
            ref={box}
            onScroll={(e) => {
              const el = e.currentTarget
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
            }}
          >
            {messages.length === 0 && !running && (
              <div className="empty">Conversación nueva para esta tarea. {ai} trabajará en la carpeta del proyecto y puede editar archivos.</div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`} data-ai={m.role === 'assistant' ? provider : undefined}>
                {m.role === 'assistant' && (
                  <div className="mhead">
                    <span className="mav" aria-hidden>
                      <G n="sparkle" size={15} />
                    </span>
                    <b className="mwho">{ai}</b>
                    {m.ts > 0 && <span className="time">{hhmm(m.ts)}</span>}
                  </div>
                )}
                {m.role === 'user' && (
                  <div className="mhead">
                    <b className="mwho">Tú</b>
                    {m.ts > 0 && <span className="time">{hhmm(m.ts)}</span>}
                  </div>
                )}
                {m.attachments?.length ? <AttachmentList items={m.attachments} /> : null}
                {m.role === 'user' ? <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span> : <Markdown text={m.text} />}
                {m.context?.length ? (
                  <div className="msg-ctx" title="Datos que se anexaron automáticamente a este mensaje">
                    📎 {m.context.join(' · ')}
                  </div>
                ) : null}
                {m.action === 'login' && (
                  <div className="foot" style={{ marginTop: 8 }}>
                    <button className="btn sm primary" onClick={login}>
                      Abrir terminal: claude auth login
                    </button>
                    <button className="btn sm" onClick={retry}>
                      Reintentar mensaje
                    </button>
                  </div>
                )}
                {m.role === 'user' && chat?.checkpoints?.some((c) => c.msgTs === m.ts) && !running && (
                  <button className="rewind" title="Devuelve los archivos a como estaban justo antes de este mensaje" onClick={() => void rewind(m.ts)}>
                    ↩ Volver a antes de esto
                  </button>
                )}
              </div>
            ))}
            {chat?.pending?.map((p) => (
              <div key={p.id} className="perm">
                <div className="perm-title">
                  {ai} pide permiso · <b>{p.tool === 'Bash' ? 'ejecutar un comando' : p.tool}</b>
                </div>
                <pre className="perm-cmd">{p.target}</pre>
                {p.description && <div className="meta">{p.description}</div>}
                <div className="foot">
                  <button className="btn sm primary" onClick={() => void ui.run('chat:permit', convId, p.id, 'allow')}>
                    Permitir
                  </button>
                  {p.rule && (
                    <button className="btn sm" title="Agrega este comando a la lista permitida de Ajustes" onClick={() => void ui.run('chat:permit', convId, p.id, 'always')}>
                      Permitir siempre «{p.rule}»
                    </button>
                  )}
                  <button className="btn sm danger" onClick={() => void ui.run('chat:permit', convId, p.id, 'deny')}>
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
            {running && (
              <div className="msg assistant live" data-ai={provider}>
                <div className="mhead">
                  <span className="mav" aria-hidden>
                    <G n="sparkle" size={15} />
                  </span>
                  <b className="mwho">{ai}</b>
                  {live && <span className="time">escribiendo…</span>}
                </div>
                {live ? (
                  <Markdown text={live} />
                ) : (
                  <span className="typing">
                    <i />
                    <i />
                    <i />
                    &nbsp;Trabajando…
                  </span>
                )}
              </div>
            )}
          </div>
          <div className={`suggest ${running || input.trim() ? 'hidden' : ''}`}>
            {templates
              .filter((t) => t.pinned)
              .map((t) => (
                <button key={t.id} title={t.text} onClick={() => pickTemplate(t)}>
                  {t.name}
                </button>
              ))}
            {COMMAND_CHIPS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setInput(c)
                  area.current?.focus()
                }}
              >
                {c}
              </button>
            ))}
            <TemplateMenu templates={templates} onPick={pickTemplate} />
          </div>
          {tplMatches.length > 0 && (
            <div className="suggest slash tpl">
              {tplMatches.map((t) => (
                <button key={t.id} onClick={() => pickTemplate(t)} title={t.text}>
                  #{t.name}
                </button>
              ))}
              <span className="meta">Tab elige la primera</span>
            </div>
          )}
          {matches.length > 0 && (
            <div className="suggest slash">
              {matches.map((c) => (
                <button key={c} onClick={() => pickCommand(c)}>
                  /{c}
                </button>
              ))}
              <span className="meta">Tab completa</span>
            </div>
          )}
          {files.length > 0 && (
            <div className="attach-bar">
              <AttachmentList items={files} onRemove={(i) => setFiles((cur) => cur.filter((_, j) => j !== i))} />
            </div>
          )}
          <div
            className={`composer cbox ${dragging ? 'drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <textarea
              ref={area}
              rows={1}
              value={input}
              placeholder={`Escribe a ${ai}…   #  plantillas   /  comandos`}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              onPaste={onPaste}
            />
            <div className="cfoot">
              <button className="ib clip" title="Adjuntar archivos o fotos (también puedes pegar o arrastrar)" aria-label="Adjuntar" onClick={() => void pickFiles()}>
                <G n="files" size={16} />
              </button>
              {chat?.kind !== 'design' && <ContextBar taskId={taskId} kinds={ctxKinds} onChange={setCtxKinds} terminalText={terminalText} />}
              {chat?.kind !== 'design' && (
                <Select
                  className="mini-sel"
                  ariaLabel="Proveedor"
                  title={chat?.sessionId ? 'El proveedor no se puede cambiar una vez iniciada la conversación (reiníciala para cambiarlo)' : 'Con qué se ejecuta esta conversación'}
                  disabled={running || !!chat?.sessionId}
                  value={provider}
                  onChange={(v) => void ui.run('chat:config', convId, { provider: v as Provider })}
                  options={[
                    { value: 'claude', label: 'Claude' },
                    { value: 'copilot', label: 'GitHub Copilot' }
                  ]}
                />
              )}
              <ProfileSelect convId={convId} />
              {chat?.kind !== 'review' && (
                <Select
                  className="mini-sel mode-sel"
                  ariaLabel="Modo"
                  title={provider === 'copilot' ? 'Agent: usa todos los comandos sin preguntar. Ask: solo los permitidos en Ajustes (Copilot no puede preguntar)' : 'Agent: edita y ejecuta sin pedir permiso. Ask: pregunta antes de editar o ejecutar'}
                  disabled={running}
                  value={chat?.mode ?? 'default'}
                  onChange={(v) => void ui.run('chat:config', convId, { mode: v as ChatMode })}
                  options={[
                    ...(chat?.mode ? [] : [{ value: 'default', label: 'Según Ajustes' }]),
                    { value: 'agent', label: '⚡ Agent' },
                    { value: 'ask', label: '🔐 Ask' }
                  ]}
                />
              )}
              <Select
                className="mini-sel"
                ariaLabel="Modelo"
                disabled={running}
                value={chat?.model ?? ''}
                onChange={(v) => void ui.run('chat:config', convId, { model: v })}
                options={modelOptions}
                menuMinWidth={220}
                searchable
                creatable
              />
              <span className="cfoot-sp" />
              {running && <span className="cfoot-run">{ai} está respondiendo…</span>}
              <button
                className={`btn primary send ${running ? 'stop' : ''}`}
                disabled={!running && !input.trim() && !files.length}
                title={running ? `${ai} está respondiendo… · Detener` : 'Enviar (Enter)'}
                onClick={() => (running ? void ui.run('chat:cancel', convId) : void send())}
              >
                {running ? (
                  <IconStop />
                ) : (
                  <>
                    <G n="send" size={14} stroke={2.2} /> Enviar
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="composer-hint">
            <span>
              <kbd>↵</kbd> enviar
            </span>
            <span>
              <kbd>⇧ ↵</kbd> nueva línea
            </span>
            <span>
              <kbd>#</kbd> plantillas
            </span>
            <span>
              <kbd>/</kbd> comandos
            </span>
          </div>
        </div>
      </section>
      <SidePanel convId={convId} mode={embedded ? 'drawer' : 'dock'} />
    </>
  )
  return embedded ? <div className="chat-embed">{body}</div> : body
}
