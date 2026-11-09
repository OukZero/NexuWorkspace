import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { SpotifyStatus } from '../../../shared/types'
import { setSpotifyStatus } from '../spotify'
import { useDB } from '../store'
import { useUi } from '../ui'

const REDIRECT = 'http://127.0.0.1:53682/callback'

/** Ajustes de Spotify: Client ID de la app propia, lista de enfoque y control automático desde el pomodoro. */
export function SpotifySettings(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const s = db.settings
  const [clientId, setClientId] = useState(s.spotifyClientId ?? '')
  const [focusUri, setFocusUri] = useState(s.spotifyFocusUri ?? '')
  const [auto, setAuto] = useState(!!s.spotifyAuto)
  const [st, setSt] = useState<SpotifyStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.call('spotify:status').then(setSt)
  }, [])

  const save = async (): Promise<SpotifyStatus | undefined> => {
    const r = await ui.run('spotify:save', { clientId, focusUri, auto })
    if (r) {
      setSt(r)
      setSpotifyStatus(r)
    }
    return r
  }

  const connect = async (): Promise<void> => {
    if (!(await save())) return
    setBusy(true)
    ui.toast('Autoriza la app en el navegador que se abrió…')
    const r = await ui.run('spotify:connect')
    setBusy(false)
    if (r) {
      setSt(r)
      setSpotifyStatus(r)
      ui.toast('Spotify conectado')
    }
  }

  return (
    <>
      <h3>Spotify</h3>
      <div className="meta" style={{ maxWidth: 700, marginBottom: 8 }}>
        Controla Spotify desde cualquier pantalla. Crea una app en developer.spotify.com, añade esta URI de redirección exactamente como aparece y pega aquí su Client ID:{' '}
        <b>{REDIRECT}</b>. Pausar, reanudar y cambiar de pista requiere Spotify Premium y un dispositivo activo.
      </div>
      <div className="grid2" style={{ maxWidth: 700 }}>
        <div>
          <label>Client ID</label>
          <input autoComplete="off" value={clientId} placeholder="a1b2c3…" onChange={(e) => setClientId(e.target.value)} />
        </div>
        <div>
          <label>Estado</label>
          <div className="meta" style={{ paddingTop: 8 }}>
            {st?.connected ? 'Conectado' : st?.configured ? 'Sin conectar' : 'Sin configurar'}
            {st?.error ? ` · ${st.error}` : ''}
          </div>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label>Lista de enfoque (enlace de Spotify o URI, opcional)</label>
          <input value={focusUri} placeholder="https://open.spotify.com/playlist/…" onChange={(e) => setFocusUri(e.target.value)} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text)' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Con el pomodoro: reproducir al empezar el foco y pausar en los descansos
          </label>
        </div>
      </div>
      <div className="foot" style={{ marginTop: 8 }}>
        <button className="btn" onClick={() => void save().then((r) => r && ui.toast('Spotify guardado'))}>
          Guardar
        </button>
        <button className="btn primary" disabled={busy || !clientId.trim()} onClick={() => void connect()}>
          {st?.connected ? 'Reconectar' : 'Conectar'}
        </button>
        {st?.connected && (
          <button className="btn danger" onClick={() => void ui.run('spotify:disconnect').then((r) => {
              if (r) {
                setSt(r)
                setSpotifyStatus(r)
              }
            })}>
            Desconectar
          </button>
        )}
      </div>
    </>
  )
}
