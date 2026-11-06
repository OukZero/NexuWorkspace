import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { TelegramStatus } from '../../../shared/types'
import { useDB } from '../store'
import { useUi } from '../ui'

/** Ajustes del bot de Telegram: token, vinculación del chat y avisos con o sin detalle. */
export function TelegramSettings(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const s = db.settings
  const [token, setToken] = useState(s.telegramToken ?? '')
  const [on, setOn] = useState(!!s.telegramOn)
  const [details, setDetails] = useState(s.telegramDetails !== false)
  const [st, setSt] = useState<TelegramStatus | null>(null)
  const [code, setCode] = useState('')

  useEffect(() => {
    let live = true
    const tick = (): void => void window.api.call('telegram:status').then((r) => live && setSt(r))
    tick()
    const id = setInterval(tick, 2000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (st?.linked) setCode('')
  }, [st?.linked])

  const save = async (): Promise<void> => {
    const r = await ui.run('telegram:save', { token, on, details })
    if (r) {
      setSt(r)
      ui.toast('Telegram guardado')
    }
  }

  const state = !s.telegramOn ? 'Desactivado' : st?.error ? `Error: ${st.error}` : st?.running ? `Conectado ${st.bot ?? ''}` : 'Conectando…'

  return (
    <>
      <h3>Telegram</h3>
      <div className="meta" style={{ maxWidth: 700, marginBottom: 8 }}>
        Recibe en el teléfono los avisos de la campanita y responde los permisos de Claude con botones. Funciona solo con la app abierta. Los chats de bots no van
        cifrados de extremo a extremo: no lo uses con datos de clientes.
      </div>
      <div className="grid2" style={{ maxWidth: 700 }}>
        <div>
          <label>Token del bot (de @BotFather)</label>
          <input type="password" autoComplete="off" value={token} placeholder="123456789:AA…" onChange={(e) => setToken(e.target.value)} />
        </div>
        <div>
          <label>Estado</label>
          <div className="meta" style={{ paddingTop: 8 }}>
            {state} · {st?.linked ? 'chat vinculado' : 'sin vincular'}
          </div>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={on} onChange={(e) => setOn(e.target.checked)} />
            Activar el bot
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={details} onChange={(e) => setDetails(e.target.checked)} />
            Incluir en los avisos el nombre de la tarea y el comando que pide permiso
          </label>
        </div>
      </div>
      <div className="foot" style={{ marginTop: 8 }}>
        <button className="btn primary" onClick={() => void save()}>
          Guardar y conectar
        </button>
        {s.telegramOn && st?.running && !st.linked && (
          <button className="btn" onClick={() => void ui.run('telegram:link').then((c) => c && setCode(c))}>
            Vincular chat
          </button>
        )}
        {st?.linked && (
          <>
            <button className="btn" onClick={() => void ui.run('telegram:test').then(() => ui.toast('Mensaje de prueba enviado'))}>
              Enviar prueba
            </button>
            <button className="btn danger" onClick={() => void ui.run('telegram:unlink').then((r) => r && setSt(r))}>
              Desvincular
            </button>
          </>
        )}
      </div>
      {code && !st?.linked && (
        <div className="meta" style={{ marginTop: 8 }}>
          En Telegram, abre tu bot y escribe <b>/vincular {code}</b> (vale 10 minutos).
        </div>
      )}
    </>
  )
}
