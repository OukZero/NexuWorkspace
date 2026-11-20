import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AgentTeam, TeamAgent, TeamCharacter } from '../../../shared/types'
import { useUi } from '../ui'

const SKINS = ['#f2c9a5', '#c68e6a', '#8a5a3c', '#5fe3b4']
const COLORS = ['#8fa4ff', '#5fe3b4', '#ffb868', '#ff7a9c']
const HAIR: Array<[TeamCharacter['hair'], string]> = [['corto', 'Pelo corto'], ['rizado', 'Rizado'], ['gorro', 'Gorro']]
const GEAR: Array<[TeamCharacter['gear'], string]> = [['lentes', 'Lentes'], ['audifonos', 'Audífonos'], ['barba', 'Barba']]
const OUTFIT: Array<[TeamCharacter['outfit'], string]> = [['sudadera', 'Sudadera'], ['camisa', 'Camisa'], ['bata', 'Bata']]
const DECOR = ['🪴', '🐈', '🏆', '🖼️', '🎮', '☕', '🕹️', '🛋️', '📚']
const SKILLS = ['review', 'seguridad', 'cubicación', 'leer-repo', 'tests', 'git', 'web']
const MODELS: TeamAgent['model'][] = ['haiku', 'sonnet', 'opus']
const OUTFIT_COLOR: Record<TeamCharacter['outfit'], string> = { sudadera: '#4a63d6', camisa: '#c9cfe0', bata: '#eef1f8' }
const HAIR_COLOR = '#2b2f4a'

/** Avatar en capas (SVG): cada rasgo es una pieza, así el personaje se recompone al cambiar una opción. */
function Avatar({ c, size = 150 }: { c: TeamCharacter; size?: number }): ReactNode {
  return (
    <svg width={size} height={size * 1.13} viewBox="0 0 150 170" role="img" aria-label={`Personaje ${c.name}`}>
      <rect x="30" y="100" width="90" height="70" rx="36" fill={OUTFIT_COLOR[c.outfit]} />
      {c.outfit === 'sudadera' && <path d="M62 100 q13 16 26 0" fill="none" stroke="#0a0b10" strokeOpacity=".35" strokeWidth="3" />}
      {c.outfit === 'camisa' && <path d="M75 104 v62 M62 100 l13 14 l13 -14" fill="none" stroke="#5d6478" strokeWidth="2" />}
      {c.outfit === 'bata' && <path d="M75 104 v62" stroke="#9aa1b4" strokeWidth="2" />}
      <circle cx="75" cy="62" r="38" fill={c.skin} />
      {c.gear === 'barba' && <path d="M45 70 q30 46 60 0 q-6 22 -30 24 q-24 -2 -30 -24z" fill={HAIR_COLOR} />}
      {c.hair === 'corto' && <path d="M35 58 q4 -40 40 -40 q36 0 40 40 q-20 -18 -40 -16 q-20 -2 -40 16z" fill={HAIR_COLOR} />}
      {c.hair === 'rizado' && [38, 54, 70, 86, 102, 116].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 26 : 32} r="15" fill={HAIR_COLOR} />)}
      {c.hair === 'gorro' && <><path d="M34 56 q4 -42 41 -42 q37 0 41 42z" fill="#5fe3b4" /><rect x="32" y="52" width="86" height="10" rx="5" fill="#2fbf8a" /></>}
      <ellipse cx="60" cy="64" rx="3.5" ry="4.5" fill="#1a1c28" />
      <ellipse cx="90" cy="64" rx="3.5" ry="4.5" fill="#1a1c28" />
      <path d="M66 82 q9 7 18 0" fill="none" stroke="#1a1c28" strokeWidth="2.5" strokeLinecap="round" />
      {c.gear === 'lentes' && <g fill="rgba(95,227,180,.25)" stroke="#111" strokeWidth="3"><rect x="47" y="54" width="24" height="20" rx="6" /><rect x="79" y="54" width="24" height="20" rx="6" /><path d="M71 62 h8" /></g>}
      {c.gear === 'audifonos' && <g fill="none" stroke="#e8ebf4" strokeWidth="5" strokeLinecap="round"><path d="M38 66 q0 -44 37 -44 q37 0 37 44" /><rect x="32" y="62" width="10" height="20" rx="4" fill="#8fa4ff" stroke="none" /><rect x="108" y="62" width="10" height="20" rx="4" fill="#8fa4ff" stroke="none" /></g>}
    </svg>
  )
}

/** Sala: escritorios con un agente cada uno, mascotas y adornos colocados. Los hitos reales desbloquearán más adornos. */
function Room({ team }: { team: AgentTeam }): ReactNode {
  const n = Math.max(team.agents.length, 1)
  return (
    <div className="tm-room">
      <div className="tm-win" />
      <div className="tm-lamp" />
      <div className="tm-shelf">{team.decor.slice(0, 5).map((d, i) => <span key={i}>{d}</span>)}</div>
      {team.agents.map((a, i) => (
        <div key={a.id} className="tm-desk" style={{ left: `${((i + 0.5) / (n + 1)) * 100}%`, ['--c' as string]: a.color }}>
          <div className="tm-mon" />
          <div className="tm-bot"><b>{a.emoji}</b><small>{a.name}</small></div>
        </div>
      ))}
      <div className="tm-me" style={{ left: `${(n / (n + 1)) * 100 + 4}%` }}>
        <Avatar c={team.character} size={54} />
      </div>
      <div className="tm-floor">{team.decor.slice(5).map((d, i) => <span key={i}>{d}</span>)}</div>
    </div>
  )
}

export function TeamView(): ReactNode {
  const ui = useUi()
  const [team, setTeam] = useState<AgentTeam | null>(null)
  const [sel, setSel] = useState<string>('')
  const [msg, setMsg] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.call('team:get').then((t) => {
      setTeam(t)
      setSel(t.agents[0]?.id ?? '')
    })
  }, [])

  if (!team) return <div className="tm-wrap">Cargando…</div>

  // cualquier cambio se guarda al instante: no hay botón «Guardar» que olvidar
  const update = (next: AgentTeam): void => {
    setTeam(next)
    void ui.run('team:save', next)
  }
  const setChar = (p: Partial<TeamCharacter>): void => update({ ...team, character: { ...team.character, ...p } })
  const agent = team.agents.find((a) => a.id === sel)
  const setAgent = (p: Partial<TeamAgent>): void => update({ ...team, agents: team.agents.map((a) => (a.id === sel ? { ...a, ...p } : a)) })
  const addAgent = (): void => {
    const a: TeamAgent = { id: Math.random().toString(36).slice(2, 9), name: 'Nuevo agente', emoji: '🤖', color: COLORS[team.agents.length % COLORS.length], model: 'sonnet', prompt: '', skills: [] }
    update({ ...team, agents: [...team.agents, a] })
    setSel(a.id)
    setReply('')
  }
  const removeAgent = (): void => {
    const agents = team.agents.filter((a) => a.id !== sel)
    update({ ...team, agents })
    setSel(agents[0]?.id ?? '')
  }
  const toggleDecor = (d: string): void => update({ ...team, decor: team.decor.includes(d) ? team.decor.filter((x) => x !== d) : [...team.decor, d] })
  const random = (): void => {
    const pick = <T,>(l: T[]): T => l[Math.floor(Math.random() * l.length)]
    setChar({ skin: pick(SKINS), hair: pick(HAIR)[0], gear: pick(GEAR)[0], outfit: pick(OUTFIT)[0] })
  }
  const ask = async (): Promise<void> => {
    if (!agent) return
    setBusy(true)
    setReply('')
    try {
      const r = await ui.run('team:ask', agent.id, msg)
      if (typeof r === 'string') setReply(r)
    } finally {
      setBusy(false)
    }
  }

  const opts = <T extends string>(list: Array<[T, string]>, cur: T, on: (v: T) => void): ReactNode => (
    <div className="tm-opts">{list.map(([v, l]) => <button key={v} className={cur === v ? 'on' : ''} onClick={() => on(v)}>{l}</button>)}</div>
  )

  return (
    <div className="tm-wrap">
      <section className="card tm-char">
        <div className="eyebrow">Tu personaje</div>
        <Avatar c={team.character} />
        <input className="tm-name" value={team.character.name} onChange={(e) => setChar({ name: e.target.value })} aria-label="Nombre del personaje" />
        <input className="tm-name sub" value={team.character.role} onChange={(e) => setChar({ role: e.target.value })} aria-label="Rol del personaje" />
        <div className="tm-sw">{SKINS.map((s) => <i key={s} style={{ background: s }} className={team.character.skin === s ? 'on' : ''} onClick={() => setChar({ skin: s })} />)}</div>
        {opts(HAIR, team.character.hair, (hair) => setChar({ hair }))}
        {opts(GEAR, team.character.gear, (gear) => setChar({ gear }))}
        {opts(OUTFIT, team.character.outfit, (outfit) => setChar({ outfit }))}
        <button className="btn" onClick={random}>Aleatorio</button>
      </section>

      <section className="card tm-mid">
        <div className="eyebrow">La sala</div>
        <Room team={team} />
        <div className="tm-deco">{DECOR.map((d) => <button key={d} className={team.decor.includes(d) ? 'on' : ''} onClick={() => toggleDecor(d)} title="Poner o quitar de la sala">{d}</button>)}</div>
        <div className="eyebrow" style={{ marginTop: 18 }}>Agentes</div>
        {team.agents.map((a) => (
          <button key={a.id} className={`tm-agent ${a.id === sel ? 'on' : ''}`} style={{ ['--c' as string]: a.color }} onClick={() => { setSel(a.id); setReply('') }}>
            <span className="ic">{a.emoji}</span>
            <span><b>{a.name}</b><span className="sk">{a.skills.map((s) => <span key={s}>{s}</span>)}</span></span>
            <span className="st">{a.model}</span>
          </button>
        ))}
        <button className="btn primary" style={{ marginTop: 10 }} onClick={addAgent}>+ Nuevo agente</button>
      </section>

      <section className="card tm-edit">
        <div className="eyebrow">Editar agente</div>
        {agent ? (
          <>
            <label>Nombre y emoji</label>
            <div className="tm-row"><input value={agent.emoji} style={{ width: 56 }} onChange={(e) => setAgent({ emoji: e.target.value.slice(0, 2) })} /><input value={agent.name} onChange={(e) => setAgent({ name: e.target.value })} /></div>
            <label>Modelo</label>
            {opts(MODELS.map((m) => [m, m[0].toUpperCase() + m.slice(1)] as [TeamAgent['model'], string]), agent.model, (model) => setAgent({ model }))}
            <label>Instrucciones (prompt de sistema)</label>
            <textarea value={agent.prompt} onChange={(e) => setAgent({ prompt: e.target.value })} />
            <label>Skills asignadas</label>
            <div className="tm-opts">{SKILLS.map((s) => <button key={s} className={agent.skills.includes(s) ? 'on' : ''} onClick={() => setAgent({ skills: agent.skills.includes(s) ? agent.skills.filter((x) => x !== s) : [...agent.skills, s] })}>{s}</button>)}</div>
            <label>Color</label>
            <div className="tm-sw">{COLORS.map((c) => <i key={c} style={{ background: c }} className={agent.color === c ? 'on' : ''} onClick={() => setAgent({ color: c })} />)}</div>
            <label>Probar</label>
            <textarea value={msg} placeholder="Escribe un encargo para este agente…" onChange={(e) => setMsg(e.target.value)} style={{ minHeight: 64 }} />
            <div className="tm-row">
              <button className="btn primary" disabled={busy || !msg.trim()} onClick={() => void ask()}>{busy ? 'Pensando…' : 'Enviar'}</button>
              <button className="btn" onClick={removeAgent}>Eliminar</button>
            </div>
            {reply && <pre className="tm-reply">{reply}</pre>}
          </>
        ) : (
          <div className="tm-empty">Crea un agente para empezar.</div>
        )}
      </section>
    </div>
  )
}
