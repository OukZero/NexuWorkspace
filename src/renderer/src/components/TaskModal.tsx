import { useState } from 'react'
import type { ReactNode } from 'react'
import type { LaunchItem, Priority, RecurrenceType, Status, Subtask, Task, UndoPayload } from '../../../shared/types'
import { taskTemplatesOf } from '../../../shared/templates'
import { useDB } from '../store'
import { DOW, PRIO, STATUS, baseName } from '../utils'
import { useUi } from '../ui'
import { LaunchEditor } from './LaunchEditor'
import { Select } from './Select'

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
  const [rmProject, setRmProject] = useState(t.rmProject ?? '')
  const [rmIssue, setRmIssue] = useState(t.rmIssue ?? '')
  const [launch, setLaunch] = useState<LaunchItem[]>(t.launch ?? [])
  const catalog = db.settings.redmineCatalog ?? {}
  // proyectos y tareas leídos de Redmine; las tareas se filtran por el proyecto elegido. Se suman los valores ya usados en otras tareas.
  const rmOptions = (k: 'rmProject' | 'rmIssue'): Array<{ value: string; label: string }> => {
    const used = db.tasks.filter((x) => k === 'rmProject' || !rmProject || x.rmProject === rmProject).map((x) => x[k]?.trim())
    const fromRedmine = k === 'rmProject' ? Object.keys(catalog) : (catalog[rmProject]?.issues.map((i) => i.label) ?? [])
    return [...new Set([...fromRedmine, ...used].filter((x): x is string => !!x))].sort().map((v) => ({ value: v, label: v }))
  }
  const loadCatalog = async (): Promise<void> => {
    ui.toast('Leyendo proyectos y tareas de Redmine… puede tardar un poco')
    const r = await ui.run('redmine:catalog')
    if (r) ui.toast(`Cargados ${r.projects} proyectos y ${r.issues} tareas abiertas${r.closed ? ` (${r.closed} cerradas quitadas)` : ''}${r.openFilter ? ' (solo abiertas, verificado con Redmine)' : '. No hay un filtro de abiertas que Redmine pueda verificar: pueden venir cerradas'}`, !r.openFilter)
    if (r?.dump) ui.toast(`Respuestas de Redmine guardadas en: ${r.dump}`)
  }

  // tarea tipo: rellena lo que aún está vacío y suma sus subtareas
  const applyTemplate = (id: string): void => {
    const tt = taskTemplatesOf(db.settings).find((x) => x.id === id)
    if (!tt) return
    setTitle((v) => (v.trim() ? v : tt.titlePrefix))
    setDescription((v) => (v.trim() ? v : tt.description))
    setPriority(tt.priority)
    if (tt.estimateMin) setEst(String(tt.estimateMin / 60))
    setTags((v) => [...new Set([...v.split(/[,\s]+/).filter(Boolean), ...tt.tags])].join(', '))
    setSubtasks((cur) => [
      ...cur,
      ...tt.subtasks
        .map((x) => x.trim())
        .filter((x) => x && !cur.some((c) => c.text === x))
        .map((text) => ({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, done: false }))
    ])
  }

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
      rmProject: rmProject.trim(),
      rmIssue: rmIssue.trim(),
      priority,
      status,
      estimateMin: isNaN(hours) ? 0 : Math.round(hours * 60),
      recurrence: { type: recType, days },
      groupIds,
      launch: launch.filter((i) => i.kind === 'terminal' || i.target.trim()).map((i) => ({ ...i, target: i.target.trim(), label: i.label?.trim() || undefined, args: i.args?.trim() || undefined })),
      notes,
      tags: [...new Set(tags.split(/[,\s]+/).map((x) => x.replace(/^#/, '').trim()).filter(Boolean))],
      subtasks: newSub.trim() ? [...subtasks, { id: Date.now().toString(36), text: newSub.trim(), done: false }] : subtasks,
      ...(isNew && !t.workDone ? {} : { workDone })
    })
    ui.closeModal()
  }

  const del = async (): Promise<void> => {
    if (!t.id || !(await ui.confirm('Se eliminará la tarea junto con sus registros de tiempo. Podrás deshacerlo unos segundos.', { title: 'Eliminar tarea', confirmLabel: 'Eliminar', danger: true }))) return
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
      {isNew && taskTemplatesOf(db.settings).length > 0 && (
        <div className="tt-pick" role="group" aria-label="Tarea tipo">
          <span className="meta">Tipo:</span>
          {taskTemplatesOf(db.settings).map((tt) => (
            <button key={tt.id} type="button" className="btn sm" title={`Rellena título, prioridad, estimación y ${tt.subtasks.length} subtareas`} onClick={() => applyTemplate(tt.id)}>
              {tt.icon} {tt.name}
            </button>
          ))}
        </div>
      )}
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
      <label>
        Redmine · dónde se imputan las horas de esta tarea{' '}
        <button className="btn sm" type="button" title="Abre Redmine con tu sesión y lee todos los proyectos y sus tareas" onClick={() => void loadCatalog()}>
          ↻ Cargar proyectos y tareas
        </button>
      </label>
      <div className="grid2">
        <Select
          ariaLabel="Proyecto de Redmine"
          value={rmProject}
          onChange={(v) => {
            setRmProject(v)
            // la tarea elegida debe ser del proyecto: si no lo es, se limpia
            const known = catalog[v]?.issues.some((i) => i.label === rmIssue)
            if (catalog[v] && !known) setRmIssue('')
          }}
          creatable
          options={[{ value: '', label: '— Proyecto de Redmine —' }, ...rmOptions('rmProject')]}
        />
        <Select
          ariaLabel="Tarea de Redmine"
          value={rmIssue}
          onChange={setRmIssue}
          creatable
          options={[{ value: '', label: '— Tarea de Redmine (#123 - nombre) —' }, ...rmOptions('rmIssue')]}
        />
      </div>
      <label>Carpeta del proyecto</label>
      <div className="folder">
        <input value={folder} placeholder="C:\proyectos\mi-app" onChange={(e) => setFolder(e.target.value)} />
        <button className="btn" onClick={pick}>
          Elegir…
        </button>
      </div>
      <label>Entorno de la tarea · se abre de un clic con el botón «Lanzar» (carpeta, navegador, Postman, base de datos…)</label>
      <LaunchEditor items={launch} onChange={setLaunch} />
      <label>Grupos de carpetas con acceso para Claude{!folder.trim() && ' · sin carpeta propia, se trabaja en la primera carpeta con permiso de escritura del grupo'}</label>
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
          <Select value={priority} onChange={(v) => setPriority(v as Priority)} options={Object.entries(PRIO).map(([k, v]) => ({ value: k, label: v }))} />
        </div>
        <div>
          <label>Estado</label>
          <Select value={status} onChange={(v) => setStatus(v as Status)} options={Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v }))} />
        </div>
        <div>
          <label>Estimación (horas)</label>
          <input type="number" step="0.25" value={est} onChange={(e) => setEst(e.target.value)} />
        </div>
        <div>
          <label>Repetir</label>
          <Select value={recType} onChange={(v) => setRecType(v as RecurrenceType)} options={REC.map(([k, v]) => ({ value: k, label: v }))} />
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
