import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Attachment, Chat, DB, Task } from '../../../shared/types'
import { contextAdvice } from '../../../shared/advice'
import { convLabel, openConvs } from '../conversations'
import { activeEntry, call, findTask, useDB, useNow } from '../store'
import { fmtDur, isWorkTask } from '../utils'
import { IconSend, IconStop } from './icons'
import { DockChat } from './DockChat'

const TARGET_KEY = 'shutoki.miniTarget' // 'auto', id de conversación o 'task:<id>' (tarea sin conversación)
const TABS_KEY = 'shutoki.tabs' // pestañas abiertas en la ventana principal

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

/** Tareas con pestaña abierta en la ventana principal. */
function openTaskIds(): string[] {
  try {
    const v = JSON.parse(read(TABS_KEY) ?? 'null') as { tasks?: unknown } | null
    return Array.isArray(v?.tasks) ? v.tasks.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export type Target = { conv: string; task: Task } | { conv: null; task: Task } | null

// destino automático: la conversación más reciente de la tarea del timer; si no hay timer, la última usada
function autoTarget(db: DB): Target {
  const lastTs = (id: string): number => {
    const m = db.chats[id].messages
    return m.length ? m[m.length - 1].ts : db.chats[id].createdAt
  }
  const a = activeEntry(db)
  const taskId = a ? a.taskId : db.paused
  if (taskId) {
    const task = findTask(db, taskId)
    const conv = openConvs(db, taskId).sort((x, y) => lastTs(y.id) - lastTs(x.id))[0]
    if (task) return conv ? { conv: conv.id, task } : { conv: null, task }
  }
  let best: string | null = null
  for (const [id, c] of Object.entries(db.chats)) {
    if (c.closed || c.kind || !db.tasks.some((t) => t.id === c.taskId && t.status !== 'done')) continue
    if (!best || lastTs(id) > lastTs(best)) best = id
  }
  const task = best ? findTask(db, db.chats[best].taskId) : undefined
  return best && task ? { conv: best, task } : null
}

function resolve(db: DB, value: string): Target {
  if (value.startsWith('task:')) {
    const task = findTask(db, value.slice(5))
    if (task) return { conv: null, task }
  } else if (value !== 'auto') {
    const c = db.chats[value]
    const task = c && !c.closed ? findTask(db, c.taskId) : undefined
    if (c && task) return { conv: value, task }
  }
  return autoTarget(db)
}

export function Mini(): ReactNode {
  const db = useDB()
  const now = useNow()
  const [flash, setFlash] = useState<{ text: string; until: number } | null>(null)
  const [value, setValue] = useState(read(TARGET_KEY) ?? 'auto')
  const [, setTabsTick] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  // las pestañas de la ventana principal cambian en otro documento: nos avisa el evento storage
  useEffect(() => {
    const on = (e: StorageEvent): void => {
      if (e.key === TABS_KEY) setTabsTick((n) => n + 1)
    }
    addEventListener('storage', on)
    return () => removeEventListener('storage', on)
  }, [])

  const auto = autoTarget(db)
  const target = resolve(db, value)
  const chat = target?.conv ? db.chats[target.conv] : undefined
  const running = !!chat?.running
  const a = activeEntry(db)
  const hasTimer = !!(a || db.paused)

  // opciones: conversaciones de las tareas abiertas en pestañas, y el resto de tareas (se crea una conversación al enviar)
  const openTasks = openTaskIds()
    .map((id) => findTask(db, id))
    .filter((t): t is Task => !!t)
  const others = db.tasks.filter((t) => isWorkTask(t) && t.folder && t.status !== 'done' && !openTasks.some((o) => o.id === t.id)).slice(0, 30)
  const autoLabel = auto ? `${auto.task.title}${auto.conv ? ` · ${convLabel(db.chats[auto.conv])}` : ''}` : 'sin tarea activa'

  const pick = (v: string): void => {
    setValue(v)
    try {
      localStorage.setItem(TARGET_KEY, v)
    } catch {
      /* sin storage */
    }
    input.current?.focus()
  }

  // Claude terminó: listo para la siguiente instrucción
  useEffect(() => {
    if (!running && document.hasFocus()) input.current?.focus()
  }, [running, target?.conv, target?.task.id])

  // el borde se ilumina mientras la IA responde: se nota de reojo sin abrir la ventana principal
  useEffect(() => {
    document.body.dataset.busy = running ? '1' : ''
  }, [running])

  const showError = (msg: string): void => setFlash({ text: msg, until: Date.now() + 5000 })

  const format = db.settings.miniFormat ?? 'full'
  const err = flash && flash.until > now ? flash.text : null
  const name = target ? `${target.task.title}${chat ? ` · ${convLabel(chat)}` : ''}` : ''
  const ai = chat?.provider === 'copilot' ? 'Copilot' : 'Claude'

  if (format === 'edge') return <Edge running={running} timer={a ? fmtDur(now - a.start) : db.paused ? 'en pausa' : ''} />

  if (format === 'full') {
    return (
      <Full
        db={db}
        now={now}
        target={target}
        chat={chat}
        a={a}
        hasTimer={hasTimer}
        running={running}
        ai={ai}
        name={name}
        err={err}
        value={value}
        autoLabel={autoLabel}
        openTasks={openTasks}
        others={others}
        pick={pick}
        showError={showError}
      />
    )
  }

  return (
    <>
      <div className="top">
        <span className={`dot ${a ? '' : 'off'}`} />
        <select hidden={format === 'timer'} value={value} title="Conversación a la que se envía el mensaje" onChange={(e) => pick(e.target.value)}>
          <option value="auto">{`Auto · ${autoLabel}`}</option>
          {openTasks.map((t) => {
            const convs = openConvs(db, t.id)
            return (
              <optgroup key={t.id} label={t.title}>
                {convs.map(({ id, chat: c }) => (
                  <option key={id} value={id}>
                    {`${c.running ? '⟳ ' : ''}${convLabel(c)}`}
                  </option>
                ))}
                {!convs.length && <option value={`task:${t.id}`}>Nueva conversación</option>}
              </optgroup>
            )
          })}
          {others.length > 0 && (
            <optgroup label="Otras tareas (nueva conversación)">
              {others.map((t) => (
                <option key={t.id} value={`task:${t.id}`}>
                  {t.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {format === 'timer' && <span className="grow" />}
        <div className="t">{a ? fmtDur(now - a.start) : ''}</div>
        <button title="Pausar / reanudar" style={{ visibility: hasTimer ? 'visible' : 'hidden' }} onClick={() => call(a ? 'timer:pause' : 'timer:resume')}>
          {a ? '⏸' : '▶'}
        </button>
        <button title="Detener timer" style={{ visibility: hasTimer ? 'visible' : 'hidden' }} onClick={() => call('timer:stop')}>
          ■
        </button>
        <button title="Abrir ventana principal" onClick={() => call('win:restore')}>
          ⤢
        </button>
        <button title="Ocultar la ventana flotante (vuelve al minimizar la principal; se configura en Ajustes)" onClick={() => call('mini:hide')}>
          –
        </button>
      </div>
    </>
  )
}

/** Formato «barra»: franja en el borde izquierdo; al pasar el mouse muestra opciones y «Chat» abre una vista más grande con las tareas y sus conversaciones. */
function Edge({ running, timer }: { running: boolean; timer: string }): ReactNode {
  const [stage, setStage] = useState<'bar' | 'menu' | 'chat'>('bar')
  const box = useRef<HTMLDivElement>(null)
  const leave = useRef(0)
  useEffect(() => {
    document.body.classList.add('edge-mode')
    return () => document.body.classList.remove('edge-mode')
  }, [])
  // la ventana pide el tamaño de la etapa: franja fina → menú → chat grande
  useEffect(() => {
    const [w, h] = stage === 'bar' ? [8, 160] : stage === 'menu' ? [260, 176] : [440, 580]
    void call('mini:resize', w, h).catch(() => {})
  }, [stage])
  const enter = (): void => {
    window.clearTimeout(leave.current)
    setStage((s) => (s === 'bar' ? 'menu' : s))
  }
  // al salir el mouse se vuelve a la franja, con un pequeño margen para no cerrarse por un roce
  const out = (): void => {
    window.clearTimeout(leave.current)
    // el chat abierto no se esconde solo (se perdería lo que se está escribiendo); se vuelve con «‹»
    leave.current = window.setTimeout(() => setStage((s) => (s === 'menu' ? 'bar' : s)), 600)
  }
  return (
    <div ref={box} className={`edge edge-${stage}`} onMouseEnter={enter} onMouseLeave={out}>
      {stage === 'bar' ? (
        <div className={`edge-grip ${running ? 'on' : ''}`} aria-hidden />
      ) : stage === 'menu' ? (
        <div className="edge-menu">
          <div className="edge-head">
            <span className={`edge-dot ${running ? 'on' : ''}`} />
            <span className="edge-ttl">Shutoki</span>
            <span className="edge-t">{timer || (running ? 'trabajando…' : 'en espera')}</span>
          </div>
          <button className="edge-act" style={{ ['--i' as string]: 0 }} onClick={() => setStage('chat')}>
            <span className="edge-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg></span>
            <span className="edge-tx"><b>Chat IA</b><small>Tareas y conversaciones</small></span>
          </button>
          <button className="edge-act" style={{ ['--i' as string]: 1 }} onClick={() => call('win:restore')}>
            <span className="edge-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg></span>
            <span className="edge-tx"><b>Abrir la app</b><small>Volver a la ventana completa</small></span>
          </button>
        </div>
      ) : (
        <div className="edge-chat">
          <div className="edge-bar"><strong>Chat AI</strong><span className="grow" /><button title="Volver al menú" onClick={() => setStage('menu')}>‹</button><button title="Abrir la app" onClick={() => call('win:restore')}>⤢</button></div>
          <DockChat big />
        </div>
      )}
    </div>
  )
}

type Mode = 'chat' | 'task' | 'note'
const OPEN_KEY = 'nexo.miniOpen'

interface FullProps {
  db: DB
  now: number
  target: Target
  chat: Chat | undefined
  a: ReturnType<typeof activeEntry>
  hasTimer: boolean
  running: boolean
  ai: string
  name: string
  err: string | null
  value: string
  autoLabel: string
  openTasks: Task[]
  others: Task[]
  pick: (v: string) => void
  showError: (msg: string) => void
}

/** Formato completo de la ventana flotante: píldora compacta o vista expandida con estado, respuesta, permisos y entrada. */
function Full(p: FullProps): ReactNode {
  const { db, now, target, chat, a, hasTimer, running, ai, err, value, autoLabel, openTasks, others, pick, showError } = p
  const [open, setOpen] = useState(read(OPEN_KEY) !== '0')
  const [text, setText] = useState('')
  const [mode, setMode] = useState<Mode>('chat')
  const [files, setFiles] = useState<Attachment[]>([])
  const [more, setMore] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const toggle = (): void => {
    const v = !open
    setOpen(v)
    try {
      localStorage.setItem(OPEN_KEY, v ? '1' : '0')
    } catch {
      /* sin storage */
    }
  }

  // la ventana se ajusta a su contenido: la píldora es más estrecha y la vista expandida crece con lo que muestre
  useEffect(() => {
    const el = root.current
    if (!el) return
    const send = (): void => void call('mini:resize', open ? 420 : 380, el.offsetHeight + 2).catch(() => {})
    send()
    const ro = new ResizeObserver(send)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  useEffect(() => {
    if (open && !running && document.hasFocus()) input.current?.focus()
  }, [open, running, target?.conv])

  const pending = chat?.pending ?? []
  const perm = pending[0]
  const act = chat?.activity ?? []
  const live = [...act].reverse().find((x) => x.status === 'running')
  const lastMsg = [...(chat?.messages ?? [])].reverse().find((m) => m.role === 'assistant')
  const adv = contextAdvice(chat?.usage, db.settings)
  const pct = Math.min(100, Math.round(adv.pct))
  const state = perm ? 'wait' : running ? 'work' : 'ready'
  const fileOf = (s: string): string => s.split(/[\\/]/).pop() ?? s
  const status = perm
    ? 'En pausa · necesita tu aprobación'
    : running
      ? live
        ? `${live.label} ${fileOf(live.target)}…`.trim()
        : `${ai} está trabajando…`
      : err ?? (target ? 'Listo' : 'Elige una tarea')
  const placeholder = !target ? 'Elige una tarea para escribirle' : running ? `${ai} está trabajando…` : mode === 'task' ? 'Título de la tarea nueva…' : mode === 'note' ? 'Escribe una nota…' : `Escribe a ${ai}…`

  const attach = async (): Promise<void> => {
    if (!target) return
    try {
      const conv = target.conv ?? (await call('chat:new', target.task.id))
      if (!target.conv) pick(conv)
      const r = await call('attach:pick', conv)
      if (r.length) setFiles((cur) => [...cur, ...r])
    } catch (e) {
      showError((e as Error).message)
    }
  }

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!target) return
    if (running && target.conv) {
      call('chat:cancel', target.conv).catch((x: Error) => showError(x.message))
      return
    }
    const msg = text.trim()
    if (!msg && !(mode === 'chat' && files.length)) return
    const sent = files
    setText('')
    setFiles([])
    try {
      if (mode === 'task') {
        await call('task:save', { title: msg })
      } else if (mode === 'note') {
        await call('notes:save', { body: msg, taskId: target.task.id })
      } else {
        const convId = target.conv ?? (await call('chat:new', target.task.id))
        if (!target.conv) pick(convId) // la tarea ya tiene conversación: seguimos en ella
        await call('chat:send', convId, msg || 'Mira los archivos adjuntos.', sent)
      }
    } catch (x) {
      setText(msg)
      setFiles(sent)
      showError((x as Error).message)
    }
  }

  const timer = a ? fmtDur(now - a.start) : db.paused ? 'en pausa' : ''
  const pauseBtn = (
    <button title="Pausar / reanudar" style={{ display: hasTimer ? undefined : 'none' }} onClick={() => call(a ? 'timer:pause' : 'timer:resume')}>
      {a ? '⏸' : '▶'}
    </button>
  )

  if (!open) {
    return (
      <div ref={root} className="mini pill" data-state={state}>
        <span className="sdot" />
        <span className="pname" title={target?.task.title}>
          {target ? target.task.title : 'Sin tarea activa'}
        </span>
        <span className="t">{timer}</span>
        {pauseBtn}
        <button title="Expandir" onClick={toggle}>
          ⤢
        </button>
      </div>
    )
  }

  return (
    <div ref={root} className="mini" data-state={state}>
      <div className="top">
        <span className="sdot" />
        <select value={value} title="Conversación a la que se envía el mensaje" onChange={(e) => pick(e.target.value)}>
          <option value="auto">{`Auto · ${autoLabel}`}</option>
          {openTasks.map((t) => {
            const convs = openConvs(db, t.id)
            return (
              <optgroup key={t.id} label={t.title}>
                {convs.map(({ id, chat: c }) => (
                  <option key={id} value={id}>
                    {`${c.running ? '⟳ ' : ''}${convLabel(c)}`}
                  </option>
                ))}
                {!convs.length && <option value={`task:${t.id}`}>Nueva conversación</option>}
              </optgroup>
            )
          })}
          {others.length > 0 && (
            <optgroup label="Otras tareas (nueva conversación)">
              {others.map((t) => (
                <option key={t.id} value={`task:${t.id}`}>
                  {t.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <div className="t">{timer}</div>
        {pauseBtn}
        <button title="Detener timer" style={{ display: hasTimer ? undefined : 'none' }} onClick={() => call('timer:stop')}>
          ■
        </button>
        <button title="Abrir ventana principal" onClick={() => call('win:restore')}>
          ⤢
        </button>
        <button title="Contraer a píldora" onClick={toggle}>
          –
        </button>
        <button title="Ocultar la ventana flotante (vuelve al minimizar la principal; se configura en Ajustes)" onClick={() => call('mini:hide')}>
          ⌄
        </button>
        <span className="sep" />
        <button className="quit" title="Cerrar Nexu por completo" onClick={() => confirm('¿Cerrar Nexu por completo? Se detendrá el timer y todo lo que esté en segundo plano.') && void call('app:quit')}>
          ✕
        </button>
      </div>

      <div className="status">
        {state === 'work' && <span className="spin" />}
        <span className={`stext ${err ? 'err' : ''}`}>{status}</span>
        {chat?.usage?.contextTokens ? (
          <span className="ctx" title={`Contexto: ${adv.title}`}>
            <small>contexto</small>
            <i className={pct >= 80 ? 'hi' : pct >= 50 ? 'mid' : ''}>
              <b style={{ width: `${pct}%` }} />
            </i>
            <small>{pct} %</small>
          </span>
        ) : null}
      </div>

      {lastMsg && !perm && (
        <div className={`say ${more ? 'open' : ''}`} onClick={() => setMore((v) => !v)} title={more ? 'Ver menos' : 'Ver más'}>
          {lastMsg.text}
          <span className="more">{more ? 'Ver menos' : 'Ver más'}</span>
        </div>
      )}

      {perm ? (
        <div className="permcard">
          <div>
            {ai} quiere ejecutar: <code>{perm.target}</code>
          </div>
          <div className="pbtns">
            <button className="go" onClick={() => call('chat:permit', target?.conv ?? '', perm.id, 'allow').catch((x: Error) => showError(x.message))}>
              Permitir
            </button>
            <button onClick={() => call('chat:permit', target?.conv ?? '', perm.id, 'deny').catch((x: Error) => showError(x.message))}>Rechazar</button>
          </div>
        </div>
      ) : (
        files.length > 0 && (
          <div className="chips">
            {files.map((f, i) => (
              <span key={f.path} className="chip">
                {f.name}
                <button title="Quitar" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )
      )}

      <form className="cap" autoComplete="off" onSubmit={submit}>
        <button type="button" title="Adjuntar archivos" disabled={!target || mode !== 'chat'} onClick={() => void attach()}>
          📎
        </button>
        <input id="msg" ref={input} className={err ? 'err' : ''} value={text} maxLength={4000} disabled={!target || running} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
        <span className="seg">
          {(['chat', 'task', 'note'] as Mode[]).map((m) => (
            <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {m === 'chat' ? 'Chat' : m === 'task' ? 'Tarea' : 'Nota'}
            </button>
          ))}
        </span>
        <button id="send" type="submit" className={running ? 'stop' : ''} disabled={!target || (!running && !text.trim() && !files.length)} title={running ? 'Detener respuesta' : 'Enviar (Enter)'}>
          {running ? <IconStop /> : <IconSend />}
        </button>
      </form>
    </div>
  )
}
