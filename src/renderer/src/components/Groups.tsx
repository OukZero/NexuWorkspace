import { useState } from 'react'
import type { ReactNode } from 'react'
import type { FolderAccess, FolderGroup } from '../../../shared/types'
import { useDB } from '../store'
import { baseName } from '../utils'
import { useUi } from '../ui'
import { EmptyState } from './EmptyState'
import { G } from './glyphs'

const newId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const ACCESS: Array<[FolderAccess, string]> = [
  ['write', 'Leer y modificar'],
  ['read', 'Solo lectura']
]

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
    if (!(await ui.confirm(`Se eliminará el grupo «${group.name}».${users ? ` Lo usan ${users} tarea(s); perderán ese acceso.` : ''}`, { title: 'Eliminar grupo', confirmLabel: 'Eliminar', danger: true }))) return
    await ui.run('group:delete', group.id)
  }

  return (
    <section className="bc grp">
      <div className="card-h grp-h">
        <input className="grp-name" value={draft.name} placeholder="Nombre del grupo (p. ej. Proyecto cliente X)" aria-label="Nombre del grupo" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        {!isNew && (
          <span className="chip">
            {users} {users === 1 ? 'tarea' : 'tareas'}
          </span>
        )}
      </div>
      {draft.folders.length === 0 && <div className="meta">Sin carpetas todavía.</div>}
      <div className="grp-list">
        {draft.folders.map((f, i) => (
          <div key={f.path} className="folder-row">
            <span className="fr-ic" aria-hidden>
              <G n="folders" size={18} />
            </span>
            <div className="fr-t" title={f.path}>
              <b>{baseName(f.path)}</b>
              <div className="fr-p">{f.path}</div>
            </div>
            <div className="acc" role="radiogroup" aria-label={`Permiso de ${baseName(f.path)}`} title="Con «Solo lectura», Claude puede leer pero no editar ni crear archivos en esa carpeta">
              {ACCESS.map(([value, label]) => (
                <label key={value} className={f.access === value ? 'on' : ''}>
                  <input
                    type="radio"
                    name={`acc-${group.id}-${i}`}
                    checked={f.access === value}
                    onChange={() => setDraft((d) => ({ ...d, folders: d.folders.map((x, j) => (j === i ? { ...x, access: value } : x)) }))}
                  />
                  {label}
                </label>
              ))}
            </div>
            <button className="fr-x" title="Quitar carpeta" aria-label={`Quitar la carpeta ${baseName(f.path)}`} onClick={() => setDraft((d) => ({ ...d, folders: d.folders.filter((_, j) => j !== i) }))}>
              <G n="x" size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="grp-foot">
        <button className="btn sm" onClick={addFolder}>
          <G n="plus" size={13} /> Añadir carpeta
        </button>
        <div className="grp-btns">
          {!isNew && (
            <button className="btn sm danger" onClick={del}>
              Eliminar grupo
            </button>
          )}
          {isNew && (
            <button className="btn sm" onClick={onDone}>
              Cancelar
            </button>
          )}
          <button className="btn sm p" disabled={!isNew && !dirty} onClick={save}>
            Guardar
          </button>
        </div>
      </div>
    </section>
  )
}

export function Groups(): ReactNode {
  const db = useDB()
  const [adding, setAdding] = useState<FolderGroup | null>(null)

  return (
    <div className="grp-page">
      <div className="card-h grp-top">
        <p className="muted">
          Agrupa las carpetas que Claude puede leer además de la carpeta de la tarea: por ejemplo, el frontend y el backend de un mismo proyecto. Los grupos se asignan desde el editor de cada tarea.
        </p>
        <button className="btn p" disabled={!!adding} onClick={() => setAdding({ id: newId(), name: '', folders: [] })}>
          <G n="plus" size={15} /> Nuevo grupo
        </button>
      </div>
      {adding && <GroupCard key={adding.id} group={adding} isNew onDone={() => setAdding(null)} />}
      {db.groups.map((g) => (
        <GroupCard key={g.id} group={g} />
      ))}
      {!db.groups.length && !adding && (
        <EmptyState kind="folders" title="Aún no hay grupos de carpetas" text="Agrupa, por ejemplo, el frontend y el backend de un proyecto y dáselos a Claude con permiso de lectura o de modificación." />
      )}
      <div className="modes">
        <div className="mode">
          <b>
            <span className="ok">
              <G n="eye" size={15} />
            </span>
            Leer y modificar
          </b>
          <p>Acceso completo: Claude puede editar archivos y crear nuevos en esa carpeta.</p>
        </div>
        <div className="mode">
          <b>
            <span className="warn">
              <G n="lock" size={15} />
            </span>
            Solo lectura
          </b>
          <p>Claude puede consultar el código, pero no editar ni crear archivos. Los comandos de terminal no están habilitados en el chat.</p>
        </div>
      </div>
    </div>
  )
}
