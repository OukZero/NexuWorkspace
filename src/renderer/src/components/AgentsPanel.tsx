import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { TeamAgent } from '../../../shared/types'
import { Robot } from './TeamView'

/** Panel flotante con los agentes del equipo: elegir uno dirige el siguiente mensaje del chat a él. */
export function AgentsPanel({ value, onPick, onClose }: { value: string; onPick: (a: TeamAgent | null) => void; onClose: () => void }): ReactNode {
  const [agents, setAgents] = useState<TeamAgent[] | null>(null)
  useEffect(() => {
    let live = true
    void window.api.call('team:get').then((t) => live && setAgents(t.agents))
    return () => { live = false }
  }, [])
  useEffect(() => {
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <aside className="ag-panel" role="dialog" aria-label="Agentes disponibles">
      <div className="ag-h"><b>Agentes</b><button className="ib" aria-label="Cerrar" onClick={onClose}>✕</button></div>
      <p className="ag-note">Elige uno y tu siguiente mensaje irá a él. Responde dentro de esta conversación (solo lectura).</p>
      {!agents ? <p className="ag-note">Cargando…</p> : agents.map((a) => (
        <button key={a.id} className={`ag-item ${a.id === value ? 'on' : ''}`} disabled={!!a.canEdit} style={{ ['--c' as string]: a.color }} title={a.canEdit ? 'Edita código: úsalo desde la pestaña Equipo' : a.prompt.slice(0, 160)} onClick={() => onPick(a.id === value ? null : a)}>
          <span className="ag-bot"><Robot a={a} state="idle" size={44} /></span>
          <span><b>{a.emoji} {a.name}</b><small>{a.canEdit ? 'edita código · solo en Equipo' : a.model}</small></span>
        </button>
      ))}
    </aside>
  )
}
