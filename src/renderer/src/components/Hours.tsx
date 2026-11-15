import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { DB, Entry } from '../../../shared/types'
import { findTask, useDB, useNow } from '../store'
import { baseName, dayKey, fmtH, hhmm, isWorkTask, toTs } from '../utils'
import { useUi } from '../ui'
import { DailyView } from './DailyView'
import { DatePicker } from './DatePicker'
import { DayTimeline } from './DayTimeline'
import { meetingMs, useCalendar } from '../calendar'
import { EmptyState } from './EmptyState'
import { G } from './glyphs'
import { Heatmap } from './Heatmap'
import { RedminePanel } from './RedminePanel'
import { WeekView } from './WeekView'

const dayEntries = (db: DB, day: string): Entry[] => {
  const f = toTs(day, '00:00')
  return db.entries.filter((e) => e.start >= f && e.start < f + 86400000).sort((a, b) => a.start - b.start)
}

/** Horas con coma decimal, como se ven en toda la app. */
const hc = (ms: number): string => fmtH(ms).replace('.', ',')
const n2 = (x: number): string => x.toFixed(2).replace('.', ',')

/** Mini calendario del día: una celda por hora, con marca verde donde hubo tiempo registrado y la hora actual resaltada. */
function HourStrip({ day, entries, now }: { day: string; entries: Entry[]; now: number }): ReactNode {
  const dayStart = toTs(day, '00:00')
  const spans = entries.map((e) => [e.start, e.end || now] as const)
  const hourOf = (ts: number): number => Math.floor((ts - dayStart) / 3600000)
  const first = spans.length ? hourOf(Math.min(...spans.map((s) => s[0]))) : 8
  const last = spans.length ? hourOf(Math.max(...spans.map((s) => s[1]))) + 1 : 18
  const from = Math.max(0, Math.min(8, first))
  const to = Math.min(23, Math.max(18, last))
  const isToday = day === dayKey(new Date(now))
  const curHour = new Date(now).getHours()
  const cells: ReactNode[] = []
  for (let h = from; h <= to; h++) {
    const a = dayStart + h * 3600000
    const has = spans.some(([s, e]) => s < a + 3600000 && e > a)
    cells.push(
      <div key={h} className={`${has ? 'has' : ''}${isToday && h === curHour ? ' cur' : ''}`} title={has ? `${String(h).padStart(2, '0')}:00 · con tiempo registrado` : `${String(h).padStart(2, '0')}:00`}>
        {String(h).padStart(2, '0')}
      </div>
    )
  }
  return (
    <div className="hr-strip" style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }} aria-label="Horas del día con tiempo registrado">
      {cells}
    </div>
  )
}

function EntryRow({ entry: e }: { entry: Entry }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const now = useNow(30000)
  const t = findTask(db, e.taskId)
  const day = dayKey(new Date(e.start))
  const sub = [t?.client, t?.project].filter(Boolean).join(' · ')

  const commitTime = (field: 'start' | 'end', input: HTMLInputElement): void => {
    const cur = field === 'start' ? e.start : (e.end as number)
    if (!input.value || input.value === hhmm(cur)) return
    const ts = toTs(day, input.value)
    const start = field === 'start' ? ts : e.start
    const end = field === 'end' ? ts : e.end
    if (end !== null && end <= start) {
      ui.toast('La hora fin debe ser mayor al inicio', true)
      input.value = hhmm(cur)
      return
    }
    void ui.run('entry:update', { id: e.id, [field]: ts })
  }

  return (
    <tr>
      <td className="hr-task" title={sub ? `${t?.title ?? ''} · ${sub}` : t?.title}>
        <b>{t?.title || '(tarea borrada)'}</b>
        {sub && <span>{sub}</span>}
      </td>
      <td>
        <input className="hours-in" type="time" aria-label="Inicio" key={e.start} defaultValue={hhmm(e.start)} onBlur={(ev) => commitTime('start', ev.target)} />
      </td>
      <td>
        {e.end ? (
          <input className="hours-in" type="time" aria-label="Fin" key={e.end} defaultValue={hhmm(e.end)} onBlur={(ev) => commitTime('end', ev.target)} />
        ) : (
          <span className="chip">en curso</span>
        )}
      </td>
      <td className="r">
        <b>{hc((e.end || now) - e.start)}</b>
      </td>
      <td>
        <input
          className="note-in"
          key={e.note}
          defaultValue={e.note}
          placeholder="qué hiciste…"
          aria-label="Nota para imputar"
          onBlur={(ev) => {
            if (ev.target.value !== e.note) void ui.run('entry:update', { id: e.id, note: ev.target.value })
          }}
        />
      </td>
      <td>
        <button
          className="hr-x"
          aria-label="Eliminar el registro"
          title="Eliminar el registro"
          onClick={() => {
            void ui.run('entry:delete', e.id)
            ui.toast('Registro eliminado', false, { label: 'Deshacer', run: () => void ui.run('undo:restore', { entries: [e] }) })
          }}
        >
          <G n="x" size={13} />
        </button>
      </td>
    </tr>
  )
}

export function Hours(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const now = useNow(30000)
  const today = dayKey(new Date())
  const [day, setDay] = useState(today)
  const [mode, setMode] = useState<'day' | 'week' | 'daily' | 'year'>(() => {
    try {
      return localStorage.getItem('shutoki.hoursMode') === 'daily' ? 'daily' : 'day'
    } catch {
      return 'day'
    }
  })
  useEffect(() => {
    const open = (): void => setMode('daily')
    window.addEventListener('shutoki:daily', open)
    return () => window.removeEventListener('shutoki:daily', open)
  }, [])
  const [commits, setCommits] = useState<Record<string, Record<string, string[]>>>({})
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`)
  const [to, setTo] = useState(today)

  const es = useMemo(() => dayEntries(db, day), [db, day])
  const total = es.reduce((a, e) => a + ((e.end || now) - e.start), 0)
  const missing = db.settings.targetHours - total / 3600000
  const cal = useCalendar()
  const meet = cal.status?.connected ? meetingMs(cal.events, day) / 3600000 : 0
  const byTask: Record<string, number> = {}
  es.forEach((e) => {
    byTask[e.taskId] = (byTask[e.taskId] || 0) + ((e.end || now) - e.start)
  })
  const pend = day === today ? db.tasks.filter((t) => isWorkTask(t) && (t.status === 'today' || t.status === 'doing')) : []
  const dayCommits = commits[day]

  const shiftDay = (n: number): void => {
    const d = new Date(`${day}T12:00:00`)
    d.setDate(d.getDate() + n)
    setDay(dayKey(d))
  }

  const copyDraft = async (): Promise<void> => {
    const lines: Record<string, { ms: number; notes: string[] }> = {}
    for (const e of es) {
      const t = findTask(db, e.taskId)
      if (!t) continue
      const k = [t.client, t.project, t.title].filter(Boolean).join(' · ')
      const l = (lines[k] ??= { ms: 0, notes: [] })
      l.ms += (e.end || now) - e.start
      if (e.note) l.notes.push(e.note)
    }
    const txt = Object.entries(lines)
      .map(([k, v]) => `- ${k}: ${fmtH(v.ms)} h${v.notes.length ? ' — ' + v.notes.join('; ') : ''}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(`Horas ${day}\n${txt}`)
      ui.toast('Resumen copiado')
    } catch {
      ui.toast('No se pudo copiar', true)
    }
  }

  const fillNotes = async (): Promise<void> => {
    const n = await ui.run('draft:fillNotes', day)
    if (n !== undefined) ui.toast(n ? `${n} notas rellenadas con commits` : 'Sin commits que usar (¿git instalado y carpetas con repo?)', !n)
  }

  const loadCommits = async (): Promise<void> => {
    const c = await ui.run('git:commits', day)
    setCommits((prev) => ({ ...prev, [day]: c ?? {} }))
  }

  const exportXlsx = async (): Promise<void> => {
    const p = await ui.run('excel:export', from, to)
    if (p) ui.toast('Exportado: ' + p)
  }

  // el título de la pantalla ya está en la barra superior: aquí solo van el modo y, a la derecha, el día
  const header = (
    <div className="hr-top">
      <div className="seg grad hr-seg">
        <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>
          Día
        </button>
        <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>
          Semana
        </button>
        <button className={mode === 'year' ? 'on' : ''} onClick={() => setMode('year')}>
          Año
        </button>
        <button className={mode === 'daily' ? 'on' : ''} onClick={() => setMode('daily')}>
          Daily
        </button>
      </div>
      {mode === 'day' && (
        <div className="hr-month" role="group" aria-label="Día">
          <button aria-label="Día anterior" title="Día anterior" onClick={() => shiftDay(-1)}>
            <G n="chevron" size={15} />
          </button>
          <DatePicker value={day} ariaLabel="Día" onChange={setDay} className="hr-dp" />
          <button aria-label="Día siguiente" title="Día siguiente" onClick={() => shiftDay(1)}>
            <G n="chevron" size={15} />
          </button>
        </div>
      )}
    </div>
  )

  if (mode === 'daily') {
    return (
      <>
        {header}
        <DailyView />
      </>
    )
  }

  if (mode === 'year') {
    return (
      <>
        {header}
        <Heatmap
          onDay={(d) => {
            setDay(d)
            setMode('day')
          }}
        />
      </>
    )
  }

  if (mode === 'week') {
    return (
      <>
        {header}
        <WeekView
          onDay={(d) => {
            setDay(d)
            setMode('day')
          }}
        />
      </>
    )
  }

  const closed = es.filter((e) => e.end)
  const noNote = closed.filter((e) => !e.note?.trim()).length
  const imputable = closed.filter((e) => e.note?.trim()).reduce((a, e) => a + ((e.end as number) - e.start), 0)
  const nTasks = Object.keys(byTask).length
  const target = db.settings.targetHours
  const SEGS = 8
  const filled = Math.min(SEGS, Math.round((total / 3600000 / (target || 8)) * SEGS))
  // hora estimada de cierre: ahora + lo que falta (solo tiene sentido hoy)
  const closeAt = day === today && missing > 0 ? new Date(now + missing * 3600000).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''

  return (
    <>
      {header}
      <div className="hr-stats">
        <div className="bc hr-stat main">
          <span className="eyebrow">Total del día</span>
          <b className="num">
            {hc(total)}
            <small> h / {target} h</small>
          </b>
          <div className="hr-segs" aria-hidden>
            {Array.from({ length: SEGS }, (_, i) => (
              <i key={i} className={i < filled ? 'on' : ''} />
            ))}
          </div>
        </div>
        <div className="bc hr-stat">
          <span className="eyebrow">Faltan</span>
          <b className="num">
            {n2(Math.max(0, missing))}
            <small> h</small>
          </b>
          <span className="meta">{missing <= 0 ? 'Objetivo cumplido' : closeAt ? `Cierre estimado ${closeAt}` : 'Para llegar al objetivo'}</span>
        </div>
        <div className="bc hr-stat">
          <span className="eyebrow">Sesiones</span>
          <b className="num">{es.length}</b>
          <span className="meta">
            {nTasks} {nTasks === 1 ? 'tarea distinta' : 'tareas distintas'}
          </span>
        </div>
        <div className="bc hr-stat warn">
          <span className="eyebrow">Por imputar</span>
          <b className="num">
            {n2(imputable / 3600000)}
            <small> h</small>
          </b>
          <span className="meta">{noNote ? `${noNote} ${noNote === 1 ? 'registro sin nota' : 'registros sin nota'}` : 'Todo con nota'}</span>
        </div>
      </div>
      <div className="hr-grid">
      <div className="hr-main">
      <section className="bc hr-draft">
        <div className="hr-draft-h">
          <div>
            <div className="hr-draft-t">
              <b className="h2">Borrador del día</b>
              <span className={`chip ${missing > 0 ? 'prio' : 'ok'}`}>{missing > 0 ? `Faltan ${n2(missing)} h para ${db.settings.targetHours} h` : `Objetivo cumplido (${hc(total)} h)`}</span>
            </div>
            {meet > 0 && (
              <div className="meta">
                Reuniones del día: {n2(meet)} h · quedan {n2(Math.max(0, db.settings.targetHours - meet))} h para tareas
              </div>
            )}
            {pend.length > 0 && <div className="meta">Pendientes hoy: {pend.map((t) => t.title).join(' · ')}</div>}
          </div>
          <div className="hr-draft-btns">
            <button className="btn sm" onClick={loadCommits} title="Muestra los commits del día para recordar qué hiciste">
              <G n="git" size={13} /> Ver commits
            </button>
            <button className="btn sm" onClick={fillNotes}>
              <G n="sparkle" size={13} /> Rellenar notas con commits
            </button>
            <button className="btn sm" onClick={copyDraft}>
              <G n="files" size={13} /> Copiar resumen
            </button>
            <button className="btn p sm" onClick={() => ui.addEntry(day)}>
              <G n="plus" size={13} /> Entrada manual
            </button>
          </div>
        </div>
        <div className="hr-sep" />
        {es.length > 0 ? <DayTimeline day={day} entries={es} /> : <HourStrip day={day} entries={es} now={now} />}
      </section>

      <section className="bc hr-table">
        <div className="hr-scroll">
          <table className="tbl hr-tbl">
            <colgroup>
              <col style={{ width: 300 }} />
              <col style={{ width: 104 }} />
              <col style={{ width: 104 }} />
              <col style={{ width: 70 }} />
              <col />
              <col style={{ width: 44 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Tarea</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th className="r">Horas</th>
                <th>Nota para imputar</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {es.length ? (
                es.map((e) => <EntryRow key={e.id} entry={e} />)
              ) : (
                <tr>
                  <td colSpan={6}>
                    <EmptyState kind="hours" title="Sin registros este día" text="Inicia el timer en una tarea o añade una entrada manual para registrar tu tiempo." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="hr-total">
          <span className="muted">Total del día</span>
          <b className="num">{hc(total)} h</b>
          <span className="dim">/ {db.settings.targetHours} h</span>
        </div>
      </section>

      {dayCommits && (
        <section className="bc hr-commits">
          <div className="card-h">
            <span className="eyebrow">Commits del día (ayuda para recordar)</span>
          </div>
          {Object.keys(dayCommits).length ? (
            Object.entries(dayCommits).map(([f, c]) => (
              <div key={f} className="hr-commit">
                <b>{baseName(f)}</b>
                {c.map((m, i) => (
                  <div key={i} className="commit">
                    • {m}
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div className="empty">No hay commits (o git no está disponible).</div>
          )}
        </section>
      )}
      </div>

      <div className="hr-side">
        <section className="bc">
          <div className="card-h">
            <span className="eyebrow">Resumen por tarea</span>
          </div>
          {Object.keys(byTask).length ? (
            <div className="hr-sum">
              {Object.entries(byTask).map(([id, ms]) => {
                const t = findTask(db, id)
                const sub = [t?.client, t?.project].filter(Boolean).join(' · ')
                return (
                  <div key={id} className="hr-sum-row" title={sub || undefined}>
                    <b>{t?.title ?? '(tarea borrada)'}</b>
                    <b className="num">{hc(ms)} h</b>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="empty">Aún no hay tiempo registrado este día.</div>
          )}
        </section>
        <RedminePanel day={day} />
      <section className="bc hr-export">
        <div>
          <div className="eyebrow">Exportar a Excel</div>
          <div className="muted hr-note">Rango para el archivo .xlsx</div>
        </div>
        <div className="hr-grow" />
        <div className="hr-field">
          <label>Desde</label>
          <DatePicker value={from} ariaLabel="Desde" onChange={setFrom} />
        </div>
        <div className="hr-field">
          <label>Hasta</label>
          <DatePicker value={to} ariaLabel="Hasta" onChange={setTo} />
        </div>
        <button className="btn p" onClick={exportXlsx}>
          <G n="download" size={15} /> Exportar .xlsx
        </button>
      </section>
      </div>
      </div>
    </>
  )
}
