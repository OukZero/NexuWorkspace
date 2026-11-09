import type { MouseEvent, ReactNode } from 'react'
import type { Task } from '../../../shared/types'
import { useUi, type Ui } from '../ui'
import { G } from './glyphs'

/** Lanza el entorno de la tarea (o un solo elemento) y avisa de lo que no se pudo abrir. */
export async function runLaunch(ui: Ui, taskId: string, itemId?: string): Promise<void> {
  const errors = await ui.run('launch:run', taskId, itemId)
  if (!errors) return
  if (errors.length) ui.toast(`No se pudo abrir: ${errors.slice(0, 3).join(' · ')}${errors.length > 3 ? ` (+${errors.length - 3})` : ''}`, true)
  else ui.toast(itemId ? 'Abierto' : 'Entorno lanzado')
}

/** Botón «Lanzar entorno»: solo aparece si la tarea tiene elementos configurados. */
export function LaunchButton({ task }: { task: Task }): ReactNode {
  const ui = useUi()
  const n = task.launch?.length ?? 0
  if (!n) return null
  return (
    <button
      className="ib"
      title={`Lanzar el entorno de la tarea (${n} ${n === 1 ? 'elemento' : 'elementos'})`}
      aria-label="Lanzar el entorno de la tarea"
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        void runLaunch(ui, task.id)
      }}
    >
      <G n="popout" size={16} />
    </button>
  )
}
