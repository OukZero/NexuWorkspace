import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent, KeyboardEvent, ReactNode } from 'react'
import type { Attachment, Provider } from '../../../shared/types'
import { workFolder } from '../../../shared/util'
import { convLabel } from '../conversations'
import { findTask, useDB } from '../store'
import { baseName, hhmm } from '../utils'
import { useUi } from '../ui'
import { IconSend, IconStop } from './icons'
import { Markdown } from './Markdown'
import { Select, type SelectOption } from './Select'
import { ContextMeter } from './SessionPanel'
import { SidePanel } from './SidePanel'

const SUGGESTIONS: Array<[string, string]> = [
  ['Resume lo hecho', 'Resume en pocas líneas qué has hecho hasta ahora y qué falta.'],
  ['Revisa los cambios', 'Revisa los cambios que hiciste y busca posibles errores.'],
  ['Escribe tests', 'Escribe tests para los cambios realizados.'],
  ['Explica el código', 'Explícame cómo funciona el código relevante para esta tarea.'],
  ['Siguiente paso', '¿Cuál es el siguiente paso recomendado?'],
  ['/compact', '/compact'],
  ['/context', '/context']
]

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
export function ChatView({ convId }: { convId: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const chat = db.chats[convId]
  const taskId = chat?.taskId ?? ''
  const task = findTask(db, taskId)
  const folder = task ? workFolder(task, db.groups) : ''
  const messages = chat?.messages ?? []
  const running = !!chat?.running

  const [input, setInput] = useState('')
  const [live, setLive] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [files, setFiles] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const stick = useRef(true) // true = el usuario está al final y seguimos el scroll

  // primera conversación de la tarea: precarga el prompt para revisarlo y enviarlo con Enter
  useEffect(() => {
    let alive = true
    area.current?.focus()
    const taskHasChat = Object.values(db.chats).some((c) => c.taskId === taskId && c.messages.length > 0)
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

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!text && !files.length) return
    const sent = files
    setInput('')
    setFiles([])
    setLive('')
    stick.current = true
    const r = await ui.run('chat:send', convId, text, sent)
    if (r === undefined) {
      // falló: no perder lo escrito ni los adjuntos
      setInput(text)
      setFiles(sent)
    }
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
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (!running) void send()
    }
  }

  const summarize = async (): Promise<void> => {
    setSummarizing(true)
    const r = await ui.run('chat:summarize', convId)
    setSummarizing(false)
    if (r) ui.toast(r.mode === 'local' ? 'Resumen simple agregado a «Lo realizado» (no se pudo usar la IA)' : 'Resumen agregado a «Lo realizado» de la tarea')
  }

  // abre la terminal elegida en Ajustes, en la carpeta de la tarea, ya retomando esta conversación
  const provider: Provider = chat?.provider ?? 'claude'
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
    if (!confirm('¿Borrar los mensajes de esta conversación y empezar de cero? Las demás conversaciones de la tarea no se tocan.')) return
    setLive('')
    await ui.run('chat:reset', convId)
  }

  const desktop = async (): Promise<void> => {
    await ui.run('claude:open', taskId)
    ui.toast('Abriendo Claude Desktop (sesión nueva)')
  }

  return (
    <>
      <div className="chat-head">
        <button className="btn sm" onClick={() => ui.go(ui.panel)}>
          ← Volver
        </button>
        <div className="grow">
          <b>{task?.title}</b>
          <div className="meta">
            {task?.client} {task?.project && <span className="chip">{task.project}</span>}{' '}
            <span title={folder}>📁 {folder ? baseName(folder) : 'sin carpeta'}</span>
            {chat && <span title="Conversación actual"> · {convLabel(chat)}</span>}
          </div>
        </div>
        {chat?.usage?.contextTokens ? <ContextMeter usage={chat.usage} settings={db.settings} /> : null}
        <button className="btn sm" disabled={summarizing} onClick={summarize} title="Genera un resumen de la conversación y lo agrega a «Lo realizado» de la tarea">
          {summarizing ? 'Generando resumen…' : '✦ Resumir en la tarea'}
        </button>
        <button className="btn sm" onClick={() => task && ui.editTask(task)} title="Ver / editar la tarea">
          Ver tarea
        </button>
        <button className="btn sm" onClick={desktop} title="Abre una sesión nueva en Claude Desktop con el prompt de la tarea">
          Abrir en Claude Desktop
        </button>
        <button className="btn sm" onClick={() => ui.openTerminal(taskId)} title="Terminal en la carpeta del proyecto (Ctrl+`)">
          &gt;_ Terminal
        </button>
        <button className="btn sm" onClick={() => void continueInTerminal()} title="Abre la terminal en la carpeta del proyecto y retoma esta misma conversación con claude --resume">
          Continuar en terminal
        </button>
        <button className="btn sm danger" onClick={reset}>
          Reiniciar
        </button>
      </div>
      <div className="chat-wrap">
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
              <div className="empty">Conversación nueva para esta tarea. Claude trabajará en la carpeta del proyecto y puede editar archivos.</div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                {m.attachments?.length ? <AttachmentList items={m.attachments} /> : null}
                {m.role === 'user' ? <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span> : <Markdown text={m.text} />}
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
                {m.role !== 'system' && m.ts > 0 && <span className="time">{hhmm(m.ts)}</span>}
              </div>
            ))}
            {chat?.pending?.map((p) => (
              <div key={p.id} className="perm">
                <div className="perm-title">
                  Claude pide permiso · <b>{p.tool === 'Bash' ? 'ejecutar un comando' : p.tool}</b>
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
              <div className="msg assistant live">
                {live ? (
                  <Markdown text={live} />
                ) : (
                  <span className="typing">
                    <i />
                    <i />
                    <i />
                    &nbsp;Claude está trabajando…
                  </span>
                )}
              </div>
            )}
          </div>
          <div className={`suggest ${running ? 'hidden' : ''}`}>
            {SUGGESTIONS.map(([label, text]) => (
              <button
                key={label}
                onClick={() => {
                  setInput((cur) => (cur.trim() ? cur.trim() + '\n' : '') + text)
                  area.current?.focus()
                }}
              >
                {label}
              </button>
            ))}
          </div>
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
            className={`composer ${dragging ? 'drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <button className="btn clip" title="Adjuntar archivos o fotos (también puedes pegar o arrastrar)" onClick={() => void pickFiles()}>
              📎
            </button>
            <textarea
              ref={area}
              rows={1}
              value={input}
              placeholder="Escribe a Claude… (pega o arrastra fotos y archivos)"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              onPaste={onPaste}
            />
            <button
              className={`btn primary send ${running ? 'stop' : ''}`}
              disabled={!running && !input.trim() && !files.length}
              title={running ? 'Detener respuesta' : 'Enviar (Enter)'}
              onClick={() => (running ? void ui.run('chat:cancel', convId) : void send())}
            >
              {running ? <IconStop /> : <IconSend />}
            </button>
          </div>
          <div className="composer-hint">
            <span className="hint-pick">
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
              <span>Enter envía · Shift+Enter nueva línea</span>
            </span>
            <span>{running ? `${provider === 'copilot' ? 'Copilot' : 'Claude'} está respondiendo…` : ''}</span>
          </div>
        </div>
        <SidePanel convId={convId} />
      </div>
    </>
  )
}
