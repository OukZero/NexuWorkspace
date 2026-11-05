import type { MouseEvent, ReactNode } from 'react'
import type { Task } from '../../../shared/types'
import { workFolder } from '../../../shared/util'
import { activeEntry, taskMs, useDB, useNow } from '../store'
import { PRIO, baseName, fmtH } from '../utils'
import { useUi } from '../ui'

const stop = (e: MouseEvent): void => e.stopPropagation()

export function TaskRow({ task: t }: { task: Task }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const now = useNow(30000)
  const running = activeEntry(db)?.taskId === t.id
  const spent = taskMs(db, t.id, now)
  const recurring = t.recurrence?.type && t.recurrence.type !== 'none'
  const subtasks = t.subtasks ?? []

  return (
    <div className={`row ${t.status} p-${t.priority} ${running ? 'doing' : ''}`} onClick={() => ui.openTask(t)}>
      <button
        className={`check ${t.status === 'done' ? 'on' : ''}`}
        title="Completar"
        aria-label={t.status === 'done' ? 'Reabrir la tarea' : 'Completar la tarea'}
        onClick={(e) => {
          stop(e)
          if (t.status !== 'done') ui.celebrate()
          void ui.run('task:save', { id: t.id, status: t.status === 'done' ? 'today' : 'done' })
        }}
      />
      <div className="main">
        <div className="title">{t.title}</div>
        <div className="meta">
          {t.client && <span>{t.client}</span>}
          {t.project && <span className="chip">{t.project}</span>}
          <span className={`chip ${t.priority}`}>{PRIO[t.priority]}</span>
          {recurring && <span className="chip">↻ recurrente</span>}
          {t.fromTemplate && (
            <span className={`chip ${t.carried ? 'high' : ''}`}>↻ rutina{t.carried ? ` · pendiente hace ${t.carried} d` : ''}</span>
          )}
          {spent > 0 ? (
            <span>
              ⏱ {fmtH(spent)} h{t.estimateMin ? ` / ${(t.estimateMin / 60).toFixed(1)} h` : ''}
            </span>
          ) : (
            t.estimateMin > 0 && <span>est. {(t.estimateMin / 60).toFixed(1)} h</span>
          )}
          {subtasks.length > 0 && (
            <span className="chip" title="Subtareas completadas">
              ☑ {subtasks.filter((s) => s.done).length}/{subtasks.length}
            </span>
          )}
          {(t.tags ?? []).map((tag) => (
            <span key={tag} className="chip tag">
              #{tag}
            </span>
          ))}
          {workFolder(t, db.groups) ? <span title={workFolder(t, db.groups)}>📁 {baseName(workFolder(t, db.groups))}</span> : <span>sin carpeta</span>}
        </div>
      </div>
      <div className="actions">
        <button
          className="icon"
          title={running ? 'Detener timer' : 'Iniciar timer'}
          onClick={(e) => {
            stop(e)
            if (running) void ui.run('timer:stop')
            else void ui.run('timer:start', t.id)
          }}
        >
          {running ? '■' : '▶'}
        </button>
        <button
          className="icon"
          title="Chat con Claude para esta tarea"
          onClick={(e) => {
            stop(e)
            ui.openChat(t.id)
          }}
        >
          💬
        </button>
        <button
          className="icon"
          title="Terminal en la carpeta del proyecto (Ctrl+`)"
          aria-label="Abrir terminal aquí"
          onClick={(e) => {
            stop(e)
            ui.openTerminal(t.id)
          }}
        >
          &gt;_
        </button>
        <button
          className="icon"
          title="Abrir en VS Code"
          aria-label="Abrir en VS Code"
          onClick={(e) => {
            stop(e)
            void ui.run('vscode:open', t.folder)
          }}
        >
          ⟨/⟩
        </button>
        <button
          className="icon"
          title="Editar"
          onClick={(e) => {
            stop(e)
            ui.editTask(t)
          }}
        >
          ✎
        </button>
      </div>
    </div>
  )
}
