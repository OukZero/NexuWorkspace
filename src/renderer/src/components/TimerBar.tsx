import type { ReactNode } from 'react'
import { activeEntry, findTask, useDB, useNow } from '../store'
import { fmtDur } from '../utils'
import { useUi } from '../ui'

export function TimerBar(): ReactNode {
  const db = useDB()
  const ui = useUi()
  const now = useNow()
  const a = activeEntry(db)

  if (a) {
    const t = findTask(db, a.taskId)
    return (
      <div className="timerbar">
        <span className="pulse" />
        <div className="name">
          {t?.title} <span className="chip">{t?.project || 'sin proyecto'}</span>
        </div>
        <div className="t">{fmtDur(now - a.start)}</div>
        <button className="btn" onClick={() => ui.run('timer:pause')}>
          ⏸ Pausar
        </button>
        <button className="btn" onClick={() => ui.run('timer:stop')}>
          ■ Detener
        </button>
      </div>
    )
  }

  const paused = findTask(db, db.paused)
  if (!paused) return null
  return (
    <div className="timerbar">
      <span className="pulse" style={{ background: 'var(--warn)', animation: 'none' }} />
      <div className="name">
        {paused.title} <span className="chip">en pausa</span>
      </div>
      <button className="btn primary" onClick={() => ui.run('timer:resume')}>
        ▶ Reanudar
      </button>
      <button className="btn" onClick={() => ui.run('timer:stop')}>
        ■ Detener
      </button>
    </div>
  )
}
