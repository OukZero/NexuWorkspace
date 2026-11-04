import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Priority, RecurrenceType, Status, Subtask, Task, UndoPayload } from '../../../shared/types'
import { useDB } from '../store'
import { DOW, PRIO, STATUS, baseName } from '../utils'
import { useUi } from '../ui'

const REC: Array<[RecurrenceType, string]> = [
  ['none', 'No se repite'],
  ['daily', 'Todos los días'],
  ['weekdays', 'Lunes a viernes'],
  ['weekly', 'Días de la semana…']
]

export function TaskModal({ task: t }: { task: Partial<Task> }): ReactNode {
  const ui = useUi()
  const db = useDB()
  const isNew = !t.id
  const [groupIds, setGroupIds] = useState<string[]>(t.groupIds ?? [])
  const [title, setTitle] = useState(t.title ?? '')
  const [description, setDescription] = useState(t.description ?? '')
  const [workDone, setWorkDone] = useState(t.workDone ?? '')
  const [client, setClient] = useState(t.client ?? '')
  const [project, setProject] = useState(t.project ?? '')
  const [folder, setFolder] = useState(t.folder ?? '')
  const [priority, setPriority] = useState<Priority>(t.priority ?? 'med')
  const [status, setStatus] = useState<Status>(t.status ?? 'today')
  const [est, setEst] = useState(t.estimateMin ? String(t.estimateMin / 60) : '')
  const [recType, setRecType] = useState<RecurrenceType>(t.recurrence?.type ?? 'none')
  const [days, setDays] = useState<number[]>(t.recurrence?.days ?? [])
  const [notes, setNotes] = useState(t.notes ?? '')
  const [tags, setTags] = useState((t.tags ?? []).join(', '))
  const [subtasks, setSubtasks] = useState<Subtask[]>(t.subtasks ?? [])
  const [newSub, setNewSub] = useState('')

  const addSub = (): void => {
    const text = newSub.trim()
    if (!text) return
    setSubtasks((s) => [...s, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text, done: false }])
    setNewSub('')
  }

  const pick = async (): Promise<void> => {
    const p = await ui.run('folder:pick')
    if (!p) return
    setFolder(p)
    if (!project) setProject(baseName(p))
  }

  const save = async (): Promise<void> => {
    if (!title.trim()) return ui.toast('Pon un título', true)
    const hours = parseFloat(est)
    await ui.run('task:save', {
      id: t.id,
      title: title.trim(),
      description,
      client: client.trim(),
      project: project.trim(),
      folder: folder.trim(),
      priority,
      status,
      estimateMin: isNaN(hours) ? 0 : Math.round(hours * 60),
      recurrence: { type: recType, days },
      groupIds,
      notes,
      tags: [...new Set(tags.split(/[,\s]+/).map((x) => x.replace(/^#/, '').trim()).filter(Boolean))],
      subtasks: newSub.trim() ? [...subtasks, { id: Date.now().toString(36), text: newSub.trim(), done: false }] : subtasks,
      ...(isNew && !t.workDone ? {} : { workDone })
    })
    ui.closeModal()
  }

  const del = async (): Promise<void> => {
    if (!t.id || !confirm('¿Eliminar tarea y sus registros de tiempo?')) return
    // se guarda todo lo que se borra con la tarea, para poder deshacer
    const task = db.tasks.find((x) => x.id === t.id)
    const payload: UndoPayload = {
      tasks: task ? [task] : [],
      entries: db.entries.filter((e) => e.taskId === t.id),
      chats: Object.fromEntries(Object.entries(db.chats).filter(([, c]) => c.taskId === t.id))
    }
    await ui.run('task:delete', t.id)
    ui.closeModal()
    ui.toast('Tarea eliminada', false, { label: 'Deshacer', run: () => void ui.run('undo:restore', payload) })
  }

  return (
    <div className="dialog">
      <h2>{isNew ? 'Nueva tarea' : 'Editar tarea'}</h2>
      <label>Título</label>
      <input value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
      <label>Descripción / contexto para Claude</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      <label>
        Subtareas {subtasks.length > 0 && `(${subtasks.filter((s) => s.done).length}/${subtasks.length})`} · las pendientes se le pasan a Claude en el prompt
      </label>
      <div className="subtasks">
        {subtasks.map((s) => (
          <div key={s.id} className={`sub-item ${s.done ? 'done' : ''}`}>
            <input type="checkbox" checked={s.done} aria-label={`Completar: ${s.text}`} onChange={(e) => setSubtasks((l) => l.map((x) => (x.id === s.id ? { ...x, done: e.target.checked } : x)))} />
            <input
              className="sub-text"
              value={s.text}
              aria-label="Texto de la subtarea"
              onChange={(e) => setSubtasks((l) => l.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x)))}
            />
            <button className="icon" title="Quitar subtarea" aria-label="Quitar subtarea" onClick={() => setSubtasks((l) => l.filter((x) => x.id !== s.id))}>
              ✕
            </button>
          </div>
        ))}
        <input
          value={newSub}
          placeholder="Añadir subtarea… (Enter)"
          aria-label="Nueva subtarea"
          onChange={(e) => setNewSub(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addSub()
            }
          }}
        />
      </div>
      <label>Notas</label>
      <textarea style={{ minHeight: 70 }} value={notes} placeholder="Apuntes rápidos, enlaces, decisiones…" onChange={(e) => setNotes(e.target.value)} />
      <label>Etiquetas (separadas por coma)</label>
      <input value={tags} placeholder="urgente, bug, cliente-x" onChange={(e) => setTags(e.target.value)} />
      {(!isNew || t.workDone) && (
        <>
          <label>Lo realizado (resumen del trabajo hecho)</label>
          <textarea
            style={{ minHeight: 120 }}
            value={workDone}
            placeholder="Se completa con el botón «Resumir en la tarea» del chat. También puedes editarlo a mano."
            onChange={(e) => setWorkDone(e.target.value)}
          />
        </>
      )}
      <div className="grid2">
        <div>
          <label>Cliente</label>
          <input value={client} onChange={(e) => setClient(e.target.value)} />
        </div>
        <div>
          <label>Proyecto</label>
          <input value={project} onChange={(e) => setProject(e.target.value)} />
        </div>
      </div>
      <label>Carpeta del proyecto</label>
      <div className="folder">
        <input value={folder} placeholder="C:\proyectos\mi-app" onChange={(e) => setFolder(e.target.value)} />
        <button className="btn" onClick={pick}>
          Elegir…
        </button>
      </div>
      <label>Grupos de carpetas con acceso para Claude</label>
      {db.groups.length ? (
        <div className="days" style={{ flexWrap: 'wrap' }}>
          {db.groups.map((g) => (
            <label key={g.id} title={g.folders.map((f) => `${f.access === 'read' ? '👁' : '✎'} ${f.path}`).join('\n')}>
              <input
                type="checkbox"
                checked={groupIds.includes(g.id)}
                onChange={(e) => setGroupIds((p) => (e.target.checked ? [...p, g.id] : p.filter((x) => x !== g.id)))}
              />
              {g.name} <span className="chip">{g.folders.length}</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="meta">Aún no hay grupos. Créalos en la sección «Carpetas».</div>
      )}
      <div className="grid2">
        <div>
          <label>Prioridad</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {Object.entries(PRIO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Estado</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Estimación (horas)</label>
          <input type="number" step="0.25" value={est} onChange={(e) => setEst(e.target.value)} />
        </div>
        <div>
          <label>Repetir</label>
          <select value={recType} onChange={(e) => setRecType(e.target.value as RecurrenceType)}>
            {REC.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      {recType === 'weekly' && (
        <div className="days" style={{ marginTop: 8 }}>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={days.includes(d)}
                onChange={(e) => setDays((p) => (e.target.checked ? [...p, d] : p.filter((x) => x !== d)))}
              />
              {DOW[d]}
            </label>
          ))}
        </div>
      )}
      {(t.log ?? []).length > 0 && (
        <>
          <label>Historial de lo hecho (resúmenes de Claude)</label>
          {[...(t.log ?? [])].reverse().map((l, i) => (
            <div key={i} className="commit" style={{ marginBottom: 6 }}>
              {new Date(l.ts).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {l.text}
            </div>
          ))}
        </>
      )}
      <div className="foot">
        {!isNew && (
          <button className="btn danger" onClick={del}>
            Eliminar
          </button>
        )}
        <span className="sp" />
        <button className="btn" onClick={ui.closeModal}>
          Cancelar
        </button>
        <button className="btn primary" onClick={save}>
          Guardar
        </button>
      </div>
    </div>
  )
}
