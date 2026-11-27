import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { CalendarStatus } from '../../../shared/types'
import { setCalendarStatus, useCalendar } from '../calendar'
import { useDB } from '../store'
import { useUi } from '../ui'

/** Ajustes del calendario de Outlook: app propia de Azure (Client ID), inquilino y minutos de aviso. */
export function CalendarSettings(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const s = db.settings
  const cal = useCalendar()
  const [clientId, setClientId] = useState(s.outlookClientId ?? '')
  const [tenant, setTenant] = useState(s.outlookTenant ?? 'common')
  const [remind, setRemind] = useState(String(s.meetingRemindMin ?? 10))
  const [st, setSt] = useState<CalendarStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.call('calendar:status').then(setSt)
  }, [])
  const status = cal.status ?? st

  const save = async (): Promise<CalendarStatus | undefined> => {
    const r = await ui.run('calendar:save', { clientId, tenant, remindMin: Number(remind) || 0 })
    if (r) {
      setSt(r)
      setCalendarStatus(r)
    }
    return r
  }

  const connect = async (): Promise<void> => {
    if (!(await save())) return
    setBusy(true)
    ui.toast('Inicia sesión y autoriza la app en el navegador que se abrió…')
    const r = await ui.run('calendar:connect')
    setBusy(false)
    if (r) {
      setSt(r)
      setCalendarStatus(r)
      ui.toast('Outlook conectado')
    }
  }

  return (
    <>
      <div className="meta" style={{ marginBottom: 8 }}>
        Muestra tus reuniones en «Hoy» y en la línea de tiempo, avisa antes de cada una y las descuenta de las horas disponibles. Solo lee tu calendario. Registra una app en el portal de Azure (Microsoft Entra ID → Registros de aplicaciones → Nuevo registro), añade la plataforma{' '}
        <b>Aplicación móvil y de escritorio</b> con la URI de redirección <b>http://localhost</b>, concede el permiso <b>Calendars.Read</b> (delegado) y pega aquí el Id. de aplicación (cliente).
      </div>
      <div className="grid2">
        <div>
          <label>Id. de aplicación (cliente)</label>
          <input autoComplete="off" value={clientId} placeholder="11111111-2222-3333-4444-555555555555" onChange={(e) => setClientId(e.target.value)} />
        </div>
        <div>
          <label>Inquilino (common, organizations o el id de tu organización)</label>
          <input autoComplete="off" value={tenant} onChange={(e) => setTenant(e.target.value)} />
        </div>
        <div>
          <label>Avisar antes de cada reunión (minutos, 0 = no avisar)</label>
          <input type="number" min={0} max={120} value={remind} onChange={(e) => setRemind(e.target.value)} />
        </div>
        <div>
          <label>Estado</label>
          <div className="meta" style={{ paddingTop: 8 }}>
            {status?.connected ? 'Conectado' : status?.configured ? 'Sin conectar' : 'Sin configurar'}
            {status?.error ? ` · ${status.error}` : ''}
          </div>
        </div>
      </div>
      <div className="foot" style={{ marginTop: 8 }}>
        <button className="btn" onClick={() => void save().then((r) => r && ui.toast('Calendario guardado'))}>
          Guardar
        </button>
        <button className="btn primary" disabled={busy || !clientId.trim()} onClick={() => void connect()}>
          {status?.connected ? 'Reconectar' : 'Conectar'}
        </button>
        {status?.connected && (
          <button
            className="btn danger"
            onClick={() =>
              void ui.run('calendar:disconnect').then((r) => {
                if (r) {
                  setSt(r)
                  setCalendarStatus(r)
                }
              })
            }
          >
            Desconectar
          </button>
        )}
      </div>
    </>
  )
}
