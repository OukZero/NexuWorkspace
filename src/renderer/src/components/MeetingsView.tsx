import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Meeting } from '../../../shared/types'
import { createTasks, deleteMeeting, extractTasks, pauseRecording, resummarizeMeeting, retryMeeting, startRecording, stopRecording, updateMeeting, useMeetings, useRecording } from '../meetings'
import { requestNote, saveNote } from '../notes'
import { useDB } from '../store'
import { useUi } from '../ui'
import { isWorkTask } from '../utils'
import { G } from './glyphs'
import { Markdown } from './Markdown'
import { Select } from './Select'

const clock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${m}:${r}` : `${m}:${r}`
}

const when = (ts: number): string => {
  const d = new Date(ts)
  const day = d.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '')
  const hm = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? `Hoy · ${hm}` : `${day} · ${hm}`
}

const STATUS: Record<Meeting['status'], string> = {
  recording: 'Grabando',
  transcribing: 'Transcribiendo…',
  summarizing: 'Resumiendo…',
  done: 'Lista',
  error: 'Con error'
}

/** Barra de grabación: título, tarea opcional y botón de grabar; mientras graba muestra el tiempo, pausa y detener. */
function Recorder({ onStopped }: { onStopped: (m: Meeting) => void }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const rec = useRecording()
  const [title, setTitle] = useState('')
  const [taskId, setTaskId] = useState('')
  const [system, setSystem] = useState(true)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [pausedMs, setPausedMs] = useState(0)
  const [pausedAt, setPausedAt] = useState<number | null>(null)

  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [rec])

  const tasks = db.tasks.filter((t) => isWorkTask(t) && t.status !== 'done')
  const configured = !!db.settings.whisperCmd.trim() && !!db.settings.whisperModel.trim()

  const start = async (): Promise<void> => {
    setBusy(true)
    try {
      const name = title.trim() || `Reunión ${new Date().toLocaleDateString('es', { day: 'numeric', month: 'short' })}`
      const warn = await startRecording(name, taskId || undefined, system)
      setPausedMs(0)
      setPausedAt(null)
      setNow(Date.now())
      if (warn) ui.toast(warn, true)
    } catch (e) {
      ui.toast((e as Error).message, true)
    } finally {
      setBusy(false)
    }
  }
  const stop = async (): Promise<void> => {
    setBusy(true)
    try {
      const m = await stopRecording()
      setTitle('')
      if (m) {
        onStopped(m)
        ui.toast('Grabación guardada. Se está transcribiendo en tu equipo.')
      }
    } catch (e) {
      ui.toast(`No se pudo cerrar la grabación: ${(e as Error).message}`, true)
    } finally {
      setBusy(false)
    }
  }
  const pause = (): void => {
    if (!rec) return
    if (rec.paused) {
      setPausedMs(pausedMs + (Date.now() - (pausedAt ?? Date.now())))
      setPausedAt(null)
    } else setPausedAt(Date.now())
    pauseRecording(!rec.paused)
  }

  if (rec) {
    const gone = pausedMs + (rec.paused && pausedAt ? now - pausedAt : 0)
    return (
      <div className="mt-rec on" role="status" aria-live="polite">
        <div className="mt-rec-top">
          <span className={`mt-dot ${rec.paused ? 'paused' : ''}`} aria-hidden />
          <b className="mt-time">{clock(now - rec.startedAt - gone)}</b>
          <span className="meta">{rec.paused ? 'En pausa' : 'Grabando'}</span>
        </div>
        <div className="mt-rec-title">{rec.title}</div>
        <div className="meta">{rec.system ? 'Tu micrófono y el audio del equipo (voz del cliente)' : 'Solo tu micrófono'}</div>
        <div className="mt-rec-btns">
          <button className="btn sm" onClick={pause} disabled={busy}>
            <G n={rec.paused ? 'play' : 'pause'} size={13} /> {rec.paused ? 'Reanudar' : 'Pausar'}
          </button>
          <button className="btn sm p" onClick={() => void stop()} disabled={busy}>
            <G n="stop" size={13} /> Detener y resumir
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-rec">
      <input value={title} placeholder="Título de la reunión (opcional)" aria-label="Título de la reunión" maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      <Select
        value={taskId}
        ariaLabel="Tarea vinculada"
        searchable
        options={[{ value: '', label: 'Sin tarea' }, ...tasks.map((t) => ({ value: t.id, label: t.title }))]}
        onChange={setTaskId}
      />
      <label className="mt-check">
        <input type="checkbox" checked={system} onChange={(e) => setSystem(e.target.checked)} /> Incluir el audio del equipo (voz del cliente en la llamada)
      </label>
      <button className="btn p" disabled={busy} onClick={() => void start()}>
        <span className="mt-dot" aria-hidden /> Grabar reunión
      </button>
      {!configured && <div className="meta">Puedes grabar ya: el audio se guarda y se transcribirá cuando indiques whisper.cpp y su modelo en Ajustes → IA (luego pulsa «Reintentar»).</div>}
      <div className="meta">Avisa a los participantes de que la reunión se graba.</div>
    </div>
  )
}

/** Tareas que Claude propone de la reunión: se revisan, se edita el título y se crean solo las marcadas. */
function Proposals({ m }: { m: Meeting }): ReactNode {
  const ui = useUi()
  const list = m.proposals ?? []
  const [items, setItems] = useState(list.map((t) => ({ ...t, on: t.mine })))
  useEffect(() => setItems((m.proposals ?? []).map((t) => ({ ...t, on: t.mine }))), [m.id, m.proposals])
  const [open, setOpen] = useState(true)
  const finding = !!m.extracting
  const chosen = items.filter((t) => t.on)
  const edit = (i: number, p: Partial<(typeof items)[number]>): void => setItems((a) => a.map((t, j) => (j === i ? { ...t, ...p } : t)))
  const create = async (): Promise<void> => {
    try {
      const n = await createTasks(m.id, chosen)
      ui.toast(n === 1 ? 'Tarea creada en «Próximas»' : `${n} tareas creadas en «Próximas»`)
    } catch (e) {
      ui.toast(`No se pudieron crear las tareas: ${(e as Error).message}`, true)
    }
  }
  const find = (): void => void extractTasks(m.id).catch((e: Error) => ui.toast(e.message, true))

  if (!finding && !m.proposals) {
    return m.status === 'done' && m.summary ? (
      <div className="mt-props">
        <button className="btn sm" onClick={find}>
          Buscar tareas en la reunión
        </button>
        {m.error && <span className="meta"> {m.error}</span>}
      </div>
    ) : null
  }
  return (
    <div className="mt-props">
      <button className="mt-props-h" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'}</span> Tareas de la reunión {finding ? '(buscando…)' : `(${items.length})`}
      </button>
      {open && !finding && (
        <>
          {!items.length && <div className="meta">No se encontraron tareas.</div>}
          {items.map((t, i) => (
            <div key={i} className="mt-prop">
              <input type="checkbox" checked={t.on} aria-label="Crear esta tarea" onChange={(e) => edit(i, { on: e.target.checked })} />
              <div className="mt-prop-b">
                <input value={t.title} maxLength={160} aria-label="Título de la tarea" onChange={(e) => edit(i, { title: e.target.value })} />
                <div className="meta">
                  {t.owner ? `Responsable: ${t.owner}` : 'Sin responsable'}
                  {t.mine && ' · es tuya'}
                  {t.description && ` · ${t.description}`}
                </div>
              </div>
            </div>
          ))}
          <div className="mt-prop-act">
            <button className="btn sm p" disabled={!chosen.length} onClick={() => void create()}>
              Crear {chosen.length || ''} {chosen.length === 1 ? 'tarea' : 'tareas'}
            </button>
            <button className="btn sm" onClick={find}>
              Volver a buscar
            </button>
            <button className="btn sm" onClick={() => void updateMeeting(m.id, { proposals: null })}>
              Descartar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Detail({ m, onGone }: { m: Meeting; onGone: () => void }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [title, setTitle] = useState(m.title)
  const [tab, setTab] = useState<'summary' | 'transcript'>('summary')
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(m.summary)

  // al cambiar de reunión (o al llegar el resumen) se refresca lo mostrado
  useEffect(() => {
    setTitle(m.title)
    setText(m.summary)
    setEditing(false)
  }, [m.id, m.title, m.summary])

  const working = m.status === 'transcribing' || m.status === 'summarizing'
  const tasks = db.tasks.filter((t) => isWorkTask(t) && (t.status !== 'done' || t.id === m.taskId))
  const guard = (p: Promise<unknown>, what: string): void => void p.catch((e: Error) => ui.toast(`${what}: ${e.message}`, true))

  const saveEdit = (): void => {
    setEditing(false)
    if (text !== m.summary) guard(updateMeeting(m.id, { summary: text }), 'No se pudo guardar el resumen')
  }
  const toNote = async (): Promise<void> => {
    try {
      const n = await saveNote({ title: `Reunión: ${m.title}`, body: m.summary, tags: ['reunión'], taskId: m.taskId ?? null })
      requestNote({ id: n.id })
      ui.go('notes')
    } catch (e) {
      ui.toast(`No se pudo crear la nota: ${(e as Error).message}`, true)
    }
  }
  const copy = (value: string): void => {
    void navigator.clipboard.writeText(value).then(() => ui.toast('Copiado'))
  }
  const remove = async (): Promise<void> => {
    if (!(await ui.confirm(`¿Eliminar la reunión «${m.title}», con su resumen y transcripción? No se puede deshacer.`, { title: 'Eliminar reunión', confirmLabel: 'Eliminar', danger: true }))) return
    try {
      await deleteMeeting(m.id)
      onGone()
    } catch (e) {
      ui.toast((e as Error).message, true)
    }
  }

  return (
    <div className="nt-ed mt-detail">
      <div className="nt-bar">
        <input
          className="nt-title"
          value={title}
          maxLength={120}
          aria-label="Título de la reunión"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== m.title && guard(updateMeeting(m.id, { title }), 'No se pudo renombrar')}
        />
        <span className={`chip ${m.status === 'done' ? 'ok' : m.status === 'error' ? 'prio' : ''}`} role="status">
          {STATUS[m.status]}
        </span>
        <button className="ib" title="Eliminar reunión" aria-label="Eliminar reunión" disabled={working} onClick={() => void remove()}>
          <G n="x" size={15} />
        </button>
      </div>
      <div className="nt-meta">
        <Select
          className="nt-task"
          value={m.taskId ?? ''}
          ariaLabel="Tarea vinculada"
          searchable
          options={[{ value: '', label: 'Sin tarea' }, ...tasks.map((t) => ({ value: t.id, label: t.title }))]}
          onChange={(v) => guard(updateMeeting(m.id, { taskId: v || null }), 'No se pudo vincular la tarea')}
        />
        <span className="nt-state">
          {when(m.createdAt)} · {clock(m.durationMs)}
          {m.hasAudio ? ' · audio guardado' : ''}
        </span>
      </div>

      {m.status === 'error' && (
        <div className="mt-err" role="alert">
          <span>{m.error}</span>
          <button className="btn sm" onClick={() => guard(retryMeeting(m.id), 'No se pudo reintentar')}>
            Reintentar
          </button>
        </div>
      )}
      {working && (
        <div className="mt-wait" role="status">
          {m.status === 'transcribing' ? 'Transcribiendo el audio en tu equipo. Puedes seguir usando la app; puede tardar unos minutos.' : 'Claude está redactando el resumen…'}
        </div>
      )}

      <Proposals m={m} />

      <div className="mt-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'summary'} className={tab === 'summary' ? 'on' : ''} onClick={() => setTab('summary')}>
          Resumen
        </button>
        <button role="tab" aria-selected={tab === 'transcript'} className={tab === 'transcript' ? 'on' : ''} onClick={() => setTab('transcript')}>
          Transcripción
        </button>
        <span className="sp" />
        {tab === 'summary' ? (
          <>
            {m.transcript.trim() && !working && (
              <button className="btn sm" onClick={() => guard(resummarizeMeeting(m.id), 'No se pudo resumir')}>
                Rehacer resumen
              </button>
            )}
            {m.summary && (
              <>
                <button className="btn sm" onClick={() => (editing ? saveEdit() : setEditing(true))}>
                  {editing ? 'Listo' : 'Editar'}
                </button>
                <button className="btn sm" onClick={() => copy(m.summary)}>
                  Copiar
                </button>
                <button className="btn sm p" onClick={() => void toNote()}>
                  Guardar como nota
                </button>
              </>
            )}
          </>
        ) : (
          m.transcript && (
            <button className="btn sm" onClick={() => copy(m.transcript)}>
              Copiar
            </button>
          )
        )}
      </div>

      {tab === 'summary' ? (
        editing ? (
          <textarea className="nt-body" value={text} aria-label="Resumen de la reunión" spellCheck onChange={(e) => setText(e.target.value)} onBlur={saveEdit} />
        ) : (
          <div className="nt-prev">{m.summary ? <Markdown text={m.summary} /> : <div className="meta">{working ? 'El resumen aparecerá aquí.' : 'Aún no hay resumen.'}</div>}</div>
        )
      ) : (
        <div className="nt-prev mt-transcript">{m.transcript ? m.transcript : <div className="meta">{working ? 'La transcripción aparecerá aquí.' : 'Sin transcripción.'}</div>}</div>
      )}
    </div>
  )
}

/** Vista «Reuniones»: graba la voz (micrófono y audio del equipo), la transcribe en local y deja un resumen de la reunión. */
export function MeetingsView(): ReactNode {
  const meetings = useMeetings()
  const [sel, setSel] = useState<string | null>(null)
  const cur = meetings.find((m) => m.id === sel) ?? null

  return (
    <div className="notes meetings">
      <aside className="nt-list" aria-label="Reuniones">
        <Recorder onStopped={(m) => setSel(m.id)} />
        <div className="nt-items">
          {meetings.map((m) => (
            <button key={m.id} className={`nt-item ${sel === m.id ? 'on' : ''}`} onClick={() => setSel(m.id)}>
              <b className="nt-it">{m.title}</b>
              <small className="nt-im">
                {when(m.createdAt)} · {clock(m.durationMs)}
              </small>
              <span className="nt-ip">{m.status === 'done' ? m.summary.replace(/[#>*`\-\n]+/g, ' ').trim().slice(0, 90) : STATUS[m.status]}</span>
            </button>
          ))}
          {!meetings.length && <div className="nt-empty">Aún no hay reuniones. Pulsa «Grabar reunión» y concéntrate en la conversación: el resumen se hace solo.</div>}
        </div>
      </aside>
      <section className="nt-main">
        {cur ? (
          <Detail key={cur.id} m={cur} onGone={() => setSel(null)} />
        ) : (
          <div className="nt-empty big">
            <G n="volume" size={28} />
            <b>Selecciona una reunión</b>
            <span>Verás su resumen, los acuerdos y la transcripción completa.</span>
          </div>
        )}
      </section>
    </div>
  )
}
