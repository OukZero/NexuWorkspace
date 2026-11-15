// Ventana aparte con las skills oficiales de Anthropic: buscar, instalar y quitar.
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SkillInfo } from '../../../shared/types'

export function SkillsWindow(): ReactNode {
  const [skills, setSkills] = useState<SkillInfo[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const load = async (): Promise<void> => {
    setErr('')
    try {
      setSkills(await window.api.call('skills:list'))
    } catch (e) {
      setErr((e as Error).message)
      setSkills([])
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const act = async (s: SkillInfo, op: 'install' | 'remove'): Promise<void> => {
    setBusy(s.name)
    setNote('')
    try {
      setNote(await window.api.call(op === 'install' ? 'skills:install' : 'skills:remove', s.name))
      await load()
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(null)
  }

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = (skills ?? []).filter((s) => !t || s.name.toLowerCase().includes(t) || s.description.toLowerCase().includes(t))
    return list.sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended)) // recomendadas primero
  }, [skills, q])
  const pending = (skills ?? []).filter((s) => s.recommended && !s.installed).length

  const installRec = async (): Promise<void> => {
    setBusy('*')
    setNote('')
    try {
      setNote(await window.api.call('skills:installRecommended'))
      await load()
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(null)
  }

  return (
    <div className="skills-win">
      <header>
        <h1>Skills</h1>
        <p className="meta">
          Catálogo oficial de Anthropic (<code>anthropics/skills</code>). Se instalan en <code>~/.claude/skills</code>; Claude las usa solo cuando la tarea las necesita. Aplican a las conversaciones nuevas con Claude.
        </p>
        <div className="skills-bar">
          <input className="input" placeholder="Buscar skill…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {pending > 0 && (
            <button className="btn primary" onClick={() => void installRec()} disabled={busy !== null}>
              Instalar recomendadas ({pending})
            </button>
          )}
          <button className="btn" onClick={() => void load()} disabled={skills === null}>
            Actualizar
          </button>
          <button className="btn" onClick={() => void window.api.call('url:open', 'https://github.com/anthropics/skills')}>
            Ver en GitHub
          </button>
        </div>
        {note && <div className="skills-note">{note}</div>}
        {err && <div className="skills-err">{err}</div>}
      </header>
      <div className="skills-list">
        {skills === null && <div className="meta">Cargando catálogo…</div>}
        {skills && !shown.length && !err && <div className="meta">No hay skills que coincidan.</div>}
        {shown.map((s) => (
          <div key={s.name} className="skill-card">
            <div className="skill-main">
              <b>{s.name}</b> {s.installed && <span className="chip">instalada</span>} {s.custom && <span className="chip">propia</span>} {s.recommended && <span className="chip">recomendada</span>}
              <div className="meta">{s.description || 'Sin descripción'}</div>
            </div>
            {s.installed ? (
              <button className="btn sm danger" disabled={busy === s.name} onClick={() => void act(s, 'remove')}>
                Quitar
              </button>
            ) : (
              <button className="btn sm primary" disabled={busy === s.name} onClick={() => void act(s, 'install')}>
                {busy === s.name ? 'Instalando…' : 'Instalar'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
