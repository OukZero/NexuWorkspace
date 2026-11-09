import type { ReactNode } from 'react'
import { activeEntry, findTask, useDB, useNow } from '../store'
import { fmtDur } from '../utils'
import { useUi } from '../ui'
import { G } from './glyphs'
import { Pomodoro } from './Pomodoro'

/** Timer en curso como píldora de la barra superior: tarea, tiempo y controles. Sin timer no ocupa espacio. */
export function TimerBar(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const now = useNow()
  const a = activeEntry(db)
  const t = findTask(db, a?.taskId ?? db.paused)
  if (!t || (!a && !db.paused)) return null
  const running = !!a

  return (
    <div className={`now ${running ? 'run' : 'paused'}`} role="timer" aria-label={`Timer de ${t.title}`}>
      <span className="now-d" aria-hidden />
      <button className="now-n" title={`${t.title}${t.project ? ` · ${t.project}` : ''} — abrir la tarea`} onClick={() => ui.openTask(t)}>
        {t.title}
      </button>
      {running ? <span className="now-c">{fmtDur(now - a.start)}</span> : <span className="now-c muted">en pausa</span>}
      <Pomodoro />
      {running ? (
        <button className="now-b" title="Pausar" aria-label="Pausar el timer" onClick={() => void ui.run('timer:pause')}>
          <G n="pause" size={12} />
        </button>
      ) : (
        <button className="now-b" title="Reanudar" aria-label="Reanudar el timer" onClick={() => void ui.run('timer:resume')}>
          <G n="play" size={12} />
        </button>
      )}
      <button className="now-b stop" title="Detener" aria-label="Detener el timer" onClick={() => void ui.run('timer:stop')}>
        <G n="stop" size={12} />
      </button>
    </div>
  )
}
