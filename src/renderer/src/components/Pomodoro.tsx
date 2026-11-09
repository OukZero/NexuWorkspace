import * as Popover from '@radix-ui/react-popover'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { SpotifyAction, SpotifyNow } from '../../../shared/types'
import { completeFocus, setPomo, startPhase, usePomodoro } from '../pomodoro'
import { activeEntry, useDB, useNow } from '../store'
import { useUi } from '../ui'
import { G } from './glyphs'

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Con «auto» activado, la música sigue a las fases del pomodoro. Los fallos (sin dispositivo, sin Premium) se ignoran. */
function music(auto: boolean | undefined, action: SpotifyAction): void {
  if (auto) void Promise.resolve(window.api.call('spotify:control', action)).catch(() => undefined)
}

/** Mini control de Spotify dentro del menú del pomodoro; no se muestra si no hay sesión conectada. */
function Music(): ReactNode {
  const ui = useUi()
  const [now, setNow] = useState<SpotifyNow | null | undefined>(undefined)
  const [on, setOn] = useState(false)
  const refresh = (): void => void Promise.resolve(window.api.call('spotify:now')).then(setNow, () => setNow(null))
  useEffect(() => {
    void Promise.resolve(window.api.call('spotify:status')).then((st) => {
      setOn(st.connected)
      if (st.connected) refresh()
    })
  }, [])
  if (!on) return null
  const act = (a: SpotifyAction): void => void ui.run('spotify:control', a).then(() => setTimeout(refresh, 600))
  return (
    <div className="pomo-row" style={{ alignItems: 'center', gap: 6 }}>
      <div className="meta" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {now ? `${now.title} · ${now.artist}` : now === null ? 'Spotify sin reproducir' : '…'}
      </div>
      <button className="btn sm" aria-label="Anterior" onClick={() => act('prev')}>
        ‹
      </button>
      <button className="btn sm" aria-label={now?.playing ? 'Pausar' : 'Reproducir'} onClick={() => act(now?.playing ? 'pause' : 'play')}>
        {now?.playing ? '❚❚' : '▶'}
      </button>
      <button className="btn sm" aria-label="Siguiente" onClick={() => act('next')}>
        ›
      </button>
    </div>
  )
}

function ping(title: string, body: string): void {
  try {
    if (Notification.permission === 'granted') new Notification(title, { body })
    else if (Notification.permission !== 'denied') void Notification.requestPermission()
  } catch {
    /* sin notificaciones del sistema: queda el aviso dentro de la app */
  }
}

/** Ciclos de foco y descanso ligados al timer de horas. Se muestra dentro de la barra del timer. */
export function Pomodoro(): ReactNode {
  const p = usePomodoro()
  const db = useDB()
  const ui = useUi()
  const now = useNow(1000)
  const running = !!activeEntry(db)
  const paused = !!db.paused && !running
  const firedFor = useRef(0)

  // al encender o al arrancar el timer sin fase activa, empieza el foco
  useEffect(() => {
    if (p.on && running && !p.endsAt) {
      startPhase('focus')
      music(db.settings.spotifyAuto, 'focus')
    }
  }, [p.on, running, p.endsAt, db.settings.spotifyAuto])

  useEffect(() => {
    if (!p.on || !p.endsAt || now < p.endsAt || firedFor.current === p.endsAt) return
    firedFor.current = p.endsAt
    if (now - p.endsAt > 90_000) return startPhase('focus') // fase vieja (la barra no estaba visible): no cuenta como completada
    if (p.phase === 'focus') {
      completeFocus()
      startPhase('break')
      music(db.settings.spotifyAuto, 'pause')
      ping('Pausa', `Llevas ${p.focusMin} min enfocado. Descansa ${p.breakMin} min.`)
      if (p.pauseTimer && running) void ui.run('timer:pause')
      ui.toast(`Pomodoro completado · descansa ${p.breakMin} min`)
    } else {
      startPhase('focus')
      music(db.settings.spotifyAuto, 'focus')
      ping('A trabajar', 'Terminó el descanso.')
      ui.toast('Fin del descanso', false, { label: 'Reanudar timer', run: () => void ui.run('timer:resume') })
    }
  }, [now, p, running, ui, db.settings.spotifyAuto])

  const left = p.endsAt ? p.endsAt - now : 0
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className={`now-pomo ${p.on ? `on ${p.phase}` : ''}`} title="Pomodoro: ciclos de foco y descanso" aria-label="Pomodoro">
          {p.on && p.endsAt ? `${p.phase === 'focus' ? 'foco' : 'pausa'} ${mmss(left)}` : <G n="hours" size={13} />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pmenu pomo-menu" side="bottom" align="end" sideOffset={8} collisionPadding={12}>
          <label className="pomo-row">
            <input type="checkbox" checked={p.on} onChange={(e) => setPomo({ on: e.target.checked })} /> Activar pomodoro
          </label>
          <div className="pomo-row">
            <label>
              Foco (min)
              <input type="number" min={5} max={120} value={p.focusMin} onChange={(e) => setPomo({ focusMin: Number(e.target.value) || 25 })} />
            </label>
            <label>
              Descanso (min)
              <input type="number" min={1} max={60} value={p.breakMin} onChange={(e) => setPomo({ breakMin: Number(e.target.value) || 5 })} />
            </label>
          </div>
          <label className="pomo-row">
            <input type="checkbox" checked={p.pauseTimer} onChange={(e) => setPomo({ pauseTimer: e.target.checked })} /> Pausar el timer en los descansos
          </label>
          <div className="meta">Hoy: {p.done} {p.done === 1 ? 'pomodoro' : 'pomodoros'} completados</div>
          <Music />
          {p.on && (
            <div className="pomo-row">
              <button className="btn sm" onClick={() => startPhase('focus')}>
                Reiniciar foco
              </button>
              <button className="btn sm" onClick={() => startPhase('break')}>
                Saltar al descanso
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
