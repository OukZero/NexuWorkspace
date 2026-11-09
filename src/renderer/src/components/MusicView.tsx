import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { spotifyAct, useSpotify } from '../spotify'
import { useUi } from '../ui'
import { G } from './glyphs'
import { DevicePicker } from './DevicePicker'
import { VolumeControl } from './VolumeControl'
import { SpotifySearch } from './SpotifySearch'
import { SpotifySettings } from './SpotifySettings'

export const fmtMs = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Progreso que avanza solo entre lecturas (cada 6 s) mientras suena. */
export function useProgress(): { pos: number; dur: number } {
  const { now, at } = useSpotify()
  const [, tick] = useState(0)
  useEffect(() => {
    if (!now?.playing) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [now?.playing, at])
  const dur = now?.durationMs ?? 0
  const pos = Math.min(dur, (now?.progressMs ?? 0) + (now?.playing ? Date.now() - at : 0))
  return { pos, dur }
}

/** Vista «Música»: reproductor grande si Spotify está conectado y la configuración paso a paso si no. */
export function MusicView(): ReactNode {
  const sp = useSpotify()
  const ui = useUi()
  const { pos, dur } = useProgress()
  const connected = !!sp.status?.connected
  const n = sp.now
  const act = (a: Parameters<typeof spotifyAct>[0]): void => void spotifyAct(a).then((m) => m && ui.toast(m, true))

  return (
    <div className="music">
      {connected && (
        <section className="mu-card">
          <div className="mu-art" style={n?.art ? { backgroundImage: `url("${n.art}")` } : undefined}>
            {!n?.art && <G n="music" size={44} stroke={1.3} />}
          </div>
          <div className="mu-body">
            <div className="mu-k">{n ? (n.playing ? 'Sonando ahora' : 'En pausa') : 'Sin reproducir'}</div>
            <div className="mu-t">{n ? n.title : 'Nada sonando'}</div>
            <div className="mu-a">{n ? n.artist : 'Pulsa reproducir para empezar tu lista de enfoque o reanudar lo último.'}</div>
            {n && dur > 0 && (
              <div className="mu-bar" aria-hidden>
                <span>{fmtMs(pos)}</span>
                <i>
                  <b style={{ width: `${(pos / dur) * 100}%` }} />
                </i>
                <span>{fmtMs(dur)}</span>
              </div>
            )}
            <div className="mu-ctl">
              <button className="ib" title="Anterior" aria-label="Anterior" onClick={() => act('prev')}>
                <G n="skipprev" size={18} />
              </button>
              <button className="mu-play" title={n?.playing ? 'Pausar' : 'Reproducir'} aria-label={n?.playing ? 'Pausar' : 'Reproducir'} onClick={() => act(n?.playing ? 'pause' : n ? 'play' : 'focus')}>
                <G n={n?.playing ? 'pause' : 'play'} size={20} />
              </button>
              <button className="ib" title="Siguiente" aria-label="Siguiente" onClick={() => act('next')}>
                <G n="skipnext" size={18} />
              </button>
              <button className="btn sm" title="Empieza tu lista de enfoque (configúrala abajo)" onClick={() => act('focus')}>
                Lista de enfoque
              </button>
            </div>
            {n?.device && <div className="mu-dev">En: {n.device}</div>}
            <VolumeControl variant="inline" />
            <DevicePicker variant="inline" />
            {sp.error && <div className="mu-err">{sp.error}</div>}
          </div>
        </section>
      )}
      {!connected && (
        <section className="mu-card mu-setup">
          <div className="mu-art">
            <G n="music" size={44} stroke={1.3} />
          </div>
          <div className="mu-body">
            <div className="mu-t">Conecta tu Spotify</div>
            <ol className="mu-steps">
              <li>
                Entra a <b>developer.spotify.com/dashboard</b> y pulsa <b>Create app</b>.
              </li>
              <li>
                En <b>Redirect URI</b> agrega <code>http://127.0.0.1:53682/callback</code> y marca <b>Web API</b>.
              </li>
              <li>
                En <b>User Management</b> agrega el correo de tu cuenta de Spotify.
              </li>
              <li>
                Copia el <b>Client ID</b> aquí abajo y pulsa <b>Conectar</b>.
              </li>
            </ol>
          </div>
        </section>
      )}
      {connected && <SpotifySearch />}
      <SpotifySettings />
    </div>
  )
}
