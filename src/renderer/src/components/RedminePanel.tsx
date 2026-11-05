import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { RedmineLine } from '../../../shared/types'
import { useDB } from '../store'
import { useUi } from '../ui'

/** Vista previa de lo que se imputará en Redmine ese día, con confirmación antes de enviar. */
export function RedminePanel({ day }: { day: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [lines, setLines] = useState<RedmineLine[]>([])
  const [off, setOff] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let live = true
    void window.api.call('redmine:lines', day).then((l) => live && setLines(l))
    return () => {
      live = false
    }
  }, [day, db.entries, db.tasks])

  const ready = lines.filter((l) => l.project && l.issue)
  const chosen = ready.filter((l) => !off.has(l.key))
  const total = chosen.reduce((a, l) => a + l.hours, 0)

  const send = async (): Promise<void> => {
    if (!chosen.length || busy) return
    setBusy(true)
    setErrors({})
    const r = await ui.run('redmine:send', day, chosen.map((l) => l.key))
    setBusy(false)
    if (!r) return
    if (r.needLogin) return ui.toast('Inicia sesión en la ventana de Redmine y vuelve a pulsar «Imputar»', true)
    setErrors(Object.fromEntries(r.failed.map((f) => [f.key, f.error])))
    ui.toast(r.failed.length ? `${r.sent} imputadas, ${r.failed.length} con error` : `${r.sent} imputadas en Redmine`, r.failed.length > 0)
  }

  return (
    <>
      <h3>Imputar en Redmine</h3>
      {lines.length ? (
        <>
          {lines.map((l) => {
            const ok = !!(l.project && l.issue)
            return (
              <div key={l.key} className="row" style={{ cursor: 'default', opacity: ok ? 1 : 0.6 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  disabled={!ok}
                  aria-label="Incluir"
                  checked={ok && !off.has(l.key)}
                  onChange={(e) => setOff((p) => new Set([...p].filter((k) => k !== l.key).concat(e.target.checked ? [] : [l.key])))}
                />
                <div className="main">
                  <div className="title">{ok ? `${l.project} → ${l.issue}` : 'Falta proyecto o tarea de Redmine (edita la tarea)'}</div>
                  <div className="meta">
                    {l.activity} · Billable: no · {l.comment || 'sin comentario'}
                  </div>
                  {errors[l.key] && <div className="meta" style={{ color: 'var(--danger, #e5484d)' }}>⚠ {errors[l.key]}</div>}
                </div>
                <b>{l.hours} h</b>
              </div>
            )
          })}
          <div className="foot" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => void ui.run('redmine:login')}>
              Abrir Redmine / iniciar sesión
            </button>
            <span className="sp" />
            <button className="btn primary" disabled={!chosen.length || busy} onClick={() => void send()}>
              {busy ? 'Imputando…' : `Imputar ${total.toFixed(2)} h`}
            </button>
          </div>
        </>
      ) : (
        <div className="meta">Nada pendiente de imputar este día (los registros en curso no se incluyen).</div>
      )}
    </>
  )
}
