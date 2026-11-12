import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { RedmineDraft, RedmineLine } from '../../../shared/types'
import { findTask, useDB } from '../store'
import { useUi } from '../ui'
import { dayKey } from '../utils'
import { G } from './glyphs'
import { Select } from './Select'

const ACTIVITIES = ['Work (On customer)', 'Work (Remote)', 'Work (Office)', 'Travel']

/** Previsualización de lo que se imputará en Redmine ese día. Cada línea se puede corregir (actividad, horas, comentario) y los cambios se guardan. */
export function RedminePanel({ day }: { day: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [lines, setLines] = useState<RedmineLine[]>([])
  const [off, setOff] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [aiBusy, setAiBusy] = useState('')

  /** Claude redacta el comentario de la línea a partir de las notas de sus tareas; queda como borrador editable. */
  const aiFill = async (l: RedmineLine): Promise<void> => {
    setAiBusy(l.key)
    const text = await ui.run('redmine:aiComment', day, l.key)
    setAiBusy('')
    if (text) await saveLine(l, { comment: text })
  }

  useEffect(() => {
    let live = true
    void window.api.call('redmine:lines', day).then((l) => live && setLines(l))
    return () => {
      live = false
    }
  }, [day, db.entries, db.tasks, db.rmDrafts])

  const ready = lines.filter((l) => l.project && l.issue)
  const chosen = ready.filter((l) => !off.has(l.key))
  const total = chosen.reduce((a, l) => a + l.hours, 0)

  /** Guarda un cambio de una línea. Lo que coincide con lo automático no se guarda, para que «volver a lo automático» siga funcionando. */
  const saveLine = async (l: RedmineLine, patch: RedmineDraft): Promise<void> => {
    const next: RedmineDraft = { ...(l.draft ?? {}), ...patch }
    if (next.hours === l.auto?.hours) delete next.hours
    if (next.activity === l.auto?.activity) delete next.activity
    if (next.comment === l.auto?.comment) delete next.comment
    await ui.run('redmine:draft', day, l.key, Object.keys(next).length ? next : null)
  }

  const send = async (): Promise<void> => {
    if (!chosen.length || busy) return
    setBusy(true)
    setErrors({})
    const r = await ui.run('redmine:send', day, chosen.map((l) => l.key), {}, {})
    setBusy(false)
    if (!r) return
    if (r.needLogin) return ui.toast('Inicia sesión en la ventana de Redmine y vuelve a pulsar «Imputar»', true)
    setErrors(Object.fromEntries(r.failed.map((f) => [f.key, f.error])))
    if (r.notes?.length) ui.toast(r.notes.join(' · '), true)
    else ui.toast(r.failed.length ? `${r.sent} imputadas, ${r.failed.length} con error` : `${r.sent} imputadas en Redmine`, r.failed.length > 0)
  }

  const connected = !!db.settings.redmineUrl
  /** Tarea a la que pertenece la línea (por sus registros). */
  const taskOf = (l: RedmineLine): string => findTask(db, db.entries.find((e) => l.entryIds.includes(e.id))?.taskId ?? '')?.title ?? ''

  return (
    <section className="bc hr-imp">
      <div className="card-h">
        <span className="eyebrow">
          Imputar en Redmine · {new Date(`${day}T12:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
          {day !== dayKey(new Date()) && <span className="imp-past"> · día pasado</span>}
        </span>
        {!connected && <span className="chip bad">Sin conexión</span>}
      </div>
      {lines.length ? (
        <>
          <div className="meta" style={{ marginBottom: 8 }}>
            Esto es exactamente lo que se enviará. Puedes cambiar la actividad, las horas y el comentario de cada línea; se guardan al salir del campo.
          </div>
          <div className="hr-imp-list">
            {lines.map((l) => {
              const ok = !!(l.project && l.issue)
              return (
                <div key={l.key} className={`imp${ok ? '' : ' off'}`}>
                  <input
                    type="checkbox"
                    disabled={!ok}
                    aria-label="Incluir"
                    checked={ok && !off.has(l.key)}
                    onChange={(e) => setOff((p) => new Set([...p].filter((k) => k !== l.key).concat(e.target.checked ? [] : [l.key])))}
                  />
                  <div className="imp-main">
                    <div className="imp-head">
                      <b>{taskOf(l) || (ok ? `${l.project} → ${l.issue}` : 'Tarea sin nombre')}</b>
                      {l.drafted && <span className="imp-tag">editado</span>}
                    </div>
                    <div className="imp-sub">Billable: no · {ok ? `${l.project} → ${l.issue}` : 'tarea sin proyecto asignado (edita la tarea)'}</div>
                    {ok ? (
                      <>
                        <div className="imp-fields">
                          <div className="imp-f">
                            <span>Actividad</span>
                            <Select
                              ariaLabel="Actividad"
                              title="Actividad en Redmine (remoto, oficina…)"
                              value={l.activity}
                              onChange={(v) => void saveLine(l, { activity: v })}
                              options={[...new Set([l.activity, ...ACTIVITIES])].map((v) => ({ value: v, label: v }))}
                            />
                          </div>
                          <div className="imp-f">
                            <span>Horas</span>
                            <input
                              key={`h-${l.key}-${l.drafted ? 'd' : l.hours}`}
                              type="number"
                              min={0.25}
                              max={24}
                              step={0.25}
                              defaultValue={l.hours}
                              aria-label="Horas a imputar"
                              style={{ width: 90 }}
                              onBlur={(e) => {
                                const v = e.currentTarget.valueAsNumber
                                if (Number.isFinite(v) && v > 0 && v <= 24 && v !== l.hours) void saveLine(l, { hours: v })
                              }}
                            />
                          </div>
                        </div>
                        <div className="imp-f imp-wide">
                          <span className="imp-cbar">
                            Comentario (lo que se enviará)
                            <button className="link" disabled={aiBusy === l.key} title="Claude redacta una frase con las notas de esta tarea" onClick={() => void aiFill(l)}>
                              {aiBusy === l.key ? 'Generando…' : '✨ Generar con Claude'}
                            </button>
                          </span>
                          <textarea
                            key={`c-${l.key}-${l.drafted ? 'd' : l.comment}`}
                            defaultValue={l.comment}
                            rows={2}
                            aria-label="Comentario de la imputación"
                            onBlur={(e) => {
                              const v = e.currentTarget.value.trim()
                              if (v !== l.comment) void saveLine(l, { comment: v })
                            }}
                          />
                        </div>
                        {l.drafted && (
                          <div className="imp-auto">
                            Automático: {String(l.auto?.hours ?? '').replace('.', ',')} h · «{l.auto?.comment || 'sin comentario'}»{' '}
                            <button className="link" onClick={() => void ui.run('redmine:draft', day, l.key, null)}>
                              Volver a lo automático
                            </button>
                          </div>
                        )}
                      </>
                    ) : null}
                    {errors[l.key] && <div className="imp-err">⚠ {errors[l.key]}</div>}
                  </div>
                  {!ok && <b className="num">{String(l.hours).replace('.', ',')} h</b>}
                </div>
              )
            })}
          </div>
          {total > (db.settings.targetHours || 8) + 0.001 && (
            <div className="meta" style={{ color: 'var(--warn)', marginTop: 8 }}>
              ⚠ Sumas {total.toFixed(2)} h y el tope diario es {db.settings.targetHours || 8} h: lo que pase del tope (contando lo ya imputado ese día) no se enviará.
            </div>
          )}
          <div className="hr-imp-foot">
            <button className="btn sm" onClick={() => void ui.run('redmine:login')}>
              <G n="popout" size={13} /> Abrir Redmine / iniciar sesión
            </button>
            <button className="btn p" disabled={!chosen.length || busy} onClick={() => void send()}>
              {busy ? 'Imputando…' : `Imputar ${total.toFixed(2).replace('.', ',')} h`}
            </button>
          </div>
        </>
      ) : (
        <div className="meta">Nada pendiente de imputar este día (los registros en curso no se incluyen).</div>
      )}
    </section>
  )
}
