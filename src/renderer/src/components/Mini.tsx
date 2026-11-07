import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { DB, Task } from '../../../shared/types'
import { convLabel, openConvs } from '../conversations'
import { activeEntry, call, findTask, useDB, useNow } from '../store'
import { fmtDur, isWorkTask } from '../utils'
import { IconSend, IconStop } from './icons'

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

type Target = { conv: string; task: Task } | { conv: null; task: Task } | null

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
  const [text, setText] = useState('')
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

  const showError = (msg: string): void => setFlash({ text: msg, until: Date.now() + 5000 })

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!target) return
    if (running && target.conv) {
      call('chat:cancel', target.conv).catch((err: Error) => showError(err.message))
      return
    }
    const msg = text.trim()
    if (!msg) return
    setText('')
    try {
      const convId = target.conv ?? (await call('chat:new', target.task.id))
      if (!target.conv) pick(convId) // la tarea ya tiene conversación: seguimos en ella
      await call('chat:send', convId, msg)
    } catch (err) {
      setText(msg)
      showError((err as Error).message)
    }
  }

  const format = db.settings.miniFormat ?? 'full'
  const err = flash && flash.until > now ? flash.text : null
  const name = target ? `${target.task.title}${chat ? ` · ${convLabel(chat)}` : ''}` : ''
  const ai = chat?.provider === 'copilot' ? 'Copilot' : 'Claude'
  const placeholder = err ?? (!target ? 'Elige una tarea para escribirle' : running ? `${ai} está trabajando…` : `Escribe a ${ai} (${name})…`)

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
      {format === 'full' && (
      <form className="send-row" autoComplete="off" onSubmit={submit}>
        <input
          id="msg"
          ref={input}
          className={err ? 'err' : ''}
          value={text}
          maxLength={4000}
          disabled={!target || running}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
        />
        <button id="send" type="submit" className={running ? 'stop' : ''} disabled={!target || (!running && !text.trim())} title={running ? 'Detener respuesta' : 'Enviar (Enter)'}>
          {running ? <IconStop /> : <IconSend />}
        </button>
      </form>
      )}
    </>
  )
}
