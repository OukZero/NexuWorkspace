import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import type { Task } from '../../../shared/types'
import { workFolder } from '../../../shared/util'
import { activeEntry, taskMs, useDB, useNow } from '../store'
import { baseName, fmtH } from '../utils'
import { useUi } from '../ui'
import { taskColor, useAppearance } from '../theme'
import { CiBadges } from './CiBadges'
import { G } from './glyphs'
import { FocusBlockButton } from './FocusBlockButton'
import { LaunchButton } from './LaunchButton'

const stop = (e: MouseEvent): void => e.stopPropagation()
const h1 = (ms: number): string => fmtH(ms).replace('.', ',')

export function TaskRow({ task: t }: { task: Task }): ReactNode {
  const db = useDB()
  const ui = useUi()
  useAppearance() // repinta si cambian los colores de proyecto
  const pc = taskColor(t)
  const now = useNow(30000)
  const running = activeEntry(db)?.taskId === t.id
  const spent = taskMs(db, t.id, now)
  const recurring = t.recurrence?.type && t.recurrence.type !== 'none'
  const subtasks = t.subtasks ?? []
  const folder = workFolder(t, db.groups)
  const est = t.estimateMin * 60000
  const over = est > 0 && spent > est

  return (
    <div className={`row ${t.status} p-${t.priority} ${running ? 'doing run' : ''}`} data-pc={pc ? '1' : undefined} style={pc ? ({ '--pc': pc } as CSSProperties) : undefined} onClick={() => ui.openTask(t)}>
      <button
        className={`check ${t.status === 'done' ? 'on' : ''}`}
        title={t.status === 'done' ? 'Reabrir' : 'Completar'}
        aria-label={t.status === 'done' ? 'Reabrir la tarea' : 'Completar la tarea'}
        onClick={(e) => {
          stop(e)
          if (t.status !== 'done') ui.celebrate()
          void ui.run('task:save', { id: t.id, status: t.status === 'done' ? 'today' : 'done' })
        }}
      >
        <G n="check" size={11} stroke={3.5} />
      </button>
      <div className="main">
        <div className="title">{t.title}</div>
        <div className="meta">
          {running && <span className="ok">● activa</span>}
          {t.priority === 'high' && <span className="hi">alta</span>}
          {spent > 0 || est > 0 ? (
            <span className={`hrs ${over ? 'over' : ''}`} title={est ? `${h1(spent)} h de ${h1(est)} h estimadas` : 'Horas registradas'}>
              {h1(spent)}
              {est > 0 ? ` / ${h1(est)}` : ''} h
              {est > 0 && (
                <span className="bar" aria-hidden>
                  <i style={{ width: `${Math.min(100, (spent / est) * 100)}%` }} />
                </span>
              )}
            </span>
          ) : null}
          <CiBadges task={t} />
          {(t.project || t.client) && <span>{[t.project, t.client].filter(Boolean).join(' · ')}</span>}
          {subtasks.length > 0 && (
            <span className="xtra" title="Subtareas completadas">
              {subtasks.filter((s) => s.done).length}/{subtasks.length} subtareas
            </span>
          )}
          {recurring && <span>↻ recurrente</span>}
          {t.fromTemplate && <span className={t.carried ? 'hi' : ''}>↻ rutina{t.carried ? ` · ${t.carried} d pendiente` : ''}</span>}
          {(t.tags ?? []).map((tag) => (
            <span key={tag} className="tag xtra">
              #{tag}
            </span>
          ))}
          {/* la carpeta solo se muestra si aporta algo distinto del proyecto; el resto aparece al pasar el ratón */}
          {folder ? (
            baseName(folder) !== t.project && <span className="xtra" title={folder}>{baseName(folder)}</span>
          ) : (
            <span className="dim xtra">sin carpeta</span>
          )}
        </div>
      </div>
      <div className="actions hv">
        <button
          className="ib"
          title={running ? 'Detener timer' : 'Iniciar timer'}
          aria-label={running ? 'Detener timer' : 'Iniciar timer'}
          onClick={(e) => {
            stop(e)
            if (running) void ui.run('timer:stop')
            else void ui.run('timer:start', t.id)
          }}
        >
          <G n={running ? 'stop' : 'play'} size={14} />
        </button>
        <LaunchButton task={t} />
        {t.status !== 'done' && <FocusBlockButton task={t} />}
        <button
          className="ib"
          title="Chat con Claude para esta tarea"
          aria-label="Chat"
          onClick={(e) => {
            stop(e)
            ui.openChat(t.id)
          }}
        >
          <G n="chat" size={16} />
        </button>
        <button
          className="ib"
          title="Terminal en la carpeta del proyecto (Ctrl+`)"
          aria-label="Abrir terminal aquí"
          onClick={(e) => {
            stop(e)
            ui.openTerminal(t.id)
          }}
        >
          <G n="terminal" size={16} />
        </button>
        <button
          className="ib"
          title="Abrir en VS Code"
          aria-label="Abrir en VS Code"
          onClick={(e) => {
            stop(e)
            void ui.run('vscode:open', t.folder)
          }}
        >
          <G n="code" size={16} />
        </button>
        <button
          className="ib"
          title="Editar"
          aria-label="Editar la tarea"
          onClick={(e) => {
            stop(e)
            ui.editTask(t)
          }}
        >
          <G n="edit" size={16} />
        </button>
      </div>
    </div>
  )
}
