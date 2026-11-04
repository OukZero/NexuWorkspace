import type { ReactNode } from 'react'
import { closedConvs, convLabel, designConv, openConvs, taskRunning } from '../conversations'
import { findTask, useDB } from '../store'

const PANEL_LABEL: Record<string, string> = {
  today: 'Hoy',
  board: 'Tablero',
  hours: 'Horas',
  usage: 'Consumo',
  groups: 'Carpetas',
  settings: 'Ajustes'
}

interface TaskTabsProps {
  tasks: string[] // tareas con pestaña abierta
  active: string | null // tarea activa (null = el panel)
  panel: string // vista del panel (today, board…)
  unread: Set<string> // ids de tareas con mensajes sin ver
  onPanel(): void
  onSelect(taskId: string): void
  onClose(taskId: string): void
  onNew(): void
}

/** Nivel 1: el panel y una pestaña por tarea abierta. */
export function TaskTabs({ tasks, active, panel, unread, onPanel, onSelect, onClose, onNew }: TaskTabsProps): ReactNode {
  const db = useDB()
  return (
    <div className="tabs">
      <button className={`tab panel ${active === null ? 'active' : ''}`} onClick={onPanel} title="Volver al panel">
        <span>☰ {PANEL_LABEL[panel] ?? 'Panel'}</span>
      </button>
      {tasks.map((id) => {
        const t = findTask(db, id)
        if (!t) return null
        return (
          <div
            key={id}
            className={`tab ${active === id ? 'active' : ''}`}
            title={t.title}
            onClick={() => onSelect(id)}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(id)
            }}
          >
            <i className={`tdot ${taskRunning(db, id) ? 'run' : unread.has(id) ? 'unread' : ''}`} />
            <span className="tt">{t.title}</span>
            <button
              className="x"
              title="Cerrar la tarea (sus conversaciones se conservan)"
              onClick={(e) => {
                e.stopPropagation()
                onClose(id)
              }}
            >
              ✕
            </button>
          </div>
        )
      })}
      <button className="tab plus" title="Abrir una conversación o una tarea" onClick={onNew}>
        ＋
      </button>
    </div>
  )
}

export type TaskMode = 'chat' | 'design' | 'git'

interface ConvTabsProps {
  taskId: string
  active: string | null
  mode: TaskMode
  unread: Set<string> // ids de conversaciones con mensajes sin ver
  onMode(m: TaskMode): void
  onSelect(convId: string): void
  onClose(convId: string): void
  onNew(): void
}

/** Nivel 2: Chat / Diseño de la tarea activa y, en Chat, sus conversaciones (cambian al cambiar de tarea). */
export function ConvTabs({ taskId, active, mode, unread, onMode, onSelect, onClose, onNew }: ConvTabsProps): ReactNode {
  const db = useDB()
  const convs = openConvs(db, taskId)
  const hidden = closedConvs(db, taskId).length
  const designing = !!designConv(db, taskId)?.chat.running
  return (
    <div className="tabs sub">
      <div className="seg modeseg">
        <button className={mode === 'chat' ? 'on' : ''} onClick={() => onMode('chat')}>
          💬 Chat
        </button>
        <button className={mode === 'design' ? 'on' : ''} onClick={() => onMode('design')} title="Mockups y diseños de esta tarea">
          🎨 Diseño {designing && <i className="tdot run" />}
        </button>
        <button className={mode === 'git' ? 'on' : ''} onClick={() => onMode('git')} title="Control de Git del proyecto: cambios, commit, ramas e historial">
          ⎇ Git
        </button>
      </div>
      {mode === 'chat' && convs.map(({ id, chat }) => (
        <div
          key={id}
          className={`tab ${active === id ? 'active' : ''}`}
          title={convLabel(chat)}
          onClick={() => onSelect(id)}
          onAuxClick={(e) => {
            if (e.button === 1) onClose(id)
          }}
        >
          <i className={`tdot ${chat.running ? 'run' : unread.has(id) ? 'unread' : ''}`} />
          <span className="tt">{convLabel(chat)}</span>
          <button
            className="x"
            title="Cerrar conversación (se puede reabrir desde «＋»)"
            onClick={(e) => {
              e.stopPropagation()
              onClose(id)
            }}
          >
            ✕
          </button>
        </div>
      ))}
      {mode === 'chat' && (
        <button className="tab plus" title="Nueva conversación en esta tarea, u otra tarea" onClick={onNew}>
          ＋
        </button>
      )}
      {mode === 'chat' && hidden > 0 && <span className="sublabel">{hidden} cerrada{hidden > 1 ? 's' : ''}</span>}
    </div>
  )
}
