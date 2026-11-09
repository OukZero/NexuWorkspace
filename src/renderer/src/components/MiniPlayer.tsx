import type { ReactNode } from 'react'
import { spotifyAct, useSpotify } from '../spotify'
import { useUi } from '../ui'
import { DevicePicker } from './DevicePicker'
import { VolumeControl } from './VolumeControl'
import { G } from './glyphs'
import { useProgress } from './MusicView'

/** Reproductor discreto de la barra superior: aparece en cualquier vista si Spotify está conectado. */
export function MiniPlayer(): ReactNode {
  const sp = useSpotify()
  const ui = useUi()
  const { pos, dur } = useProgress()
  if (!sp.status?.connected || ui.view === 'music') return null
  const n = sp.now
  const act = (a: Parameters<typeof spotifyAct>[0]): void => void spotifyAct(a).then((m) => m && ui.toast(m, true))
  return (
    <div className={`miniplayer ${n?.playing ? 'on' : ''}`} role="group" aria-label="Spotify">
      <button className="mp-main" title={n ? `${n.title} · ${n.artist} — abrir Música` : 'Abrir Música'} aria-label="Abrir Música" onClick={() => ui.go('music')}>
        <span className="mp-art" style={n?.art ? { backgroundImage: `url("${n.art}")` } : undefined}>
          {!n?.art && <G n="music" size={14} />}
        </span>
        <span className="mp-t">{n ? `${n.title} · ${n.artist}` : 'Spotify'}</span>
      </button>
      <button className="ib mp-b" title="Anterior" aria-label="Anterior" onClick={() => act('prev')}>
        <G n="skipprev" size={14} />
      </button>
      <button className="ib mp-b" title={n?.playing ? 'Pausar' : 'Reproducir'} aria-label={n?.playing ? 'Pausar' : 'Reproducir'} onClick={() => act(n?.playing ? 'pause' : n ? 'play' : 'focus')}>
        <G n={n?.playing ? 'pause' : 'play'} size={14} />
      </button>
      <button className="ib mp-b" title="Siguiente" aria-label="Siguiente" onClick={() => act('next')}>
        <G n="skipnext" size={14} />
      </button>
      <VolumeControl variant="mini" />
      <DevicePicker variant="mini" />
      {n && dur > 0 && <i className="mp-bar" aria-hidden><b style={{ width: `${(pos / dur) * 100}%` }} /></i>}
    </div>
  )
}
