import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import type { GitCommit, LimitWindow, Task } from '../../../shared/types'
import { workFolder } from '../../../shared/util'
import { usePomodoro } from '../pomodoro'
import { activeEntry, findTask, msToday, taskMs, useDB, useNow } from '../store'
import { useUi } from '../ui'
import { baseName, dayKey, fmtDur, isWorkTask } from '../utils'
import { CiBadges } from './CiBadges'
import { DayTimeline } from './DayTimeline'
import { meetingMs, useCalendar } from '../calendar'
import { G } from './glyphs'
import { TaskRow } from './TaskRow'

const h1 = (ms: number): string => (ms / 3600000).toFixed(2).replace('.', ',')
const pctOf = (x: number): number => Math.round(Math.max(0, Math.min(1, x)) * 100)

function Ring({ value, size = 128, stroke = 7, color, children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }): ReactNode {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="tring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--gl2)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color ?? 'url(#ringgrad)'} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${Math.max(0.001, value) * c} ${c}`} style={{ transition: 'stroke-dasharray .6s' }} />
      </svg>
      <div>{children}</div>
    </div>
  )
}

function Bar({ label, w, warn }: { label: string; w?: LimitWindow; warn?: boolean }): ReactNode {
  const now = Date.now() / 1000
  const left = w ? Math.max(0, w.resetsAt - now) : 0
  const reset = !w ? 'sin datos todavía' : left <= 0 ? 'ya se reinició' : left < 3600 ? `se reinicia en ${Math.ceil(left / 60)} min` : left < 86400 ? `se reinicia en ${Math.floor(left / 3600)} h ${Math.round((left % 3600) / 60)} min` : `se reinicia en ${Math.floor(left / 86400)} d ${Math.round((left % 86400) / 3600)} h`
  return (
    <div className="ur">
      <div>
        <b>{label}</b>
        <b className="num">{w ? `${pctOf(w.utilization)} %` : '—'}</b>
      </div>
      <div className="hb" role="progressbar" aria-label={label} aria-valuenow={w ? pctOf(w.utilization) : 0} aria-valuemin={0} aria-valuemax={100}>
        <i className={warn || (w && w.utilization > 0.6) ? 'w' : ''} style={{ width: `${w ? pctOf(w.utilization) : 0}%` }} />
      </div>
      <small>{reset}</small>
    </div>
  )
}

/** Panel principal: lo que estás haciendo ahora, la jornada, el uso de la IA, tus tareas de hoy, la semana y el repositorio. */
export function Panel({ compact }: { compact?: boolean }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const now = useNow(1000)
  const pomo = usePomodoro()
  const [tab, setTab] = useState<'all' | 'open' | 'done'>('all')
  const [title, setTitle] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus({ preventScroll: true })
  }, [ui.quickTick])

  const work = db.tasks.filter(isWorkTask)
  const run = activeEntry(db)
  const focus: Task | undefined = findTask(db, run?.taskId ?? db.paused) ?? work.find((t) => t.status === 'doing') ?? work.find((t) => t.status === 'today')
  const isRunning = !!run && run.taskId === focus?.id
  const todayKey = dayKey(new Date())
  const todays = work.filter((t) => t.status === 'today' || t.status === 'doing' || (t.status === 'done' && t.doneAt && dayKey(new Date(t.doneAt)) === todayKey))
  const shown = todays.filter((t) => (tab === 'all' ? true : tab === 'open' ? t.status !== 'done' : t.status === 'done'))
  const doneN = todays.filter((t) => t.status === 'done').length

  // jornada y semana
  const ms = msToday(db, now)
  const cal = useCalendar()
  const meet = cal.status?.connected ? meetingMs(cal.events, todayKey) : 0
  const target = (db.settings.targetHours || 8) * 3600000
  const week = useMemo(() => {
    const monday = new Date()
    monday.setHours(0, 0, 0, 0)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    const days = Array.from({ length: 7 }, (_, i) => {
      const s = new Date(monday)
      s.setDate(s.getDate() + i)
      return { start: s.getTime(), key: dayKey(s), ms: 0 }
    })
    for (const e of db.entries) {
      const end = e.end || now
      for (const d of days) {
        const a = Math.max(e.start, d.start)
        const b = Math.min(end, d.start + 86400000)
        if (b > a) d.ms += b - a
      }
    }
    return days
  }, [db.entries, now])
  const weekMs = week.reduce((a, d) => a + d.ms, 0)
  const maxDay = Math.max(target, ...week.map((d) => d.ms))

  // commits del repositorio de la tarea en foco
  const [commits, setCommits] = useState<{ branch: string; list: GitCommit[] } | null>(null)
  useEffect(() => {
    let alive = true
    setCommits(null)
    if (!focus) return
    void (async () => {
      try {
        const repos = await window.api.call('git:repos', focus.id)
        const dir = focus.branchDir || repos.find((r) => r.isRepo)?.dir
        if (!dir) return
        const [log, st] = await Promise.all([window.api.call('git:log', dir, 4), window.api.call('git:status', dir)])
        if (alive) setCommits({ branch: st.branch, list: log })
      } catch {
        /* sin repositorio: la tarjeta muestra un aviso */
      }
    })()
    return () => {
      alive = false
    }
  }, [focus?.id])

  const quickAdd = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter' || !title.trim()) return
    const t = title.trim()
    setTitle('')
    void ui.run('task:save', { title: t, status: 'today' })
  }

  // anillo del enfoque: pomodoro si está activo; si no, el tiempo de esta sesión frente a una hora
  const sessionMs = run ? now - run.start : 0
  const pomoLeft = pomo.on && pomo.endsAt ? Math.max(0, pomo.endsAt - now) : 0
  const pomoTotal = (pomo.phase === 'focus' ? pomo.focusMin : pomo.breakMin) * 60000
  const ringVal = pomo.on && pomo.endsAt ? 1 - pomoLeft / pomoTotal : isRunning ? (sessionMs % 3600000) / 3600000 : 0
  const ringMain = pomo.on && pomo.endsAt ? fmtDur(pomoLeft).slice(3) : isRunning ? fmtDur(sessionMs).replace(/^00:/, '') : '—'
  const ringSub = pomo.on && pomo.endsAt ? (pomo.phase === 'focus' ? 'foco' : 'descanso') : isRunning ? 'esta sesión' : 'sin timer'
  const folder = focus ? workFolder(focus, db.groups) : ''

  return (
    <div className={`bento${compact ? ' compact' : ''}`}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="ringgrad" x1="0" x2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--pink, #ff7ab6)" />
          </linearGradient>
        </defs>
      </svg>

      <section className="bc focus s7">
        <h3>
          Enfoque ahora
          {focus && (
            <span className={`tag ${isRunning ? 'ok' : ''}`}>
              <i className="dot" aria-hidden />
              {isRunning ? 'en curso' : db.paused === focus.id ? 'en pausa' : 'siguiente'}
            </span>
          )}
        </h3>
        {focus ? (
          <div className="fwrap">
            <Ring value={ringVal}>
              <b>{ringMain}</b>
              <small>{ringSub}</small>
            </Ring>
            <div className="ftxt">
              <div className="tags">
                <span className="tag">{focus.priority === 'high' ? 'Alta' : focus.priority === 'low' ? 'Baja' : 'Media'}</span>
                {focus.project && <span className="tag">{focus.project}</span>}
                {focus.client && <span className="tag">{focus.client}</span>}
              </div>
              <h2>{focus.title}</h2>
              <div className="tags">
                <CiBadges task={focus} />
                <span className="tag">{h1(taskMs(db, focus.id, now))} h{focus.estimateMin ? ` / ${(focus.estimateMin / 60).toFixed(1).replace('.', ',')} h` : ''}</span>
                {folder && <span className="tag" title={folder}>{baseName(folder)}</span>}
              </div>
              <div className="fbtns">
                <button className="btn p" onClick={() => ui.openChat(focus.id)}>
                  <G n="chat" size={15} /> Abrir chat
                </button>
                {isRunning ? (
                  <button className="btn" onClick={() => void ui.run('timer:pause')}>
                    <G n="pause" size={14} /> Pausar
                  </button>
                ) : (
                  <button className="btn" onClick={() => void (db.paused === focus.id ? ui.run('timer:resume') : ui.run('timer:start', focus.id))}>
                    <G n="play" size={14} /> {db.paused === focus.id ? 'Reanudar' : 'Iniciar timer'}
                  </button>
                )}
                <button className="btn" onClick={() => ui.viewTask(focus.id)} title="Ver el detalle de la tarea">
                  <G n="info" size={15} /> Ver tarea
                </button>
                <button className="btn" onClick={() => ui.openTerminal(focus.id)}>
                  <G n="terminal" size={15} /> Terminal
                </button>
                <button className="btn" onClick={() => void ui.run('vscode:open', focus.folder)}>
                  <G n="code" size={15} /> Código
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="cempty">
            <b>Nada en foco</b>
            <span>Escribe una tarea para hoy abajo y pulsa Intro; aquí aparecerá con su timer.</span>
          </div>
        )}
      </section>

      <section className="bc s5">
        <h3>
          Uso de la IA <span>{db.limits ? `actualizado ${new Date(db.limits.updatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
        </h3>
        <Bar label="Sesión · 5 h" w={db.limits?.fiveHour} />
        <Bar label="Semana · 7 días" w={db.limits?.sevenDay} />
        {!db.limits && <div className="meta">Aparece tras la primera respuesta de Claude. Copilot no informa estos límites.</div>}
        <button className="link" onClick={() => ui.go('usage')}>
          Ver el consumo completo
        </button>
      </section>

      <section className="bc s3">
        <h3>Jornada</h3>
        <div className="gauge">
          <Ring value={ms / target} size={92} stroke={11} color="var(--ok)">
            <b style={{ fontSize: 17 }}>{pctOf(ms / target)} %</b>
          </Ring>
          <div>
            <div className="big num">{h1(ms)} h</div>
            <small>
              de {db.settings.targetHours} h{ms < target ? ` · faltan ${h1(target - ms)} h` : ' · objetivo cumplido'}
            </small>
            {meet > 0 && (
              <small style={{ display: 'block' }}>
                reuniones {h1(meet)} h · {h1(Math.max(0, target - meet))} h para tareas
              </small>
            )}
          </div>
        </div>
        <div className="fbtns">
          <button className="btn sm" onClick={() => ui.go('hours')}>
            <G n="hours" size={14} /> Ver horas
          </button>
        </div>
      </section>

      <section className="bc s9">
        <h3>
          Línea del día <span>{new Date().toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        </h3>
        {db.entries.some((e) => dayKey(new Date(e.start)) === todayKey) || meet > 0 || (db.focusBlocks ?? []).length > 0 ? <DayTimeline day={todayKey} entries={db.entries.filter((e) => dayKey(new Date(e.start)) === todayKey).sort((a, b) => a.start - b.start)} /> : <div className="cempty slim">Aún no registras tiempo hoy. Inicia el timer en una tarea.</div>}
      </section>

      <section className="bc s5">
        <h3>
          Tareas de hoy <span>{doneN} de {todays.length}</span>
        </h3>
        <div className="tabs3" role="tablist">
          {([['all', 'Todas'], ['open', 'Pendientes'], ['done', 'Hechas']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
        <div className="tl-list">
          {shown.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
          {!shown.length && <div className="cempty slim">{tab === 'done' ? 'Aún no completas nada hoy.' : 'Nada pendiente para hoy.'}</div>}
        </div>
        <label className="addin">
          <G n="plus" size={16} />
          <input ref={input} value={title} placeholder="Nueva tarea para hoy…" aria-label="Nueva tarea para hoy" onChange={(e) => setTitle(e.target.value)} onKeyDown={quickAdd} />
          <button type="button" className="ib sm" title="Tarea detallada: descripción, carpeta, estimación…" aria-label="Crear tarea detallada" onClick={() => ui.editTask({ title })}>
            <G n="edit" size={15} />
          </button>
          <kbd>↵</kbd>
        </label>
      </section>

      <section className="bc s4">
        <h3>
          Semana <span>{h1(weekMs)} h</span>
        </h3>
        <div className="wk">
          {week.map((d, i) => {
            const isToday = d.key === todayKey
            return (
              <div key={d.key} className={isToday ? 't' : ''} title={`${d.key} · ${h1(d.ms)} h`}>
                <i style={{ '--h': `${Math.max(4, (d.ms / maxDay) * 100)}%` } as CSSProperties} />
                {'LMXJVSD'[i]}
              </div>
            )
          })}
        </div>
      </section>

      <section className="bc s3">
        <h3>
          Git {commits && <span className="mono br">{commits.branch}</span>}
        </h3>
        {commits?.list.length ? (
          commits.list.map((c) => (
            <div className="cm" key={c.hash}>
              <i />
              <div>
                <b title={c.subject}>{c.subject}</b>
                <small>
                  {c.short} · {new Date(c.date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                </small>
              </div>
            </div>
          ))
        ) : (
          <div className="cempty slim">{focus ? 'La tarea no tiene un repositorio con commits.' : 'Sin tarea en foco.'}</div>
        )}
      </section>
    </div>
  )
}
