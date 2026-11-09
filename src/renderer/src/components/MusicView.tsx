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

/** Vista «Música»: a la izquierda el reproductor, los dispositivos y tus playlists; a la derecha la configuración de Spotify. */
export function MusicView({ compact }: { compact?: boolean }): ReactNode {
  const sp = useSpotify()
  const ui = useUi()
  const { pos, dur } = useProgress()
  const connected = !!sp.status?.connected
  const n = sp.now
  const act = (a: Parameters<typeof spotifyAct>[0]): void => void spotifyAct(a).then((m) => m && ui.toast(m, true))

  // dentro de un panel del Espacio: reproductor sencillo y tus playlists en lista
  if (compact)
    return (
      <div className="music mu-compact">
        {connected ? (
          <section className="mu-card mu-mini">
            <div className="mu-eyebrow mu-k">{n ? (n.playing ? 'Sonando ahora' : 'En pausa') : 'Sin reproducir'}</div>
            <b className="mu-t">{n ? n.title : 'Nada sonando'}</b>
            {n && <div className="mu-a">{n.artist}</div>}
            <div className="mu-transport">
              <button className="mu-tbtn" title="Anterior" aria-label="Anterior" onClick={() => act('prev')}>
                <G n="skipprev" size={18} />
              </button>
              <button className="mu-play" title={n?.playing ? 'Pausar' : 'Reproducir'} aria-label={n?.playing ? 'Pausar' : 'Reproducir'} onClick={() => act(n?.playing ? 'pause' : n ? 'play' : 'focus')}>
                <G n={n?.playing ? 'pause' : 'play'} size={18} />
              </button>
              <button className="mu-tbtn" title="Siguiente" aria-label="Siguiente" onClick={() => act('next')}>
                <G n="skipnext" size={18} />
              </button>
            </div>
            {sp.error && <div className="mu-err">{sp.error}</div>}
          </section>
        ) : (
          <section className="mu-card mu-mini">
            <div className="mu-eyebrow mu-k">Sin conectar</div>
            <b className="mu-t">Conecta tu Spotify</b>
            <div className="mu-a">Añade tu Client ID en la vista Música para ver aquí tus playlists.</div>
            <div className="mu-transport">
              <button className="btn sm p" onClick={() => ui.go('music')}>
                Abrir Música
              </button>
            </div>
          </section>
        )}
        {connected && <SpotifySearch compact />}
      </div>
    )

  return (
    <div className="music music-wrap">
      <div className="mu-col">
        {connected && (
          <section className="mu-card now-play">
            <div className="mu-cover" style={n?.art ? { backgroundImage: `url("${n.art}")` } : undefined}>
              {!n?.art && <G n="music" size={56} stroke={1.8} />}
            </div>
            <div className="mu-body">
              <div className="mu-eyebrow mu-k">{n ? (n.playing ? 'Sonando ahora' : 'En pausa') : 'Sin reproducir'}</div>
              <h2 className="mu-t">{n ? n.title : 'Nada sonando'}</h2>
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
              <div className="mu-transport">
                <button className="mu-tbtn" title="Anterior" aria-label="Anterior" onClick={() => act('prev')}>
                  <G n="skipprev" size={18} />
                </button>
                <button className="mu-play" title={n?.playing ? 'Pausar' : 'Reproducir'} aria-label={n?.playing ? 'Pausar' : 'Reproducir'} onClick={() => act(n?.playing ? 'pause' : n ? 'play' : 'focus')}>
                  <G n={n?.playing ? 'pause' : 'play'} size={22} />
                </button>
                <button className="mu-tbtn" title="Siguiente" aria-label="Siguiente" onClick={() => act('next')}>
                  <G n="skipnext" size={18} />
                </button>
                <button className="btn sm mu-focus" title="Empieza tu lista de enfoque (se configura en la tarjeta de Spotify)" onClick={() => act('focus')}>
                  <G n="music" size={13} /> Lista de enfoque
                </button>
                <VolumeControl variant="inline" />
              </div>
              {sp.error && <div className="mu-err">{sp.error}</div>}
              <DevicePicker variant="inline" />
            </div>
          </section>
        )}
        {!connected && (
          <section className="mu-card now-play mu-setup">
            <div className="mu-cover">
              <G n="music" size={56} stroke={1.8} />
            </div>
            <div className="mu-body">
              <div className="mu-eyebrow mu-k">Sin conectar</div>
              <h2 className="mu-t">Conecta tu Spotify</h2>
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
                  Copia el <b>Client ID</b> en la tarjeta de la derecha y pulsa <b>Conectar</b>.
                </li>
              </ol>
            </div>
          </section>
        )}
        {connected && <SpotifySearch />}
      </div>
      <SpotifySettings card />
    </div>
  )
}
