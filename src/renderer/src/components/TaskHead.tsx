import type { ReactNode } from 'react'
import { designConv } from '../conversations'
import { useDB } from '../store'
import { setTaskSlot, setTaskSlotLeft } from '../taskSlot'
import { useUi } from '../ui'
import { G } from './glyphs'
import { ModeSeg, type TaskMode } from './TabBar'

/** Fila de la tarea activa: modos (Chat, Diseño, Git, Archivos) a la izquierda y sus acciones a la derecha. */
export function TaskHead({ taskId, mode, onMode }: { taskId: string; mode: TaskMode; onMode(m: TaskMode): void }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const designing = !!designConv(db, taskId)?.chat.running
  return (
    <div className="taskhead">
      <ModeSeg mode={mode} onMode={onMode} designing={designing} />
      <span className="taskhead-left" ref={setTaskSlotLeft} />
      <span className="taskhead-sp" />
      {mode !== 'files' && mode !== 'git' && (
        <>
          <button className="btn sm" onClick={() => ui.viewTask(taskId)} title="Ver el detalle de la tarea: descripción, subtareas, notas y sesiones">
            <G n="search" size={13} /> Ver tarea
          </button>
          <button className="btn sm" onClick={() => ui.openTerminal(taskId)} title="Terminal en la carpeta del proyecto (Ctrl+`)">
            <G n="terminal" size={13} /> Terminal
          </button>
        </>
      )}
      <span className="taskhead-slot" ref={setTaskSlot} />
    </div>
  )
}
