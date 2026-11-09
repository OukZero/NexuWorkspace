import type { ReactNode } from 'react'
import type { LaunchItem, LaunchKind } from '../../../shared/types'
import { useUi } from '../ui'
import { G } from './glyphs'
import { Select } from './Select'

export const LAUNCH_KIND: Record<LaunchKind, string> = { folder: 'Carpeta', file: 'Archivo', url: 'Enlace web', app: 'Programa', vscode: 'VS Code', terminal: 'Terminal' }
const HINT: Record<LaunchKind, string> = {
  folder: 'C:\\proyectos\\mi-app  ·  {folder} = carpeta de la tarea',
  file: 'C:\\docs\\requisitos.pdf',
  url: 'https://…',
  app: 'C:\\Users\\tú\\AppData\\Local\\Postman\\Postman.exe',
  vscode: '{folder}',
  terminal: ''
}
const newId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

/** Editor del entorno de una tarea: lista de cosas que se abren de un clic. */
export function LaunchEditor({ items, onChange }: { items: LaunchItem[]; onChange: (items: LaunchItem[]) => void }): ReactNode {
  const ui = useUi()
  const add = (kind: LaunchKind, target = ''): void => onChange([...items, { id: newId(), kind, target }])
  const patch = (id: string, p: Partial<LaunchItem>): void => onChange(items.map((i) => (i.id === id ? { ...i, ...p } : i)))
  const pick = async (i: LaunchItem): Promise<void> => {
    const p = i.kind === 'folder' ? await ui.run('folder:pick') : await ui.run('file:pick', i.kind === 'app' ? 'app' : 'file')
    if (p) patch(i.id, { target: p })
  }
  return (
    <div className="lc-ed">
      {items.map((i) => (
        <div key={i.id} className="lc-row">
          <Select className="lc-kind" ariaLabel="Qué abrir" value={i.kind} onChange={(v) => patch(i.id, { kind: v as LaunchKind })} options={(Object.keys(LAUNCH_KIND) as LaunchKind[]).map((k) => ({ value: k, label: LAUNCH_KIND[k] }))} />
          <input className="lc-label" value={i.label ?? ''} placeholder="Nombre (opcional)" aria-label="Nombre" maxLength={40} onChange={(e) => patch(i.id, { label: e.target.value })} />
          {i.kind !== 'terminal' && <input className="lc-target" value={i.target} placeholder={HINT[i.kind]} aria-label="Ruta o enlace" onChange={(e) => patch(i.id, { target: e.target.value })} />}
          {i.kind === 'app' && <input className="lc-args" value={i.args ?? ''} placeholder="Argumentos (opcional)" aria-label="Argumentos" onChange={(e) => patch(i.id, { args: e.target.value })} />}
          {(i.kind === 'folder' || i.kind === 'file' || i.kind === 'app') && (
            <button className="btn sm" onClick={() => void pick(i)}>
              Elegir…
            </button>
          )}
          <button className="ib" title="Quitar" aria-label="Quitar este elemento" onClick={() => onChange(items.filter((x) => x.id !== i.id))}>
            <G n="x" size={14} />
          </button>
        </div>
      ))}
      <div className="lc-add">
        <button className="btn sm" onClick={() => add('folder', '{folder}')}>
          + Carpeta del proyecto
        </button>
        <button className="btn sm" onClick={() => add('vscode', '{folder}')}>
          + VS Code
        </button>
        <button className="btn sm" onClick={() => add('terminal')}>
          + Terminal
        </button>
        <button className="btn sm" onClick={() => add('url')}>
          + Enlace web
        </button>
        <button className="btn sm" onClick={() => add('app')}>
          + Programa
        </button>
        <button className="btn sm" onClick={() => add('file')}>
          + Archivo
        </button>
      </div>
    </div>
  )
}
