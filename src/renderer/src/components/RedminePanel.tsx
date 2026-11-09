import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { RedmineLine } from '../../../shared/types'
import { findTask, useDB } from '../store'
import { useUi } from '../ui'
import { G } from './glyphs'
import { Select } from './Select'

const ACTIVITIES = ['Work (On customer)', 'Work (Remote)', 'Work (Office)', 'Travel']

/** Vista previa de lo que se imputará en Redmine ese día, con confirmación antes de enviar. */
export function RedminePanel({ day }: { day: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [lines, setLines] = useState<RedmineLine[]>([])
  const [off, setOff] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  // horas que el usuario cambió a mano por línea (si no, se usan las registradas con el timer)
  const [edited, setEdited] = useState<Record<string, number>>({})
  // actividad elegida por línea (si no, la de la tarea o la de Ajustes)
  const [acts, setActs] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setEdited({})
    setActs({})
  }, [day])

  useEffect(() => {
    let live = true
    void window.api.call('redmine:lines', day).then((l) => live && setLines(l))
    return () => {
      live = false
    }
  }, [day, db.entries, db.tasks])

  const ready = lines.filter((l) => l.project && l.issue)
  const chosen = ready.filter((l) => !off.has(l.key))
  const hoursOf = (l: RedmineLine): number => edited[l.key] ?? l.hours
  const total = chosen.reduce((a, l) => a + hoursOf(l), 0)

  const send = async (): Promise<void> => {
    if (!chosen.length || busy) return
    setBusy(true)
    setErrors({})
    const r = await ui.run('redmine:send', day, chosen.map((l) => l.key), edited, acts)
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
        <span className="eyebrow">Imputar en Redmine</span>
        {!connected && <span className="chip bad">Sin conexión</span>}
      </div>
      {lines.length ? (
        <>
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
                    <b title={l.comment || undefined}>{taskOf(l) || (ok ? `${l.project} → ${l.issue}` : 'Tarea sin nombre')}</b>
                    <div className="imp-sub">Billable: no · {ok ? `${l.project} → ${l.issue}` : 'tarea sin proyecto asignado (edita la tarea)'}</div>
                    {ok && (
                      <div className="imp-act">
                        <Select
                          ariaLabel="Actividad"
                          title="Actividad en Redmine (remoto, oficina…)"
                          value={acts[l.key] ?? l.activity}
                          onChange={(v) => setActs((p) => ({ ...p, [l.key]: v }))}
                          options={[...new Set([acts[l.key] ?? l.activity, ...ACTIVITIES])].map((v) => ({ value: v, label: v }))}
                        />
                      </div>
                    )}
                    {errors[l.key] && <div className="imp-err">⚠ {errors[l.key]}</div>}
                  </div>
                  {ok ? (
                    <label className="rm-hours" title="Horas que se imputarán (puedes cambiarlas)">
                      <input
                        type="number"
                        min={0.25}
                        max={24}
                        step={0.25}
                        value={edited[l.key] ?? l.hours}
                        aria-label="Horas a imputar"
                        onChange={(e) => {
                          const v = e.target.valueAsNumber
                          setEdited((p) => (Number.isFinite(v) ? { ...p, [l.key]: v } : Object.fromEntries(Object.entries(p).filter(([k]) => k !== l.key))))
                        }}
                      />
                      <span>h</span>
                      {edited[l.key] !== undefined && edited[l.key] !== l.hours && (
                        <button type="button" className="icon" title={`Volver a ${l.hours} h (lo registrado)`} aria-label="Restablecer horas" onClick={() => setEdited((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== l.key)))}>
                          ↺
                        </button>
                      )}
                    </label>
                  ) : (
                    <b className="num">{String(l.hours).replace('.', ',')} h</b>
                  )}
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
