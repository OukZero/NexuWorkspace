import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { TeamAgent, TeamCharacter } from '../../../shared/types'
import { playSfx } from '../sounds'
import { currentSeason } from '../seasons'
import { activeEntry, useDB } from '../store'
import { CHAR_STYLES, update, useAppearance } from '../theme'
import type { CharStyle } from '../theme'
import { useUi } from '../ui'
import { useTyping } from '../typing'
import type { AgentTeam } from '../../../shared/types'
import { Avatar, CharacterEditor, Robot } from './TeamView'

const QUIPS = [
  '¿Un vaso de agua? 💧',
  'Recuerda guardar tus horas antes de cerrar el día.',
  'Respira hondo: vas bien. 🌿',
  'Una tarea a la vez, y sale todo.',
  'Estoy aquí si necesitas al equipo. 🤝',
  '¿Y si commiteas lo que llevas?',
  'Estirar el cuello un minuto no le hace mal a nadie.'
]
const hello = (): string => {
  const h = new Date().getHours()
  return h < 6 ? 'Trasnochando, ¿eh? 🌙' : h < 12 ? '¡Buenos días! ☀️' : h < 20 ? '¡Buenas tardes! 👋' : '¡Buenas noches! 🌙'
}

/** Selector del personaje acompañante para Apariencia. */
export function CompanionAgentSelect({ value, onChange }: { value: string; onChange: (id: string) => void }): ReactNode {
  const [agents, setAgents] = useState<TeamAgent[]>([])
  const [me, setMe] = useState<TeamCharacter | null>(null)
  useEffect(() => {
    void window.api.call('team:get').then((t) => { setAgents(t.agents); setMe(t.character ?? null) }).catch(() => undefined)
  }, [])
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">El primero del equipo</option>
      {me && <option value="@yo">🙂 Mi personaje ({me.name})</option>}
      {agents.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
    </select>
  )
}

const STYLE_LABEL: Record<CharStyle, string> = { clasico: 'Clásico', chibi: 'Chibi', plano: 'Plano', pixel: 'Píxel', kawaii: 'Kawaii' }

/** Elige el estilo de dibujo de personajes y robots, con una vista previa de cada uno usando tu propio personaje. */
export function CharStylePicker(): ReactNode {
  const A = useAppearance()
  const [team, setTeam] = useState<AgentTeam | null>(null)
  useEffect(() => {
    void window.api.call('team:get').then(setTeam).catch(() => undefined)
  }, [])
  if (!team) return <div className="meta">Cargando…</div>
  const bot = team.agents[0]
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {CHAR_STYLES.map((s) => (
        <button key={s} type="button" className={`btn ${A.charStyle === s ? 'primary' : ''}`} aria-pressed={A.charStyle === s} onClick={() => update({ charStyle: s })}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 10px' }}>
          <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
            <Avatar c={team.character} size={52} style={s} />
            {bot && <Robot a={bot} state="idle" size={44} style={s} />}
          </span>
          <span>{STYLE_LABEL[s]}</span>
        </button>
      ))}
    </div>
  )
}

/** El mismo editor del Equipo, dentro de Apariencia: carga el equipo, cambia solo el personaje y guarda al instante. */
export function MyCharacterEditor(): ReactNode {
  const [team, setTeam] = useState<AgentTeam | null>(null)
  useEffect(() => {
    void window.api.call('team:get').then(setTeam).catch(() => undefined)
  }, [])
  if (!team) return <div className="meta">Cargando…</div>
  const change = (p: Partial<TeamCharacter>): void => {
    const next = { ...team, character: { ...team.character, ...p } }
    setTeam(next)
    void window.api.call('team:save', next).catch(() => undefined)
  }
  return <div className="tm-char tm-char-inline"><CharacterEditor char={team.character} onChange={change} /></div>
}

/** Personaje del equipo siempre visible en una esquina: reacciona al timer y a las tareas, mira al cursor y suelta frases breves (todas locales, sin llamar a la IA). */
export function Companion(): ReactNode {
  const A = useAppearance()
  const db = useDB()
  const ui = useUi()
  const [agents, setAgents] = useState<TeamAgent[]>([])
  const [me, setMe] = useState<TeamCharacter | null>(null)
  const typing = useTyping()
  const [bubble, setBubble] = useState<string | null>(null)
  const [hop, setHop] = useState(false)
  const [cheer, setCheer] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const timer = useRef<number>(0)
  const season = A.seasons || A.seasonForce ? currentSeason(new Date(), A.seasonForce) : null
  const entry = activeEntry(db)
  const entryStart = entry?.start ?? 0

  useEffect(() => {
    let live = true
    void window.api.call('team:get').then((t) => { if (live) { setAgents(t.agents); setMe(t.character ?? null) } }).catch(() => undefined)
    return () => { live = false }
  }, [])

  const say = useCallback((msg: string, ms = 7000) => {
    setBubble(msg)
    playSfx('blip')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setBubble(null), ms)
  }, [])
  const jump = useCallback(() => {
    setHop(false)
    requestAnimationFrame(() => setHop(true))
    window.setTimeout(() => setHop(false), 900)
  }, [])

  // saludo al abrir y frases ocasionales (cada 1–2 min)
  useEffect(() => {
    if (!A.companion) return
    const first = window.setTimeout(() => say(season ? season.greet : hello()), 2500)
    let next = 0
    const loop = (): void => {
      next = window.setTimeout(() => {
        say(QUIPS[Math.floor(Math.random() * QUIPS.length)])
        jump()
        loop()
      }, 60000 + Math.random() * 60000)
    }
    loop()
    return () => { window.clearTimeout(first); window.clearTimeout(next) }
  }, [A.companion, season, say, jump])

  // aviso de descanso cada 90 min de timer continuo
  useEffect(() => {
    if (!A.companion || !entryStart) return
    let last = 0
    const id = window.setInterval(() => {
      const blocks = Math.floor((Date.now() - entryStart) / 5400000)
      if (blocks > last) { last = blocks; say(`Llevas ${blocks * 90} min seguidos. ¿Una pausa? ☕`, 10000); jump() }
    }, 30000)
    return () => window.clearInterval(id)
  }, [A.companion, entryStart, say, jump])

  // alegría al completar una tarea
  useEffect(() => {
    const f = (): void => { setCheer(true); say('¡Tarea lista! 🎉', 4500); window.setTimeout(() => setCheer(false), 2600) }
    window.addEventListener('shutoki:celebrate', f)
    return () => window.removeEventListener('shutoki:celebrate', f)
  }, [say])

  // inclina al personaje hacia el cursor
  useEffect(() => {
    if (!A.companion || !A.motion) return
    let raf = 0
    const mv = (e: PointerEvent): void => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const el = box.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth
        el.style.setProperty('--tilt', `${Math.max(-6, Math.min(6, dx * 14))}deg`)
        el.style.setProperty('--lean', `${Math.max(-4, Math.min(4, dx * 10))}px`)
      })
    }
    window.addEventListener('pointermove', mv, { passive: true })
    return () => { window.removeEventListener('pointermove', mv); cancelAnimationFrame(raf) }
  }, [A.companion, A.motion])

  // arrastre con el mouse: un movimiento corto cuenta como clic (saludo); uno largo mueve y recuerda la posición
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const moved = useRef(false)
  const clamp = (x: number, y: number): { x: number; y: number } => {
    const r = box.current?.getBoundingClientRect()
    const w = r?.width ?? 80, h = r?.height ?? 80
    return { x: Math.max(0, Math.min(window.innerWidth - w, x)), y: Math.max(0, Math.min(window.innerHeight - h, y)) }
  }
  const onDown = (e: React.PointerEvent): void => {
    if (e.button !== 0 || !box.current) return
    const r = box.current.getBoundingClientRect()
    const ox = e.clientX - r.left, oy = e.clientY - r.top
    const sx = e.clientX, sy = e.clientY
    moved.current = false
    let last = { x: r.left, y: r.top }
    const mv = (ev: PointerEvent): void => {
      if (!moved.current && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return
      moved.current = true
      last = clamp(ev.clientX - ox, ev.clientY - oy)
      setDrag(last)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
      if (moved.current) { update({ companionPos: last }); setDrag(null) }
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
  }
  // si la ventana se achica, que no quede fuera de vista
  const placed = drag ?? (A.companionPos ? clamp(A.companionPos.x, A.companionPos.y) : null)

  const useMe = A.companionAgent === '@yo' && !!me
  if (!A.companion || (!agents.length && !useMe)) return null
  const base = agents.find((x) => x.id === A.companionAgent) ?? agents[0]
  // con un evento vigente se pone su accesorio (gorro, sombrero…) sin tocar al agente guardado
  const a: TeamAgent | undefined = base && season?.hat ? { ...base, look: { ...(base.look ?? {}), acc: season.hat } } : base
  const name = useMe ? me!.name : (a?.name ?? '')
  const state = cheer ? 'done' : entry ? 'work' : 'idle'

  return (
    <div ref={box} className={`companion ${placed ? 'placed' : A.companionCorner} ${hop ? 'hop' : ''} ${drag ? 'dragging' : ''}`}
      style={placed ? { left: placed.x, top: placed.y, right: 'auto', bottom: 'auto' } : undefined} onPointerDown={onDown} onDoubleClick={() => update({ companionPos: null })}>
      <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
        <defs><radialGradient id="avF" cx=".4" cy=".3" r=".85"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset="1" stopColor="#000" stopOpacity=".12" /></radialGradient></defs>
      </svg>
      {bubble && (
        <div className="cmp-bubble" role="status">
          {bubble}
          <button className="cmp-link" onClick={() => ui.go('team')}>Equipo</button>
        </div>
      )}
      <button className="cmp-char" title={`${name} · clic para saludar · arrástralo · doble clic para volver a la esquina`} aria-label={`Acompañante ${name}`} onClick={() => { if (moved.current) { moved.current = false; return } say(QUIPS[Math.floor(Math.random() * QUIPS.length)]); jump() }}>
        {useMe ? <Avatar c={me!} size={60} live={typing ? 'type' : state === 'work' ? 'work' : 'idle'} /> : <Robot a={a!} state={state} size={60} />}
      </button>
      <button className="cmp-x" title="Ocultar al acompañante (se reactiva en Apariencia)" aria-label="Ocultar al acompañante" onClick={() => update({ companion: false })}>×</button>
    </div>
  )
}
