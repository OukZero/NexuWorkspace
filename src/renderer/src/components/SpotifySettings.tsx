import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { SpotifyStatus } from '../../../shared/types'
import { setSpotifyStatus } from '../spotify'
import { useDB } from '../store'
import { useUi } from '../ui'

const REDIRECT = 'http://127.0.0.1:53682/callback'

/** Ajustes de Spotify: Client ID de la app propia, lista de enfoque y control automático desde el pomodoro. */
export function SpotifySettings({ card }: { card?: boolean }): ReactNode {
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

  const disconnect = (): void => {
    void ui.run('spotify:disconnect').then((r) => {
      if (r) {
        setSt(r)
        setSpotifyStatus(r)
      }
    })
  }

  if (card)
    return (
      <section className="mu-card mu-cfg">
        <div className="mu-eyebrow">Spotify</div>
        <p className="mu-cfg-d">Controla Spotify desde cualquier pantalla. Crea una app en developer.spotify.com y añade esta URI de redirección.</p>
        <label className="mu-field">
          <span>URI de redirección</span>
          <input className="mu-mono" value={REDIRECT} readOnly onFocus={(e) => e.currentTarget.select()} />
        </label>
        <label className="mu-field">
          <span>Client ID</span>
          <input className="mu-mono" autoComplete="off" value={clientId} placeholder="a1b2c3…" onChange={(e) => setClientId(e.target.value)} />
        </label>
        <div className="mu-state">
          <span>Estado</span>
          <span className={`mu-status${st?.connected ? ' ok' : ''}`}>{st?.connected ? 'Conectado' : st?.configured ? 'Sin conectar' : 'Sin configurar'}</span>
        </div>
        {st?.error && <div className="mu-err">{st.error}</div>}
        <label className="mu-field">
          <span>Lista de enfoque (enlace de Spotify o URI)</span>
          <input value={focusUri} placeholder="https://open.spotify.com/playlist/…" onChange={(e) => setFocusUri(e.target.value)} />
        </label>
        <label className="mu-check">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Pomodoro: reproducir al empezar el foco y pausar en los descansos
        </label>
        <div className="mu-hr" />
        <div className="mu-cfg-btns">
          <button className="btn sm" onClick={() => void save().then((r) => r && ui.toast('Spotify guardado'))}>
            Guardar
          </button>
          <button className="btn sm p" disabled={busy || !clientId.trim()} onClick={() => void connect()}>
            {st?.connected ? 'Reconectar' : 'Conectar'}
          </button>
          {st?.connected && (
            <button className="btn sm danger" onClick={disconnect}>
              Desconectar
            </button>
          )}
        </div>
      </section>
    )

  return (
    <>
      <div className="meta" style={{ marginBottom: 8 }}>
        Controla Spotify desde cualquier pantalla. Crea una app en developer.spotify.com, añade esta URI de redirección exactamente como aparece y pega aquí su Client ID:{' '}
        <b>{REDIRECT}</b>. Pausar, reanudar y cambiar de pista requiere Spotify Premium y un dispositivo activo.
      </div>
      <div className="grid2">
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
