import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent, ReactNode } from 'react'
import type { AgentTeam, TeamAgent, TeamCharacter, TeamProp } from '../../../shared/types'
import { useUi } from '../ui'
import { ASSETS, ASSET_BY_KEY, EMOJI_TO_ASSET } from './teamAssets'

const SKINS = ['#f2c9a5', '#c68e6a', '#8a5a3c', '#5fe3b4']
const COLORS = ['#8fa4ff', '#5fe3b4', '#ffb868', '#ff7a9c']
const HAIR: Array<[TeamCharacter['hair'], string]> = [['corto', 'Pelo corto'], ['rizado', 'Rizado'], ['gorro', 'Gorro']]
const GEAR: Array<[TeamCharacter['gear'], string]> = [['lentes', 'Lentes'], ['audifonos', 'Audífonos'], ['barba', 'Barba']]
const OUTFIT: Array<[TeamCharacter['outfit'], string]> = [['sudadera', 'Sudadera'], ['camisa', 'Camisa'], ['bata', 'Bata']]
const SKILLS = ['review', 'seguridad', 'cubicación', 'leer-repo', 'tests', 'git', 'web']
const MODELS: TeamAgent['model'][] = ['haiku', 'sonnet', 'opus']
const OUTFIT_COLOR: Record<TeamCharacter['outfit'], [string, string]> = { sudadera: ['#5b73f0', '#3a4fc4'], camisa: ['#d6dbea', '#aab2c8'], bata: ['#f4f6fc', '#c9cfe0'] }
const HAIR_COLOR = '#2b2f4a'
const clamp = (n: number, a: number, b: number): number => Math.min(b, Math.max(a, n))

/** Avatar en capas (SVG). Las clases av-* las anima el CSS: respiración, parpadeo y tecleo. */
function Avatar({ c, size = 150, live }: { c: TeamCharacter; size?: number; live?: 'idle' | 'work' }): ReactNode {
  const [o1, o2] = OUTFIT_COLOR[c.outfit]
  const shade = 'rgba(0,0,0,.14)'
  return (
    <svg className={`av ${live ? `av-${live}` : ''}`} width={size} height={size * 1.13} viewBox="0 0 150 170" role="img" aria-label={`Personaje ${c.name}`}>
      <defs>
        <linearGradient id="avO" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={o1} /><stop offset="1" stopColor={o2} /></linearGradient>
        <radialGradient id="avF" cx=".4" cy=".3" r=".85"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset="1" stopColor="#000" stopOpacity=".12" /></radialGradient>
      </defs>
      <ellipse cx="75" cy="166" rx="46" ry="5" fill="#000" opacity=".28" />
      {c.hair === 'rizado' && <g fill={HAIR_COLOR}>{[34, 48, 62, 76, 90, 104, 116].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 40 : 46} r="15" />)}<rect x="34" y="46" width="82" height="34" rx="14" /></g>}
      <g className="av-body">
        {/* hombros y brazos */}
        <path d="M18 168 q2 -50 34 -58 h46 q32 8 34 58z" fill="url(#avO)" />
        <path className="av-arm l" d="M24 168 q-2 -34 12 -50 l14 6 q-12 18 -8 44z" fill={o2} />
        <path className="av-arm r" d="M126 168 q2 -34 -12 -50 l-14 6 q12 18 8 44z" fill={o2} />
        {c.outfit === 'sudadera' && <><path d="M54 110 q21 22 42 0 l-4 -6 q-17 14 -34 0z" fill={shade} /><path d="M68 124 v18 M82 124 v18" stroke="#e8ebf4" strokeWidth="2.5" strokeLinecap="round" /></>}
        {c.outfit === 'camisa' && <><path d="M75 112 v54" stroke="#8a92aa" strokeWidth="2" /><path d="M60 106 l15 18 l15 -18 l-6 -4 l-9 10 l-9 -10z" fill="#fff" /><path d="M75 124 l-5 8 l5 24 l5 -24z" fill="#ff7a9c" /></>}
        {c.outfit === 'bata' && <><path d="M75 112 v54" stroke="#9aa1b4" strokeWidth="2" /><path d="M58 106 l17 24 l17 -24 l-8 -4 l-9 12 l-9 -12z" fill="#fff" stroke="#c9cfe0" /><rect x="94" y="136" width="16" height="14" rx="2" fill="none" stroke="#b6bdd0" /><path d="M98 136 v-6 M104 136 v-8" stroke="#5fe3b4" strokeWidth="2" strokeLinecap="round" /></>}
        {/* cuello y cabeza */}
        <rect x="64" y="90" width="22" height="24" rx="8" fill={c.skin} /><rect x="64" y="90" width="22" height="24" rx="8" fill={shade} />
        <circle cx="36" cy="68" r="8" fill={c.skin} /><circle cx="114" cy="68" r="8" fill={c.skin} />
        <ellipse cx="75" cy="64" rx="38" ry="40" fill={c.skin} />
        <ellipse cx="75" cy="64" rx="38" ry="40" fill="url(#avF)" />
        {c.gear === 'barba' && <path d="M40 70 q35 56 70 0 q-6 26 -35 28 q-29 -2 -35 -28z" fill={HAIR_COLOR} />}
        {c.hair === 'corto' && <><path d="M34 62 q-2 -46 41 -46 q43 0 41 46 q-8 -22 -26 -24 q-14 8 -30 4 q-16 -2 -26 20z" fill={HAIR_COLOR} /><path d="M52 24 q14 -6 28 -2" stroke="#fff" strokeOpacity=".22" strokeWidth="3" fill="none" strokeLinecap="round" /></>}
        {c.hair === 'rizado' && <g fill={HAIR_COLOR}>{[44, 60, 76, 92, 106].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 26 : 30} r="14" />)}</g>}
        {c.hair === 'gorro' && <><path d="M33 58 q2 -46 42 -46 q40 0 42 46z" fill="#5fe3b4" /><rect x="31" y="52" width="88" height="12" rx="6" fill="#2fbf8a" /><circle cx="75" cy="8" r="7" fill="#e8ebf4" /></>}
        {/* cara */}
        <path d="M52 52 q8 -5 16 -1 M82 51 q8 -4 16 1" stroke={HAIR_COLOR} strokeWidth="3" strokeLinecap="round" fill="none" />
        <g className="av-eyes">
          <ellipse cx="60" cy="66" rx="5" ry="6" fill="#fff" /><ellipse cx="90" cy="66" rx="5" ry="6" fill="#fff" />
          <circle cx="61" cy="67" r="3.2" fill="#1a1c28" /><circle cx="91" cy="67" r="3.2" fill="#1a1c28" />
          <circle cx="62.2" cy="65.6" r="1.1" fill="#fff" /><circle cx="92.2" cy="65.6" r="1.1" fill="#fff" />
        </g>
        <circle cx="50" cy="80" r="6" fill="#ff7a9c" opacity=".22" /><circle cx="100" cy="80" r="6" fill="#ff7a9c" opacity=".22" />
        <path className="av-mouth" d="M66 84 q9 8 18 0" fill="none" stroke="#1a1c28" strokeWidth="2.6" strokeLinecap="round" />
        {c.gear === 'lentes' && <g fill="rgba(143,164,255,.22)" stroke="#16182a" strokeWidth="3"><rect x="46" y="55" width="26" height="22" rx="7" /><rect x="78" y="55" width="26" height="22" rx="7" /><path d="M72 64 h6" /></g>}
        {c.gear === 'audifonos' && <g fill="none" stroke="#e8ebf4" strokeWidth="5" strokeLinecap="round"><path d="M37 68 q0 -48 38 -48 q38 0 38 48" /><rect x="30" y="62" width="11" height="22" rx="5" fill="#8fa4ff" stroke="none" /><rect x="109" y="62" width="11" height="22" rx="5" fill="#8fa4ff" stroke="none" /></g>}
      </g>
    </svg>
  )
}

/** Robot de un agente: cabeza con pantalla, antena que late y emoji en el pecho. */
function Robot({ a, state }: { a: TeamAgent; state: 'idle' | 'work' | 'done' }): ReactNode {
  return (
    <svg className={`bot bot-${state}`} width="86" height="96" viewBox="0 0 86 96" style={{ ['--c' as string]: a.color }}>
      <ellipse cx="43" cy="92" rx="30" ry="4" fill="#000" opacity=".25" />
      <g className="bot-body">
        <line x1="43" y1="6" x2="43" y2="18" stroke="#8a92aa" strokeWidth="3" /><circle className="bot-ant" cx="43" cy="6" r="5" fill={a.color} />
        <rect x="10" y="40" width="66" height="46" rx="14" fill="#2b3150" /><rect x="10" y="40" width="66" height="46" rx="14" fill={a.color} opacity=".18" />
        <rect x="14" y="16" width="58" height="46" rx="16" fill={a.color} /><rect x="14" y="16" width="58" height="46" rx="16" fill="url(#avF)" />
        <rect x="21" y="25" width="44" height="28" rx="10" fill="#0e1020" />
        <g className="bot-eyes" fill={a.color}><rect x="29" y="33" width="9" height="12" rx="4" /><rect x="48" y="33" width="9" height="12" rx="4" /></g>
        <rect x="4" y="30" width="8" height="18" rx="4" fill="#8a92aa" /><rect x="74" y="30" width="8" height="18" rx="4" fill="#8a92aa" />
        <text x="43" y="76" textAnchor="middle" fontSize="17">{a.emoji}</text>
      </g>
    </svg>
  )
}

/** Sala: escritorios con agentes, tu personaje y objetos que arrastras donde quieras (se guardan al soltar). */
function Room({ team, working, done, sel, onSel, onProps, onDrop }: {
  team: AgentTeam; working?: string; done?: string; sel: string
  onSel: (id: string) => void; onProps: (p: TeamProp[]) => void; onDrop: () => void
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<string | null>(null)
  const props = team.props ?? []
  const n = Math.max(team.agents.length, 1)
  const move = (e: RPointerEvent): void => {
    if (!drag.current || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = clamp(((e.clientX - r.left) / r.width) * 100, 3, 97)
    const y = clamp(((e.clientY - r.top) / r.height) * 100, 6, 98)
    onProps(props.map((p) => (p.id === drag.current ? { ...p, x, y } : p)))
  }
  const end = (): void => {
    if (!drag.current) return
    drag.current = null
    onDrop()
  }
  return (
    <div className="tr-room" ref={ref} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerDown={(e) => { if (e.target === e.currentTarget) onSel('') }}>
      <div className="tr-wall"><div className="tr-win"><i className="tr-moon" /><i className="tr-star s1" /><i className="tr-star s2" /><i className="tr-star s3" /></div></div>
      <div className="tr-floor" /><div className="tr-rug" />
      {team.agents.map((a, i) => {
        const st = a.id === working ? 'work' : a.id === done ? 'done' : 'idle'
        return (
          <div key={a.id} className={`tr-desk ${st}`} style={{ left: `${((i + 0.5) / (n + 1)) * 88 + 4}%`, ['--c' as string]: a.color }}>
            {st !== 'idle' && <div className="tr-bubble">{st === 'work' ? <><i /><i /><i /></> : '✓ listo'}</div>}
            <Robot a={a} state={st} />
            <div className="tr-top"><div className="tr-lap"><span /><span /><span /></div></div>
            <div className="tr-legs"><i /><i /></div>
            <small className="tr-tag">{a.name}</small>
          </div>
        )
      })}
      <div className={`tr-me ${working ? 'work' : ''}`} style={{ left: '90%' }}>
        <Avatar c={team.character} size={92} live={working ? 'work' : 'idle'} />
        <small className="tr-tag">{team.character.name}</small>
      </div>
      {props.map((p) => {
        const as = ASSET_BY_KEY[p.k]
        if (!as) return null
        return (
          <div
            key={p.id}
            className={`tr-prop ${as.wall ? 'wall' : ''} ${sel === p.id ? 'on' : ''}`}
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: as.w * p.s, zIndex: as.wall ? 1 : 10 + Math.round(p.y), ['--fx' as string]: p.flip ? -1 : 1 }}
            title="Arrástralo o usa las flechas (Mayús = más rápido)"
            tabIndex={0}
            role="button"
            aria-label={`${as.label}: flechas para mover, Supr para quitar`}
            onFocus={() => onSel(p.id)}
            onKeyDown={(e) => {
              const k = e.key
              if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); onProps(props.filter((q) => q.id !== p.id)); onDrop(); return }
              const d = e.shiftKey ? 5 : 1
              const dx = k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0
              const dy = k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0
              if (!dx && !dy) return
              e.preventDefault()
              onProps(props.map((q) => (q.id === p.id ? { ...q, x: clamp(q.x + dx, 3, 97), y: clamp(q.y + dy, 6, 98) } : q)))
              onDrop()
            }}
            onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = p.id; onSel(p.id) }}
          >
            {as.el}
          </div>
        )
      })}
    </div>
  )
}

/** Si el equipo viene de la versión con emojis, los convierte en objetos colocados en el suelo/pared. */
function withProps(t: AgentTeam): AgentTeam {
  if (t.props) return t
  const props: TeamProp[] = t.decor.map((e, i) => ({ id: `m${i}`, k: EMOJI_TO_ASSET[e] ?? 'plant', x: 12 + i * 14, y: 90, s: 1 })).filter((p) => ASSET_BY_KEY[p.k])
  return { ...t, props }
}

export function TeamView(): ReactNode {
  const ui = useUi()
  const [team, setTeam] = useState<AgentTeam | null>(null)
  const [sel, setSel] = useState<string>('')
  const [selProp, setSelProp] = useState('')
  const [msg, setMsg] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const teamRef = useRef<AgentTeam | null>(null)
  teamRef.current = team

  useEffect(() => {
    void window.api.call('team:get').then((t) => {
      setTeam(withProps(t))
      setSel(t.agents[0]?.id ?? '')
    })
  }, [])
  useEffect(() => {
    if (!done) return
    const id = setTimeout(() => setDone(''), 4000)
    return () => clearTimeout(id)
  }, [done])

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
  const props = team.props ?? []
  const addProp = (k: string): void => {
    const as = ASSET_BY_KEY[k]
    const p: TeamProp = { id: Math.random().toString(36).slice(2, 9), k, x: 20 + Math.random() * 60, y: as.wall ? 24 : 82 + Math.random() * 12, s: 1 }
    update({ ...team, props: [...props, p] })
    setSelProp(p.id)
  }
  const patchProp = (p: Partial<TeamProp>): void => update({ ...team, props: props.map((x) => (x.id === selProp ? { ...x, ...p } : x)) })
  const curProp = props.find((p) => p.id === selProp)
  const random = (): void => {
    const pick = <T,>(l: T[]): T => l[Math.floor(Math.random() * l.length)]
    setChar({ skin: pick(SKINS), hair: pick(HAIR)[0], gear: pick(GEAR)[0], outfit: pick(OUTFIT)[0] })
  }
  const ask = async (): Promise<void> => {
    if (!agent) return
    const id = agent.id
    setBusy(true)
    setReply('')
    try {
      const r = await ui.run('team:ask', id, msg)
      if (typeof r === 'string') {
        setReply(r)
        setDone(id)
      }
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
        <div className="tm-stage"><Avatar c={team.character} size={170} live="idle" /></div>
        <input className="tm-name" value={team.character.name} onChange={(e) => setChar({ name: e.target.value })} aria-label="Nombre del personaje" />
        <input className="tm-name sub" value={team.character.role} onChange={(e) => setChar({ role: e.target.value })} aria-label="Rol del personaje" />
        <div className="tm-sw">{SKINS.map((s) => <i key={s} style={{ background: s }} className={team.character.skin === s ? 'on' : ''} onClick={() => setChar({ skin: s })} />)}</div>
        {opts(HAIR, team.character.hair, (hair) => setChar({ hair }))}
        {opts(GEAR, team.character.gear, (gear) => setChar({ gear }))}
        {opts(OUTFIT, team.character.outfit, (outfit) => setChar({ outfit }))}
        <button className="btn" onClick={random}>Aleatorio</button>
      </section>

      <section className="card tm-mid">
        <div className="eyebrow">La sala <span className="tm-hint">arrastra los objetos donde quieras</span></div>
        <Room
          team={team}
          working={busy ? sel : undefined}
          done={done}
          sel={selProp}
          onSel={setSelProp}
          onProps={(p) => setTeam({ ...team, props: p })}
          onDrop={() => teamRef.current && void ui.run('team:save', teamRef.current)}
        />
        <div className="tr-pal">
          {ASSETS.map((a) => <button key={a.k} onClick={() => addProp(a.k)} title={`Añadir: ${a.label}`}><span className="pv">{a.el}</span><small>{a.label}</small></button>)}
        </div>
        <div className={`tr-tools ${curProp ? 'on' : ''}`}>
          <span>{curProp ? `Objeto: ${ASSET_BY_KEY[curProp.k]?.label}` : 'Selecciona un objeto de la sala para ajustarlo'}</span>
          <button disabled={!curProp} onClick={() => patchProp({ s: clamp((curProp?.s ?? 1) + 0.15, 0.6, 2.2) })}>＋ Grande</button>
          <button disabled={!curProp} onClick={() => patchProp({ s: clamp((curProp?.s ?? 1) - 0.15, 0.6, 2.2) })}>－ Pequeño</button>
          <button disabled={!curProp} onClick={() => patchProp({ flip: !curProp?.flip })}>⇋ Voltear</button>
          <button disabled={!curProp} onClick={() => { update({ ...team, props: props.filter((p) => p.id !== selProp) }); setSelProp('') }}>Quitar</button>
        </div>
        <div className="eyebrow" style={{ marginTop: 16 }}>Agentes</div>
        <div className="tm-agents">
          {team.agents.map((a) => (
            <button key={a.id} className={`tm-agent ${a.id === sel ? 'on' : ''}`} style={{ ['--c' as string]: a.color }} onClick={() => { setSel(a.id); setReply('') }}>
              <span className="ic">{a.emoji}</span>
              <span><b>{a.name}</b><span className="sk">{a.skills.map((s) => <span key={s}>{s}</span>)}</span></span>
              <span className="st">{a.model}</span>
            </button>
          ))}
        </div>
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
