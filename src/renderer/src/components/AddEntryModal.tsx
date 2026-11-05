import { useState } from 'react'
import type { ReactNode } from 'react'
import { useDB } from '../store'
import { isWorkTask, toTs } from '../utils'
import { useUi } from '../ui'
import { Select } from './Select'

/** Entrada de tiempo manual (reemplaza al prompt() del navegador, que Electron no soporta). */
export function AddEntryModal({ day }: { day: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const tasks = db.tasks.filter(isWorkTask)
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? '')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('10:00')

  const save = async (): Promise<void> => {
    if (!taskId) return ui.toast('Crea una tarea primero', true)
    if (!start || !end || toTs(day, end) <= toTs(day, start)) return ui.toast('La hora fin debe ser mayor al inicio', true)
    await ui.run('entry:add', { taskId, start: toTs(day, start), end: toTs(day, end) })
    ui.closeModal()
  }

  return (
    <div className="dialog">
      <h2>Entrada manual</h2>
      <div className="sub">Día {day}</div>
      <label>Tarea</label>
      <Select value={taskId} onChange={setTaskId} options={tasks.map((t) => ({ value: t.id, label: t.title }))} />
      <div className="grid2">
        <div>
          <label>Inicio</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label>Fin</label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="foot">
        <span className="sp" />
        <button className="btn" onClick={ui.closeModal}>
          Cancelar
        </button>
        <button className="btn primary" onClick={save}>
          Añadir
        </button>
      </div>
    </div>
  )
}
