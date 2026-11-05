import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { DB, Entry } from '../../../shared/types'
import { findTask, useDB, useNow } from '../store'
import { baseName, dayKey, fmtH, hhmm, isWorkTask, toTs } from '../utils'
import { useUi } from '../ui'
import { DailyView } from './DailyView'
import { DatePicker } from './DatePicker'
import { EmptyState } from './EmptyState'
import { RedminePanel } from './RedminePanel'
import { WeekView } from './WeekView'

const dayEntries = (db: DB, day: string): Entry[] => {
  const f = toTs(day, '00:00')
  return db.entries.filter((e) => e.start >= f && e.start < f + 86400000).sort((a, b) => a.start - b.start)
}

function EntryRow({ entry: e }: { entry: Entry }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const now = useNow(30000)
  const t = findTask(db, e.taskId)
  const day = dayKey(new Date(e.start))

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
      <td>
        {t?.title || '(tarea borrada)'}
        <div className="meta">
          {t?.client} {t?.project}
        </div>
      </td>
      <td>
        <input type="time" key={e.start} defaultValue={hhmm(e.start)} onBlur={(ev) => commitTime('start', ev.target)} />
      </td>
      <td>
        {e.end ? (
          <input type="time" key={e.end} defaultValue={hhmm(e.end)} onBlur={(ev) => commitTime('end', ev.target)} />
        ) : (
          <span className="chip">en curso</span>
        )}
      </td>
      <td>{fmtH((e.end || now) - e.start)}</td>
      <td>
        <input
          key={e.note}
          defaultValue={e.note}
          placeholder="qué hiciste…"
          onBlur={(ev) => {
            if (ev.target.value !== e.note) void ui.run('entry:update', { id: e.id, note: ev.target.value })
          }}
        />
      </td>
      <td>
        <button
          className="icon"
          aria-label="Eliminar el registro"
          onClick={() => {
            void ui.run('entry:delete', e.id)
            ui.toast('Registro eliminado', false, { label: 'Deshacer', run: () => void ui.run('undo:restore', { entries: [e] }) })
          }}
        >
          ✕
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
  const [mode, setMode] = useState<'day' | 'week' | 'daily'>(() => {
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
  const byTask: Record<string, number> = {}
  es.forEach((e) => {
    byTask[e.taskId] = (byTask[e.taskId] || 0) + ((e.end || now) - e.start)
  })
  const pend = day === today ? db.tasks.filter((t) => isWorkTask(t) && (t.status === 'today' || t.status === 'doing')) : []
  const dayCommits = commits[day]

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

  const header = (
    <>
      <h1>Horas</h1>
      <div className="sub">Revisa el día o la semana, corrige y exporta a Excel para imputar</div>
      <div className="seg" style={{ width: 'fit-content', marginBottom: 14 }}>
        <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>
          Día
        </button>
        <button className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>
          Semana
        </button>
        <button className={mode === 'daily' ? 'on' : ''} onClick={() => setMode('daily')}>
          Daily
        </button>
      </div>
    </>
  )

  if (mode === 'daily') {
    return (
      <>
        {header}
        <DailyView />
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

  return (
    <>
      {header}
      <div className="row" style={{ cursor: 'default', display: 'block', borderColor: missing > 0 ? 'var(--warn)' : 'var(--accent2)' }}>
        <b>Borrador del día</b> ·{' '}
        {missing > 0 ? `te faltan ${missing.toFixed(2)} h para llegar a ${db.settings.targetHours} h` : `objetivo cumplido (${fmtH(total)} h)`}
        {pend.length > 0 && <div className="meta">Pendientes hoy: {pend.map((t) => t.title).join(' · ')}</div>}
        <div className="foot" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={fillNotes}>
            Rellenar notas con commits
          </button>
          <button className="btn sm" onClick={copyDraft}>
            Copiar resumen
          </button>
        </div>
      </div>
      <div className="toolbar">
        <div>
          <label>Día</label>
          <DatePicker value={day} ariaLabel="Día" onChange={setDay} />
        </div>
        <button className="btn" onClick={() => ui.addEntry(day)}>
          + Entrada manual
        </button>
        <button className="btn" onClick={loadCommits}>
          Ver commits del día
        </button>
        <div style={{ marginLeft: 'auto', width: 'auto' }}>
          <b>Total: {fmtH(total)} h</b> / {db.settings.targetHours} h
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Tarea</th>
            <th style={{ width: 90 }}>Inicio</th>
            <th style={{ width: 90 }}>Fin</th>
            <th style={{ width: 60 }}>Horas</th>
            <th>Nota para imputar</th>
            <th style={{ width: 40 }} />
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
      {Object.keys(byTask).length > 0 && (
        <>
          <h3>Resumen por tarea</h3>
          {Object.entries(byTask).map(([id, ms]) => {
            const t = findTask(db, id)
            return (
              <div key={id} className="row" style={{ cursor: 'default' }}>
                <div className="main">
                  <div className="title">{t?.title}</div>
                  <div className="meta">
                    {t?.client} {t?.project}
                  </div>
                </div>
                <b>{fmtH(ms)} h</b>
              </div>
            )
          })}
        </>
      )}
      {dayCommits && (
        <>
          <h3>Commits del día (ayuda para recordar)</h3>
          {Object.keys(dayCommits).length ? (
            Object.entries(dayCommits).map(([f, c]) => (
              <div key={f} className="row" style={{ cursor: 'default', display: 'block' }}>
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
        </>
      )}
      <RedminePanel day={day} />
      <h3>Exportar a Excel</h3>
      <div className="toolbar">
        <div>
          <label>Desde</label>
          <DatePicker value={from} ariaLabel="Desde" onChange={setFrom} />
        </div>
        <div>
          <label>Hasta</label>
          <DatePicker value={to} ariaLabel="Hasta" onChange={setTo} />
        </div>
        <button className="btn primary" onClick={exportXlsx}>
          Exportar .xlsx
        </button>
      </div>
    </>
  )
}
