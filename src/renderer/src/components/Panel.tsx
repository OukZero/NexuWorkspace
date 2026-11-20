import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
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
import { Arc, weekPace } from './Gauges'
import { RefreshLimits } from './Usage'

const h1 = (ms: number): string => (ms / 3600000).toFixed(2).replace('.', ',')
const pctOf = (x: number): number => Math.round(Math.max(0, Math.min(1, x)) * 100)

function Ring({ value, size = 132, stroke = 8, color, children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }): ReactNode {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="tring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color ?? 'url(#ringgrad)'} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${Math.max(0.001, value) * c} ${c}`} style={{ transition: 'stroke-dasharray .6s' }} />
      </svg>
      <div>{children}</div>
    </div>
  )
}

/** Tiempo relativo corto: «hace 2 h», «ayer», «hace 3 días». */
function ago(ts: number): string {
  const h = (Date.now() - ts) / 3600000
  if (h < 1) return `hace ${Math.max(1, Math.round(h * 60))} min`
  if (h < 24) return `hace ${Math.round(h)} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

/** Inicio: enfoque y jornada a la izquierda; línea del día y tareas (arrastrables) al centro; uso de la IA, semana y git a la derecha. */
export function Panel({ compact }: { compact?: boolean }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const now = useNow(1000)
  const pomo = usePomodoro()
  const [title, setTitle] = useState('')
  const [over, setOver] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const dragId = useRef<string | null>(null)

  useEffect(() => {
    input.current?.focus({ preventScroll: true })
  }, [ui.quickTick])

  const work = db.tasks.filter(isWorkTask)
  const run = activeEntry(db)
  const focus: Task | undefined = findTask(db, run?.taskId ?? db.paused) ?? work.find((t) => t.status === 'doing') ?? work.find((t) => t.status === 'today')
  const isRunning = !!run && run.taskId === focus?.id
  const todayKey = dayKey(new Date())
  const todays = work.filter((t) => t.status === 'today' || t.status === 'doing' || (t.status === 'done' && t.doneAt && dayKey(new Date(t.doneAt)) === todayKey))
  const doneN = todays.filter((t) => t.status === 'done').length

  // columnas: en marcha (doing o con timer), rutinas/arrastradas y el resto
  const open = todays.filter((t) => t.status !== 'done')
  const isRoutine = (t: Task): boolean => !!t.fromTemplate || (t.carried ?? 0) > 0
  const going = open.filter((t) => t.status === 'doing' || t.id === run?.taskId)
  const rest = open.filter((t) => !going.includes(t))
  const routines = rest.filter(isRoutine)
  const upNext = rest.filter((t) => !isRoutine(t))

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
  const weekTarget = (db.settings.targetHours || 8) * 5
  // proyección del consumo semanal: uso actual / fracción de la ventana de 7 días ya transcurrida (solo con ≥5 % transcurrido)
  const pace = weekPace(db.limits?.sevenDay)

  // commits del repositorio de la tarea en foco
  const [commits, setCommits] = useState<{ branch: string; ahead: number; behind: number; list: GitCommit[] } | null>(null)
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
        if (alive) setCommits({ branch: st.branch, ahead: st.ahead, behind: st.behind, list: log })
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

  // arrastrar a «En marcha» también arranca el timer; a «Siguientes» la devuelve a «Para hoy»
  const dropIn = (col: 'going' | 'next'): void => {
    setOver(null)
    const id = dragId.current
    dragId.current = null
    if (!id) return
    if (col === 'going') void ui.run('task:save', { id, status: 'doing' }).then(() => ui.run('timer:start', id))
    else void ui.run('task:save', { id, status: 'today' })
  }

  // anillo del enfoque: pomodoro si está activo; si no, el tiempo de esta sesión frente a una hora
  const sessionMs = run ? now - run.start : 0
  const pomoLeft = pomo.on && pomo.endsAt ? Math.max(0, pomo.endsAt - now) : 0
  const pomoTotal = (pomo.phase === 'focus' ? pomo.focusMin : pomo.breakMin) * 60000
  const ringVal = pomo.on && pomo.endsAt ? 1 - pomoLeft / pomoTotal : isRunning ? (sessionMs % 3600000) / 3600000 : 0
  const ringMain = pomo.on && pomo.endsAt ? fmtDur(pomoLeft).slice(3) : isRunning ? fmtDur(sessionMs).replace(/^00:/, '') : '—'
  const ringSub = pomo.on && pomo.endsAt ? (pomo.phase === 'focus' ? 'foco' : 'descanso') : isRunning ? 'en curso' : 'sin timer'
  const folder = focus ? workFolder(focus, db.groups) : ''
  const prio = focus?.priority === 'high' ? { n: 'alta', c: 'bad' } : focus?.priority === 'low' ? { n: 'baja', c: '' } : { n: 'media', c: 'prio' }
  const longDay = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'buenos días' : hour < 20 ? 'buenas tardes' : 'buenas noches'
  const todayEntries = db.entries.filter((e) => dayKey(new Date(e.start)) === todayKey).sort((a, b) => a.start - b.start)
  const segN = Math.max(1, Math.round(target / 3600000))
  const closeAt = ms < target ? new Date(now + (target - ms)).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''

  const card = (t: Task): ReactNode => {
    const spent = taskMs(db, t.id, now)
    const est = t.estimateMin * 60000
    const live = run?.taskId === t.id
    return (
      <div key={t.id} className={`hm-card${live ? ' live' : ''}`} draggable onDragStart={() => (dragId.current = t.id)} onDragEnd={() => { dragId.current = null; setOver(null) }} onClick={() => ui.openTask(t)}>
        <div className="t">{t.title}</div>
        <div className="m">
          {t.project && <span className="chip">{t.project}</span>}
          {(spent > 0 || est > 0) && (
            <span className={`chip${est > 0 && spent > est ? ' bad' : ''}`}>
              {h1(spent)}
              {est > 0 ? ` / ${h1(est)}` : ''} h
            </span>
          )}
          {t.fromTemplate && <span className={`chip${t.carried ? ' bad' : ''}`}>↻ {t.carried ? `${t.carried} d pendiente` : 'rutina'}</span>}
          {t.priority === 'high' && <span className="chip bad">vencida</span>}
          {live && <span className="chip ok">activo</span>}
        </div>
        {est > 0 && (
          <div className="bar" aria-hidden>
            <i style={{ width: `${Math.min(100, (spent / est) * 100)}%` }} />
          </div>
        )}
      </div>
    )
  }

  const column = (key: string, name: string, dot: string, list: Task[], drop?: 'going' | 'next', hint?: string): ReactNode => (
    <div
      className={`hm-col${key === 'rout' ? ' wide' : ''}${over === key ? ' over' : ''}`}
      onDragOver={drop ? (e) => { e.preventDefault(); setOver(key) } : undefined}
      onDragLeave={() => setOver((o) => (o === key ? null : o))}
      onDrop={drop ? () => dropIn(drop) : undefined}
    >
      <header>
        <span className="dot" style={{ background: dot }} />
        <b>{name}</b>
        <span className="n">{list.length}</span>
      </header>
      <div className="hm-cards">
        {list.map(card)}
        {!list.length && <div className="hm-drop">{hint ?? 'Nada por aquí.'}</div>}
      </div>
    </div>
  )

  return (
    <div className={`bento home${compact ? ' compact' : ''}`}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="ringgrad" x1="0" x2="1">
            <stop offset="0" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent2, var(--pink, #ff7ab6))" />
          </linearGradient>
        </defs>
      </svg>

      <div className="home-l">
        <section className="bc hm-focus">
          <div className="eyebrow">Enfoque ahora</div>
          {focus ? (
            <>
              <div className="hm-ring">
                <Ring value={ringVal} size={220} stroke={14}>
                  <b>{ringMain}</b>
                  <small>{ringSub}</small>
                </Ring>
              </div>
              <h2 title="Ver el detalle de la tarea" onClick={() => ui.viewTask(focus.id)}>
                {focus.title}
              </h2>
              <div className="tags">
                <span className={`tag ${prio.c}`}>● Prioridad {prio.n}</span>
                <CiBadges task={focus} />
                <span className="tag">
                  {h1(taskMs(db, focus.id, now))} h{focus.estimateMin ? ` / ${(focus.estimateMin / 60).toFixed(1).replace('.', ',')} h` : ''}
                </span>
                {folder && (
                  <span className="tag" title={folder}>
                    {baseName(folder)}
                  </span>
                )}
                {focus.project && focus.project !== baseName(folder) && <span className="tag">{focus.project}</span>}
                {focus.client && <span className="tag">{focus.client}</span>}
              </div>
              <div className="hm-btns">
                <button className="btn p wide" onClick={() => ui.openChat(focus.id)}>
                  <G n="chat" size={15} /> Abrir chat
                </button>
                {isRunning ? (
                  <button className="btn" onClick={() => void ui.run('timer:pause')}>
                    <G n="pause" size={14} /> Pausar
                  </button>
                ) : (
                  <button className="btn" onClick={() => void (db.paused === focus.id ? ui.run('timer:resume') : ui.run('timer:start', focus.id))}>
                    <G n="play" size={14} /> {db.paused === focus.id ? 'Reanudar' : 'Iniciar'}
                  </button>
                )}
                <button className="btn" disabled={!run} onClick={() => void ui.run('timer:stop')}>
                  <G n="stop" size={14} /> Detener
                </button>
                <button className="btn" onClick={() => ui.openTerminal(focus.id)}>
                  <G n="terminal" size={15} /> Terminal
                </button>
                <button className="btn" onClick={() => void ui.run('vscode:open', focus.folder)}>
                  <G n="code" size={15} /> Código
                </button>
              </div>
            </>
          ) : (
            <div className="cempty">
              <b>Nada en foco</b>
              <span>Escribe una tarea para hoy abajo y pulsa Intro; aquí aparecerá con su timer.</span>
            </div>
          )}
        </section>

        <section className="bc hm-day">
          <div className="card-h">
            <span className="eyebrow">Jornada</span>
            <button className="btn sm" onClick={() => ui.go('hours')}>
              Ver horas
            </button>
          </div>
          <div className="hm-kpi">
            <span className="num">
              {h1(ms)}
              <small> h / {db.settings.targetHours} h</small>
            </span>
            <b>{pctOf(ms / target)} %</b>
          </div>
          <div className="hm-segs" role="progressbar" aria-label="Jornada" aria-valuenow={pctOf(ms / target)} aria-valuemin={0} aria-valuemax={100}>
            {Array.from({ length: segN }, (_, i) => (
              <i key={i}>
                <u style={{ width: `${Math.max(0, Math.min(1, (ms / target) * segN - i)) * 100}%` }} />
              </i>
            ))}
          </div>
          <div className="hm-foot">
            <span>{ms < target ? `Faltan ${h1(target - ms)} h` : 'Objetivo cumplido'}</span>
            {closeAt && <span>Cierre est. {closeAt}</span>}
          </div>
          {meet > 0 && (
            <div className="hm-foot">
              <span>
                Reuniones {h1(meet)} h · {h1(Math.max(0, target - meet))} h para tareas
              </span>
            </div>
          )}
        </section>
      </div>

      <div className="home-c">
        <section className="bc hm-line">
          <div className="card-h">
            <div>
              <span className="eyebrow">Línea del día</span>
              <div className="upd">
                {longDay} · {greeting}
              </div>
            </div>
            <div className="hm-chips">
              <span className="hm-clock" title="Hora actual">
                {new Date(now).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </span>
              <span className="chip ok">
                {todayEntries.length} {todayEntries.length === 1 ? 'sesión' : 'sesiones'}
              </span>
              <span className="chip">{h1(ms)} h</span>
            </div>
          </div>
          {todayEntries.length > 0 || meet > 0 || (db.focusBlocks ?? []).length > 0 ? <DayTimeline day={todayKey} entries={todayEntries} /> : <div className="cempty slim">Aún no registras tiempo hoy. Inicia el timer en una tarea.</div>}
        </section>

        <div className="hm-tasks">
          <div className="hm-th">
            <span className="eyebrow">Tareas de hoy</span>
            <span className="upd">
              {doneN} de {todays.length} completadas
            </span>
            <span className="grow" />
            <button className="btn sm" onClick={() => ui.editTask({})} title="Crear una tarea con todos sus detalles">
              <G n="plus" size={13} /> Nueva tarea
            </button>
          </div>
          <div className="hm-cols">
            {column('going', 'En marcha', 'var(--ok)', going, 'going', 'Arrastra una tarea aquí para empezar su timer')}
            {column('next', 'Siguientes', 'var(--accent)', upNext, 'next')}
            {column('done', 'Completadas', 'var(--muted)', todays.filter((t) => t.status === 'done'), undefined, 'Aún no has completado tareas hoy.')}
            {column('rout', 'Rutinas y pendientes', 'var(--warn)', routines)}
          </div>
        </div>
      </div>

      <div className="home-r">
        <section className="bc hm-ai">
          <div className="card-h">
            <span className="eyebrow">Uso de la IA</span>
            <span className="upd">{db.limits ? new Date(db.limits.updatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
            <RefreshLimits />
          </div>
          <div className="hm-gauges">
            <Arc label="Sesión · 5 h" w={db.limits?.fiveHour} />
            <Arc label="Semana · 7 d" w={db.limits?.sevenDay} />
          </div>
          {!db.limits && <div className="meta">Aparece tras la primera respuesta de Claude. Copilot no informa estos límites.</div>}
          {pace && (
            <div className={`pace${pace.pct >= 100 ? ' over' : ''}`}>
              Cerrarás la semana en <b>{Math.min(pace.pct, 999)} %</b>
              {pace.pct >= 100 ? ' · conviene bajar el ritmo o usar Haiku' : ''}
            </div>
          )}
          <button className="link" onClick={() => ui.go('usage')}>
            Ver el consumo completo →
          </button>
        </section>

        <section className="bc hm-week">
          <div className="card-h">
            <span className="eyebrow">Semana</span>
            <span className="upd">
              {h1(weekMs)} / {weekTarget} h
            </span>
          </div>
          <div className="hm-days">
            {week.map((d, i) => (
              <div key={d.key} className={d.key === todayKey ? 'today' : ''} title={`${d.key} · ${h1(d.ms)} h`}>
                <b className={d.ms > 0 ? 'on' : ''}>{d.ms > 0 ? (d.ms / 3600000).toFixed(1).replace('.', ',') : '0'}</b>
                <span>{'LMXJVSD'[i]}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bc hm-git">
          <div className="card-h">
            <span className="eyebrow">Git{commits ? ` · ${commits.branch}` : ''}</span>
            {commits && <span className={`chip${commits.ahead || commits.behind ? ' bad' : ' ok'}`}>{commits.ahead || commits.behind ? `${commits.ahead ? `↑${commits.ahead} ` : ''}${commits.behind ? `↓${commits.behind}` : ''}` : 'al día'}</span>}
          </div>
          {commits?.list.length ? (
            <ul className="commits">
              {commits.list.map((c) => (
                <li key={c.hash}>
                  <em>{c.short}</em>
                  <div>
                    <div className="msg" title={c.subject}>
                      {c.subject}
                    </div>
                    <div className="meta">{ago(c.date)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="cempty slim">{focus ? 'La tarea no tiene un repositorio con commits.' : 'Sin tarea en foco.'}</div>
          )}
          {focus && commits && (
            <button className="link" onClick={() => ui.openGit(focus.id)}>
              Abrir Git →
            </button>
          )}
        </section>
      </div>

      <label className="addin hm-add">
        <G n="plus" size={16} />
        <input ref={input} value={title} placeholder="Escribe una tarea y pulsa Enter: queda en «Para hoy»" aria-label="Nueva tarea para hoy" onChange={(e) => setTitle(e.target.value)} onKeyDown={quickAdd} />
        <button type="button" className="btn sm" title="Tarea detallada: descripción, carpeta, estimación…" aria-label="Crear tarea detallada" onClick={() => ui.editTask({ title })}>
          <G n="edit" size={13} /> Con detalles
        </button>
        {isRunning && <span className="hm-timer">{fmtDur(sessionMs)}</span>}
      </label>
    </div>
  )
}
