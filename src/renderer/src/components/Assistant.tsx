import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CONFIRM_ACTIONS, type PlannedAction } from '../../../shared/types'
import { saveNote } from '../notes'
import { useDB } from '../store'
import { useUi, type Ui, type View } from '../ui'
import { addTab } from '../webTabs'
import { G } from './glyphs'
import { runLaunch } from './LaunchButton'

const EXAMPLES = ['Crea una tarea «Revisar el PR de login» con prioridad alta', 'Reserva 45 minutos mañana a las 10 para la tarea de Redmine', 'Abre el entorno de la tarea actual y empieza el temporizador', 'Resume la página que tengo abierta en el panel Web']

/** Ejecuta una acción ya validada por el proceso principal. Devuelve un texto cuando la acción produce una respuesta. */
async function execute(ui: Ui, a: PlannedAction, latestConv: (taskId: string) => string | null): Promise<string | null> {
  switch (a.type) {
    case 'send_prompt': {
      const convId = (!a.newChat && latestConv(a.taskId)) || (await ui.run('chat:new', a.taskId))
      if (!convId) throw new Error('No se pudo crear la conversación')
      await ui.run('chat:send', convId, a.prompt)
      return 'Mensaje enviado a Claude. La respuesta aparece en la conversación de la tarea.'
    }
    case 'open_view':
      ui.go(a.view as View)
      return null
    case 'create_task':
      await ui.run('task:save', { title: a.title, description: a.description ?? '', priority: a.priority ?? 'med', status: a.status ?? 'today' })
      return null
    case 'set_status':
      if (a.status === 'done') ui.celebrate()
      await ui.run('task:save', { id: a.taskId, status: a.status })
      return null
    case 'start_timer':
      await ui.run('timer:start', a.taskId)
      return null
    case 'stop_timer':
      await ui.run('timer:stop')
      return null
    case 'create_note':
      await saveNote({ title: a.title, body: a.body, taskId: a.taskId ?? null })
      return null
    case 'block_time':
      await ui.run('focus:save', { taskId: a.taskId, start: a.start, end: a.start + a.minutes * 60_000 })
      return null
    case 'launch_env':
      await runLaunch(ui, a.taskId)
      return null
    case 'open_web':
      addTab(a.url)
      ui.go('web')
      return null
    case 'read_page':
      return (await ui.run('assistant:read', a.url ?? null, a.question)) ?? null
  }
}

/** Asistente (Ctrl+J): escribes o dictas lo que quieres y propone acciones de la app; tú confirmas antes de que se ejecuten. */
export function Assistant({ onClose }: { onClose: () => void }): ReactNode {
  const ui = useUi()
  const db = useDB()
  const [text, setText] = useState('')
  const [say, setSay] = useState('')
  const [actions, setActions] = useState<PlannedAction[]>([])
  const [on, setOn] = useState<boolean[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [phase, setPhase] = useState<'idle' | 'planning' | 'running'>('idle')
  const area = useRef<HTMLTextAreaElement>(null)
  const busy = phase !== 'idle'

  useEffect(() => area.current?.focus(), [])

  const latestConv = (taskId: string): string | null =>
    Object.entries(db.chats)
      .filter(([, c]) => c.taskId === taskId)
      .sort((x, y) => y[1].createdAt - x[1].createdAt)[0]?.[0] ?? null

  const plan = async (req = text): Promise<void> => {
    if (!req.trim() || busy) return
    setPhase('planning')
    setAnswers([])
    const p = await ui.run('assistant:plan', req)
    setPhase('idle')
    if (!p) return
    setSay(p.say)
    setActions(p.actions)
    setOn(p.actions.map(() => true))
    // sin acciones que requieran confirmación, se ejecutan directamente
    if (p.actions.length && !p.actions.some((a) => CONFIRM_ACTIONS.includes(a.type))) void execList(p.actions)
  }

  const execList = async (chosen: PlannedAction[]): Promise<void> => {
    if (!chosen.length) return
    setPhase('running')
    const out: string[] = []
    let failed = 0
    for (const a of chosen) {
      try {
        const r = await execute(ui, a, latestConv)
        if (r) out.push(r)
      } catch (e) {
        failed++
        ui.toast(`${a.label}: ${(e as Error).message}`, true)
      }
    }
    setPhase('idle')
    if (out.length) {
      setAnswers(out)
      setActions([])
      setSay(failed ? `Listo, con ${failed} error${failed > 1 ? 'es' : ''}.` : 'Listo.')
    } else {
      if (!failed) ui.toast(chosen.length === 1 ? 'Hecho' : `${chosen.length} acciones ejecutadas`)
      onClose()
    }
  }

  const run = (): Promise<void> => execList(actions.filter((_, i) => on[i]))

  const counted = on.filter(Boolean).length
  const tasks = db.tasks.length

  return (
    <div className="dialog assistant" role="dialog" aria-label="Asistente">
      <div className="as-head">
        <G n="sparkle" size={16} />
        <b>Asistente</b>
        <span className="meta">Dile qué hacer; verás las acciones y confirmas antes de ejecutarlas.</span>
      </div>
      <div className="as-in">
        <textarea
          ref={area}
          value={text}
          rows={2}
          placeholder="Ej.: crea una tarea para revisar el PR y empieza el temporizador…"
          aria-label="Instrucción"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void plan()
            }
          }}
        />
        <div className="as-btns">
          <button className="btn primary" disabled={busy || !text.trim()} onClick={() => void plan()}>
            {phase === 'planning' ? 'Pensando…' : 'Enviar'}
          </button>
        </div>
      </div>
      {!say && !busy && (
        <div className="as-ex">
          {EXAMPLES.map((x) => (
            <button key={x} className="chip" onClick={() => setText(x)}>
              {x}
            </button>
          ))}
          {!tasks && <div className="meta">Aún no tienes tareas: puedes pedirle que cree una.</div>}
        </div>
      )}
      {say && <div className="as-say">{say}</div>}
      {actions.length > 0 && (
        <div className="as-list">
          {actions.map((a, i) => (
            <label key={i} className="as-act">
              <input type="checkbox" style={{ width: 'auto' }} checked={on[i] ?? false} onChange={(e) => setOn((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} />
              <span>{a.label}</span>
            </label>
          ))}
          <div className="foot">
            <button className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" disabled={!counted || busy} onClick={() => void run()}>
              {phase === 'running' ? 'Ejecutando…' : `Ejecutar ${counted === actions.length ? '' : `${counted} de `}${actions.length === 1 ? 'la acción' : `${actions.length} acciones`}`}
            </button>
          </div>
        </div>
      )}
      {answers.map((r, i) => (
        <div key={i} className="as-ans">
          {r}
        </div>
      ))}
      <div className="meta as-foot">Enter envía · Mayús+Enter salto de línea · Esc cierra</div>
    </div>
  )
}
