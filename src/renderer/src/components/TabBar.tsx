import { useState, type ReactNode } from 'react'
import { closedConvs, convLabel, designConv, openConvs, taskRunning } from '../conversations'
import type { CSSProperties } from 'react'
import { findTask, useDB } from '../store'
import { taskColor, useAppearance } from '../theme'
import { G } from './glyphs'

export const PANEL_LABEL: Record<string, string> = {
  today: 'Inicio',
  board: 'Tablero',
  workspace: 'Espacio',
  hours: 'Horas',
  redmine: 'Redmine',
  history: 'Historial',
  usage: 'Consumo',
  dashboard: 'Productividad',
  groups: 'Carpetas',
  music: 'Música',
  web: 'Navegador',
  notes: 'Notas',
  meetings: 'Reuniones',
  whatsapp: 'WhatsApp',
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
  onMove(from: string, to: string): void
  onPop(taskId: string, atCursor: boolean): void
}

/** Nivel 1: el panel y una pestaña por tarea abierta. */
export function TaskTabs({ tasks, active, panel, unread, onPanel, onSelect, onClose, onNew, onMove, onPop }: TaskTabsProps): ReactNode {
  const db = useDB()
  const [over, setOver] = useState<string | null>(null)
  useAppearance()
  return (
    <div className="tabs">
      <button className={`tab panel ${active === null ? 'active' : ''}`} onClick={onPanel} title="Volver a Inicio">
        <span>☰ {PANEL_LABEL[panel] ?? 'Panel'}</span>
      </button>
      {tasks.map((id) => {
        const t = findTask(db, id)
        if (!t) return null
        return (
          <div
            key={id}
            className={`tab ${active === id ? 'active' : ''} ${over === id ? 'drop' : ''}`}
            data-pc={taskColor(t) ? '1' : undefined}
            style={taskColor(t) ? ({ '--pc': taskColor(t) } as CSSProperties) : undefined}
            title={`${t.title}
Arrastra para reordenar; suéltala fuera de la ventana para abrirla aparte`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/shutoki-tab', id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('text/shutoki-tab')) return
              e.preventDefault()
              setOver(id)
            }}
            onDragLeave={() => setOver((o) => (o === id ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              setOver(null)
              const from = e.dataTransfer.getData('text/shutoki-tab')
              if (from && from !== id) onMove(from, id)
            }}
            onDragEnd={(e) => {
              setOver(null)
              // soltada fuera de la ventana: sale a una ventana propia, donde se soltó
              const out = e.clientX < 0 || e.clientY < 0 || e.clientX > window.innerWidth || e.clientY > window.innerHeight
              if (e.dataTransfer.dropEffect === 'none' && out) onPop(id, true)
            }}
            onClick={() => onSelect(id)}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(id)
            }}
          >
            <i className={`tdot ${taskRunning(db, id) ? 'run' : unread.has(id) ? 'unread' : ''}`} />
            <span className="tt">{t.title}</span>
            <button
              className="x pop"
              title="Abrir en una ventana aparte"
              onClick={(e) => {
                e.stopPropagation()
                onPop(id, false)
              }}
            >
              ⧉
            </button>
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
        <G n="plus" size={14} />
      </button>
    </div>
  )
}

export type TaskMode = 'chat' | 'design' | 'git' | 'files'

/** Modos de la tarea: Chat, Diseño, Git y Archivos. */
export function ModeSeg({ mode, onMode, designing }: { mode: TaskMode; onMode(m: TaskMode): void; designing?: boolean }): ReactNode {
  return (
    <div className="seg grad modeseg">
      <button className={mode === 'chat' ? 'on' : ''} onClick={() => onMode('chat')}>
        <G n="chat" size={14} /> Chat
      </button>
      <button className={mode === 'design' ? 'on' : ''} onClick={() => onMode('design')} title="Mockups y diseños de esta tarea">
        <G n="design" size={14} /> Diseño {designing && <i className="tdot run" />}
      </button>
      <button className={mode === 'git' ? 'on' : ''} onClick={() => onMode('git')} title="Control de Git del proyecto: cambios, commit, ramas e historial">
        <G n="git" size={14} /> Git
      </button>
      <button className={mode === 'files' ? 'on' : ''} onClick={() => onMode('files')} title="Explorar y leer el código de la tarea (solo lectura)">
        <G n="code" size={14} /> Archivos
      </button>
    </div>
  )
}

interface ConvTabsProps {
  taskId: string
  active: string | null
  mode: TaskMode
  unread: Set<string> // ids de conversaciones con mensajes sin ver
  onMode(m: TaskMode): void
  onSelect(convId: string): void
  onClose(convId: string): void
  onNew(): void
  onPop?(): void
  docked?: boolean // ventana suelta: el botón la devuelve a la principal
  /** Las conversaciones se listan en el panel de la izquierda: aquí solo van los modos. */
  listMode?: boolean
  /** Los modos van en la fila de la tarea (TaskHead): aquí no se dibujan. */
  noModes?: boolean
}

/** Nivel 2: Chat / Diseño de la tarea activa y, en Chat, sus conversaciones (cambian al cambiar de tarea). */
export function ConvTabs({ taskId, active, mode, unread, onMode, onSelect, onClose, onNew, onPop, docked, listMode, noModes }: ConvTabsProps): ReactNode {
  const db = useDB()
  const convs = openConvs(db, taskId)
  const hidden = closedConvs(db, taskId).length
  const designing = !!designConv(db, taskId)?.chat.running
  return (
    <div className="tabs sub">
      {!noModes && <ModeSeg mode={mode} onMode={onMode} designing={designing} />}
      {mode === 'chat' && !listMode && convs.map(({ id, chat }) => (
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
      {mode === 'chat' && !listMode && (
        <button className="tab plus" title="Nueva conversación en esta tarea, u otra tarea" onClick={onNew}>
          <G n="plus" size={14} />
        </button>
      )}
      {onPop && (
        <button className="tab plus" title={docked ? 'Devolver esta tarea a la ventana principal' : 'Sacar esta tarea a una ventana aparte'} onClick={onPop}>
          <G n="popout" size={14} />
        </button>
      )}
      {mode === 'chat' && !listMode && hidden > 0 && <span className="sublabel">{hidden} cerrada{hidden > 1 ? 's' : ''}</span>}
    </div>
  )
}
