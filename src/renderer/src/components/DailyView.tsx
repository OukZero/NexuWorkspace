import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { DB } from '../../../shared/types'
import { clip } from '../../../shared/util'
import { findTask, useDB } from '../store'
import { dayKey, fmtH, isWorkTask, toTs } from '../utils'
import { useUi } from '../ui'
import { DatePicker } from './DatePicker'

const BLOCKED_TAGS = ['bloqueo', 'bloqueada', 'bloqueado', 'blocked']
const BLOCKERS_KEY = 'shutoki.dailyBlockers'

/** Último día hábil anterior a hoy (el lunes mira al viernes). */
function prevWorkday(from = new Date()): string {
  const d = new Date(from)
  do d.setDate(d.getDate() - 1)
  while (d.getDay() === 0 || d.getDay() === 6)
  return dayKey(d)
}

const dayLabel = (day: string): string => new Date(day + 'T12:00:00').toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

/** Arma el borrador del daily con lo registrado: horas, notas, commits, tareas completadas, plan de hoy y bloqueos. */
export function buildDaily(db: DB, day: string, commits: Record<string, string[]>, blockers: string): string {
  const from = toTs(day, '00:00')
  const to = from + 86400000
  const lines: string[] = [`Ayer (${dayLabel(day)})`]

  const byTask = new Map<string, { ms: number; notes: string[] }>()
  for (const e of db.entries) {
    if (e.start < from || e.start >= to || !e.end) continue
    const g = byTask.get(e.taskId) ?? { ms: 0, notes: [] }
    g.ms += e.end - e.start
    if (e.note && !g.notes.includes(e.note)) g.notes.push(e.note)
    byTask.set(e.taskId, g)
  }
  for (const [id, g] of byTask) {
    const t = findTask(db, id)
    if (!t) continue
    const head = [t.client, t.project, t.title].filter(Boolean).join(' · ')
    lines.push(`- ${head} (${fmtH(g.ms)} h)${g.notes.length ? ': ' + g.notes.slice(0, 3).map((n) => clip(n.replace(/\s+/g, ' '), 220)).join(' / ') : ''}`)
    const cs = t.folder ? commits[t.folder] : undefined
    if (cs?.length) lines.push(`  · commits: ${cs.slice(0, 5).join('; ')}${cs.length > 5 ? ` (+${cs.length - 5})` : ''}`)
  }
  for (const t of db.tasks) if (t.doneAt && t.doneAt >= from && t.doneAt < to) lines.push(`- ✔ Completada: ${t.title}`)
  if (lines.length === 1) lines.push('- (sin horas ni tareas registradas ese día)')

  lines.push('', 'Hoy')
  const today = db.tasks.filter((t) => isWorkTask(t) && (t.status === 'doing' || t.status === 'today'))
  for (const t of today) {
    const pending = (t.subtasks ?? []).filter((s) => !s.done)
    lines.push(`- ${t.title}${t.status === 'doing' ? ' (en curso)' : ''}${pending.length ? ` — pendiente: ${pending.slice(0, 3).map((s) => s.text).join(', ')}${pending.length > 3 ? '…' : ''}` : ''}`)
  }
  if (!today.length) lines.push('- (sin tareas planificadas para hoy)')

  lines.push('', 'Bloqueos')
  const blocked = db.tasks.filter((t) => isWorkTask(t) && t.status !== 'done' && (t.tags ?? []).some((x) => BLOCKED_TAGS.includes(x.toLowerCase())))
  for (const t of blocked) lines.push(`- ${t.title} (etiquetada como bloqueada)`)
  if (blockers.trim()) lines.push(...blockers.trim().split('\n').map((l) => `- ${l.replace(/^[-•]\s*/, '')}`))
  if (!blocked.length && !blockers.trim()) lines.push('- Ninguno')
  return lines.join('\n')
}

/** Daily automático: «ayer hice / hoy haré / bloqueos» a partir de tus horas, notas y commits. */
export function DailyView(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [day, setDay] = useState(prevWorkday)
  const [useCommits, setUseCommits] = useState(true)
  const [blockers, setBlockers] = useState(() => {
    try {
      return localStorage.getItem(BLOCKERS_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [commits, setCommits] = useState<Record<string, string[]>>({})
  const [text, setText] = useState('')
  const [edited, setEdited] = useState(false)
  const [prev, setPrev] = useState<string | null>(null) // texto antes de «Redactar con Claude», para poder volver
  const [busy, setBusy] = useState(false)
  const dbRef = useRef(db)
  dbRef.current = db

  useEffect(() => {
    try {
      localStorage.setItem(BLOCKERS_KEY, blockers)
    } catch {
      /* sin storage */
    }
  }, [blockers])

  // commits del día elegido (de las carpetas de todas las tareas)
  useEffect(() => {
    let alive = true
    if (!useCommits) return setCommits({})
    void window.api.call('git:commits', day).then((c) => alive && setCommits(c)).catch(() => alive && setCommits({}))
    return () => {
      alive = false
    }
  }, [day, useCommits])

  const generate = useCallback(() => {
    setText(buildDaily(dbRef.current, day, commits, blockers))
    setEdited(false)
    setPrev(null)
  }, [day, commits, blockers])

  // el borrador sigue a los datos mientras no lo edites a mano
  const sig = JSON.stringify([day, commits, blockers, db.entries.length, db.tasks.map((t) => [t.id, t.status, t.doneAt, (t.subtasks ?? []).filter((s) => s.done).length])])
  useEffect(() => {
    if (!edited) generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      ui.toast('Daily copiado: pégalo en tu chat de equipo')
    } catch {
      ui.toast('No se pudo copiar', true)
    }
  }

  const polish = async (): Promise<void> => {
    setBusy(true)
    const r = await ui.run('daily:polish', text)
    setBusy(false)
    if (r) {
      setPrev(text)
      setText(r)
      setEdited(true)
    }
  }

  return (
    <>
      <div className="toolbar">
        <div>
          <label>Ayer (día que se reporta)</label>
          <DatePicker value={day} ariaLabel="Día" onChange={setDay} />
        </div>
        <button className="btn sm" onClick={() => setDay(prevWorkday())}>
          Último día hábil
        </button>
        <label className="gcheck">
          <input type="checkbox" checked={useCommits} onChange={(e) => setUseCommits(e.target.checked)} /> Incluir commits
        </label>
      </div>

      <label>Bloqueos de hoy (uno por línea; las tareas con la etiqueta «bloqueada» se agregan solas)</label>
      <textarea style={{ minHeight: 56, maxWidth: 760 }} value={blockers} placeholder="Ej. Espero acceso al entorno de pruebas del cliente" onChange={(e) => setBlockers(e.target.value)} />

      <label>Tu daily</label>
      <textarea
        className="daily-text"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setEdited(true)
        }}
      />
      <div className="foot" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={() => void copy()}>
          Copiar
        </button>
        <button className="btn" disabled={busy || !text.trim()} title="Claude lo reescribe de forma breve y clara, sin inventar nada" onClick={() => void polish()}>
          {busy ? 'Redactando…' : '✦ Redactar con Claude'}
        </button>
        {prev !== null && (
          <button
            className="btn"
            onClick={() => {
              setText(prev)
              setPrev(null)
            }}
          >
            Volver al borrador
          </button>
        )}
        <button className="btn" onClick={generate} title="Vuelve a armar el borrador con los datos actuales (descarta tus ediciones)">
          Regenerar
        </button>
      </div>
      <div className="meta" style={{ marginTop: 8 }}>
        Se arma con las horas, notas y resúmenes de ese día, las tareas completadas, tus commits y lo que tienes para hoy. Lo puedes editar antes de copiarlo.
      </div>
    </>
  )
}
