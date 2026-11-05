import { useState } from 'react'
import type { ReactNode } from 'react'
import type { FolderAccess, FolderGroup } from '../../../shared/types'
import { useDB } from '../store'
import { baseName } from '../utils'
import { useUi } from '../ui'
import { EmptyState } from './EmptyState'
import { Select } from './Select'

const newId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

function GroupCard({ group, isNew, onDone }: { group: FolderGroup; isNew?: boolean; onDone?: () => void }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const [draft, setDraft] = useState<FolderGroup>(group)
  const dirty = JSON.stringify(draft) !== JSON.stringify(group)
  const users = db.tasks.filter((t) => t.groupIds?.includes(group.id)).length

  const addFolder = async (): Promise<void> => {
    const p = await ui.run('folder:pick')
    if (!p) return
    if (draft.folders.some((f) => f.path.toLowerCase() === p.toLowerCase())) return ui.toast('Esa carpeta ya está en el grupo', true)
    setDraft((d) => ({ ...d, folders: [...d.folders, { path: p, access: 'write' }] }))
  }

  const save = async (): Promise<void> => {
    if (!draft.name.trim()) return ui.toast('Ponle un nombre al grupo', true)
    if (!draft.folders.length) return ui.toast('Añade al menos una carpeta', true)
    await ui.run('group:save', draft)
    ui.toast('Grupo guardado')
    onDone?.()
  }

  const del = async (): Promise<void> => {
    if (!(await ui.confirm(`Se eliminará el grupo «${group.name}».${users ? ` Lo usan ${users} tarea(s); perderán ese acceso.` : ''}`, { title: "Eliminar grupo", confirmLabel: "Eliminar", danger: true }))) return
    await ui.run('group:delete', group.id)
  }

  return (
    <div className="group-card">
      <div className="group-h">
        <input value={draft.name} placeholder="Nombre del grupo (p. ej. Proyecto cliente X)" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        {!isNew && <span className="chip">{users} {users === 1 ? 'tarea' : 'tareas'}</span>}
      </div>
      {draft.folders.length === 0 && <div className="meta">Sin carpetas todavía.</div>}
      {draft.folders.map((f, i) => (
        <div key={f.path} className="gfolder">
          <span title={f.path} className="grow">
            📁 <b>{baseName(f.path)}</b> <span className="meta">{f.path}</span>
          </span>
          <Select
            value={f.access}
            title="Con «Solo lectura», Claude puede leer pero no editar ni crear archivos en esa carpeta"
            onChange={(v) => setDraft((d) => ({ ...d, folders: d.folders.map((x, j) => (j === i ? { ...x, access: v as FolderAccess } : x)) }))}
            options={[
              { value: 'write', label: 'Leer y modificar' },
              { value: 'read', label: 'Solo lectura' }
            ]}
          />
          <button className="icon" title="Quitar" onClick={() => setDraft((d) => ({ ...d, folders: d.folders.filter((_, j) => j !== i) }))}>
            ✕
          </button>
        </div>
      ))}
      <div className="foot">
        <button className="btn sm" onClick={addFolder}>
          + Añadir carpeta
        </button>
        <span className="sp" />
        {!isNew && (
          <button className="btn sm danger" onClick={del}>
            Eliminar
          </button>
        )}
        {isNew && (
          <button className="btn sm" onClick={onDone}>
            Cancelar
          </button>
        )}
        <button className="btn sm primary" disabled={!isNew && !dirty} onClick={save}>
          Guardar
        </button>
      </div>
    </div>
  )
}

export function Groups(): ReactNode {
  const db = useDB()
  const [adding, setAdding] = useState<FolderGroup | null>(null)

  return (
    <>
      <h1>Carpetas</h1>
      <div className="sub">
        Grupos de carpetas a las que Claude puede acceder además de la carpeta de la tarea (por ejemplo, el frontend y el backend de un mismo proyecto). Asigna los
        grupos desde el editor de cada tarea.
      </div>
      <div className="toolbar">
        <button className="btn primary" disabled={!!adding} onClick={() => setAdding({ id: newId(), name: '', folders: [] })}>
          + Nuevo grupo
        </button>
      </div>
      {adding && <GroupCard key={adding.id} group={adding} isNew onDone={() => setAdding(null)} />}
      {db.groups.map((g) => (
        <GroupCard key={g.id} group={g} />
      ))}
      {!db.groups.length && !adding && (
        <EmptyState kind="folders" title="Aún no hay grupos de carpetas" text="Agrupa, por ejemplo, el frontend y el backend de un proyecto y dáselos a Claude con permiso de lectura o de modificación." />
      )}
      <div className="meta" style={{ marginTop: 10 }}>
        «Leer y modificar» da acceso completo a esa carpeta. «Solo lectura» bloquea que Claude edite o cree archivos allí (los comandos de terminal no están
        habilitados en el chat, así que tampoco puede escribir por esa vía).
      </div>
    </>
  )
}
