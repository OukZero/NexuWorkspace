import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { SpotifyPlaylist, SpotifySearchResult } from '../../../shared/types'
import { spotifyPlay, spotifyQueue } from '../spotify'
import { useUi } from '../ui'
import { G } from './glyphs'

const clean = (e: unknown): string => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const mmss = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface RowProps {
  art?: string
  title: string
  sub: string
  tail?: string
  uri: string
  busy: boolean
  onPlay: (uri: string) => void
  onQueue?: (uri: string) => void
}

function Row({ art, title, sub, tail, uri, busy, onPlay, onQueue }: RowProps): ReactNode {
  return (
    <div className="mu-row">
      <span className="mu-th" style={art ? { backgroundImage: `url("${art}")` } : undefined} aria-hidden>
        {!art && <G n="music" size={16} />}
      </span>
      <span className="mu-rt">
        <b title={title}>{title}</b>
        <small title={sub}>{sub}</small>
      </span>
      {tail && <span className="mu-rd">{tail}</span>}
      {onQueue && (
        <button className="ib" title="Añadir a la cola" aria-label={`Añadir ${title} a la cola`} onClick={() => onQueue(uri)}>
          <G n="plus" size={16} />
        </button>
      )}
      <button className="ib mu-rp" title="Reproducir" aria-label={`Reproducir ${title}`} disabled={busy} onClick={() => onPlay(uri)}>
        <G n="play" size={16} />
      </button>
    </div>
  )
}

/** Buscador de canciones y playlists de la vista «Música»; sin texto muestra tus playlists. */
export function SpotifySearch(): ReactNode {
  const ui = useUi()
  const [q, setQ] = useState('')
  const [res, setRes] = useState<SpotifySearchResult | null>(null)
  const [mine, setMine] = useState<SpotifyPlaylist[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [err, setErr] = useState('')
  const [mineErr, setMineErr] = useState('')
  const [playing, setPlaying] = useState('')
  const seq = useRef(0) // descarta respuestas de búsquedas que ya no son la última

  const text = q.trim()
  const active = text.length >= 2

  useEffect(() => {
    const id = ++seq.current
    if (!active) {
      setRes(null)
      setSearching(false)
      setErr('')
      return
    }
    setSearching(true)
    const t = setTimeout(() => {
      window.api.call('spotify:search', text).then(
        (r) => {
          if (seq.current !== id) return
          setRes(r)
          setErr('')
          setSearching(false)
        },
        (e) => {
          if (seq.current !== id) return
          setErr(clean(e))
          setSearching(false)
        }
      )
    }, 400)
    return () => clearTimeout(t)
  }, [text, active])

  useEffect(() => {
    window.api.call('spotify:playlists').then(setMine, (e) => setMineErr(clean(e)))
  }, [])

  const play = async (uri: string): Promise<void> => {
    setPlaying(uri)
    const m = await spotifyPlay(uri)
    setPlaying('')
    if (m) ui.toast(m, true)
  }
  const queue = async (uri: string): Promise<void> => {
    const m = await spotifyQueue(uri)
    ui.toast(m || 'Añadida a la cola', !!m)
  }

  const playlistRows = (list: SpotifyPlaylist[]): ReactNode =>
    list.map((p) => <Row key={p.uri} art={p.art} title={p.name} sub={p.owner ? `Playlist · ${p.owner}` : 'Playlist'} uri={p.uri} busy={playing === p.uri} onPlay={(u) => void play(u)} />)

  let body: ReactNode = null
  if (active) {
    if (err) body = <div className="mu-err">{err}</div>
    else if (res) {
      body =
        res.tracks.length === 0 && res.playlists.length === 0 ? (
          <div className="meta">{searching ? 'Buscando…' : 'Sin resultados.'}</div>
        ) : (
          <>
            {res.tracks.length > 0 && (
              <>
                <div className="mu-h">Canciones</div>
                {res.tracks.map((t) => (
                  <Row key={t.uri} art={t.art} title={t.title} sub={[t.artist, t.album].filter(Boolean).join(' · ')} tail={mmss(t.durationMs)} uri={t.uri} busy={playing === t.uri} onPlay={(u) => void play(u)} onQueue={(u) => void queue(u)} />
                ))}
              </>
            )}
            {res.playlists.length > 0 && (
              <>
                <div className="mu-h">Playlists</div>
                {playlistRows(res.playlists)}
              </>
            )}
          </>
        )
    } else body = <div className="meta">Buscando…</div>
  } else if (mine && mine.length > 0) {
    body = (
      <>
        <div className="mu-h">Tus playlists · {mine.length}</div>
        <div className="mu-scroll">{playlistRows(mine)}</div>
      </>
    )
  } else if (mineErr) {
    body = <div className="meta">{mineErr}</div>
  } else if (mine) {
    body = <div className="meta">Aún no tienes playlists en tu biblioteca de Spotify.</div>
  } else {
    body = <div className="meta">Cargando tus playlists…</div>
  }

  return (
    <section className="mu-search" aria-label="Buscar en Spotify">
      <div className="mu-sbox">
        <G n="search" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar canciones o playlists…" aria-label="Buscar canciones o playlists en Spotify" spellCheck={false} />
        {q && (
          <button className="ib" title="Limpiar" aria-label="Limpiar la búsqueda" onClick={() => setQ('')}>
            <G n="x" size={14} />
          </button>
        )}
      </div>
      {searching && active && res && <div className="meta">Buscando…</div>}
      {body}
    </section>
  )
}
