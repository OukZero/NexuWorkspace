// Editores de Ajustes para perfiles de agente y tareas tipo (usan el mismo diseño que el de plantillas de prompts).
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { AgentProfile, ChatMode, Priority, TaskTemplate } from '../../../shared/types'
import { DEFAULT_PROFILES, DEFAULT_TASK_TEMPLATES } from '../../../shared/templates'

const newId = (p: string): string => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

interface Item {
  id: string
  name: string
  icon: string
}

function Shell<T extends Item>({
  value,
  onChange,
  blank,
  defaults,
  label,
  render
}: {
  value: T[]
  onChange: (v: T[]) => void
  blank: () => T
  defaults: T[]
  label: string
  render: (cur: T, patch: (p: Partial<T>) => void) => ReactNode
}): ReactNode {
  const [sel, setSel] = useState(value[0]?.id ?? '')
  const cur = value.find((t) => t.id === sel) ?? value[0]
  const patch = (p: Partial<T>): void => cur && onChange(value.map((t) => (t.id === cur.id ? { ...t, ...p } : t)))
  return (
    <div className="tpl-ed">
      <div className="tpl-list" role="listbox" aria-label={label}>
        {value.map((t) => (
          <button key={t.id} role="option" aria-selected={t.id === cur?.id} className={t.id === cur?.id ? 'on' : ''} onClick={() => setSel(t.id)}>
            {t.icon} {t.name || '(sin nombre)'}
          </button>
        ))}
        <div className="tpl-list-b">
          <button
            className="btn sm"
            onClick={() => {
              const t = blank()
              onChange([...value, t])
              setSel(t.id)
            }}
          >
            ＋ Nuevo
          </button>
          {cur && (
            <button
              className="btn sm"
              onClick={() => {
                const rest = value.filter((t) => t.id !== cur.id)
                onChange(rest)
                setSel(rest[0]?.id ?? '')
              }}
            >
              Eliminar
            </button>
          )}
          <button
            className="btn sm"
            title="Volver a los que trae la app (se pierden los cambios)"
            onClick={() => {
              onChange(defaults.map((t) => ({ ...t })))
              setSel(defaults[0]?.id ?? '')
            }}
          >
            Restaurar
          </button>
        </div>
      </div>
      <div className="tpl-form">
        {cur ? (
          <>
            <label>Nombre</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ width: 64, textAlign: 'center' }} value={cur.icon} maxLength={4} onChange={(e) => patch({ icon: e.target.value } as Partial<T>)} aria-label="Icono" />
              <input value={cur.name} onChange={(e) => patch({ name: e.target.value } as Partial<T>)} />
            </div>
            {render(cur, patch)}
          </>
        ) : (
          <div className="meta">No hay elementos. Crea uno con «＋ Nuevo» o restaura los predeterminados.</div>
        )}
      </div>
    </div>
  )
}

/** Perfiles de agente: modo, modelo, solo lectura e instrucciones. */
export function ProfilesEditor({ value, onChange }: { value: AgentProfile[]; onChange: (v: AgentProfile[]) => void }): ReactNode {
  return (
    <Shell<AgentProfile>
      value={value}
      onChange={onChange}
      defaults={DEFAULT_PROFILES}
      label="Perfiles"
      blank={() => ({ id: newId('p'), name: 'Nuevo perfil', icon: '🤖', mode: 'ask', model: '', readOnly: false, instructions: '' })}
      render={(cur, patch) => (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }}>
            <select style={{ width: 'auto' }} value={cur.mode} onChange={(e) => patch({ mode: e.target.value as ChatMode })}>
              <option value="ask">🔐 Ask: pregunta antes de actuar</option>
              <option value="agent">⚡ Agent: actúa sin preguntar</option>
            </select>
            <input style={{ width: 160 }} placeholder="Modelo (vacío = predeterminado)" value={cur.model} onChange={(e) => patch({ model: e.target.value.trim() })} />
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={cur.readOnly} onChange={(e) => patch({ readOnly: e.target.checked })} />
              Solo lectura (no edita archivos)
            </label>
          </div>
          <label>Instrucciones para la IA</label>
          <textarea style={{ minHeight: 120 }} value={cur.instructions} onChange={(e) => patch({ instructions: e.target.value })} />
          <div className="meta">El modelo se aplica a Claude (con Copilot solo si lo dejas vacío). Se elige en el chat, junto al selector de modo.</div>
        </>
      )}
    />
  )
}

/** Tareas tipo: título, descripción, prioridad, estimación, etiquetas y subtareas. */
export function TaskTemplatesEditor({ value, onChange }: { value: TaskTemplate[]; onChange: (v: TaskTemplate[]) => void }): ReactNode {
  return (
    <Shell<TaskTemplate>
      value={value}
      onChange={onChange}
      defaults={DEFAULT_TASK_TEMPLATES}
      label="Tareas tipo"
      blank={() => ({ id: newId('tt'), name: 'Nueva tarea tipo', icon: '📌', titlePrefix: '', description: '', priority: 'med', estimateMin: 0, tags: [], subtasks: [] })}
      render={(cur, patch) => (
        <>
          <label>Inicio del título</label>
          <input value={cur.titlePrefix} placeholder="Ej.: Bug: " onChange={(e) => patch({ titlePrefix: e.target.value })} />
          <label>Descripción base</label>
          <textarea style={{ minHeight: 90 }} value={cur.description} onChange={(e) => patch({ description: e.target.value })} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '8px 0' }}>
            <select style={{ width: 'auto' }} value={cur.priority} onChange={(e) => patch({ priority: e.target.value as Priority })}>
              <option value="high">Prioridad alta</option>
              <option value="med">Prioridad media</option>
              <option value="low">Prioridad baja</option>
            </select>
            <input style={{ width: 150 }} type="number" min={0} step={15} value={cur.estimateMin} title="Estimación en minutos" onChange={(e) => patch({ estimateMin: Math.max(0, Number(e.target.value) || 0) })} />
            <input style={{ width: 200 }} placeholder="Etiquetas (coma)" value={cur.tags.join(', ')} onChange={(e) => patch({ tags: e.target.value.split(',').map((t) => t.trimStart()) })} />
          </div>
          <label>Subtareas (una por línea)</label>
          <textarea style={{ minHeight: 110 }} value={cur.subtasks.join('\n')} onChange={(e) => patch({ subtasks: e.target.value.split('\n') })} />
        </>
      )}
    />
  )
}
