import { useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent, KeyboardEvent as RKeyEvent, PointerEvent as RPointerEvent, ReactNode } from 'react'
import { AttachmentList } from './Chat'
import { G } from './glyphs'
import { Markdown } from './Markdown'
import type { AgentTeam, Attachment, RobotLook, SkillInfo, TeamAgent, TeamCharacter, TeamChatMsg, TeamConv, TeamProp } from '../../../shared/types'
import { AGENT_TEMPLATES, ORCHESTRATOR_ID } from '../../../shared/teamTemplates'
import { useUi } from '../ui'
import { useDB } from '../store'
import { DEFAULT_ESTIMATE_TEMPLATES, ESTIMATE_LEVELS } from '../../../shared/estimateTemplates'
import { ASSETS, ASSET_BY_KEY, EMOJI_TO_ASSET } from './teamAssets'

type Opt<T> = Array<[T, string]>
const SKINS = ['#ffe0c7', '#f2c9a5', '#d9a47e', '#c68e6a', '#8a5a3c', '#5c3a26', '#5fe3b4', '#8fa4ff']
const COLORS = ['#8fa4ff', '#5fe3b4', '#ffb868', '#ff7a9c', '#c39bff', '#5ad1ff', '#ffd166', '#e8ebf4']
const HAIR_COLORS = ['#2b2f4a', '#141414', '#6b4226', '#b5652b', '#e8c46a', '#e8ebf4', '#ff7a9c', '#5fe3b4', '#8fa4ff']
const EYE_COLORS = ['#1a1c28', '#5a3a22', '#2f7bd8', '#2fbf8a', '#8a5ad8', '#c0392b']
const OUTFIT_COLORS = ['#5b73f0', '#ff7a9c', '#2fbf8a', '#ffb868', '#8a5ad8', '#2b3150', '#e8ebf4', '#c0392b']
const HAIR: Opt<TeamCharacter['hair']> = [['corto', 'Corto'], ['largo', 'Largo'], ['rizado', 'Rizado'], ['mono', 'Moño'], ['cresta', 'Cresta'], ['rapado', 'Rapado'], ['calvo', 'Calvo'], ['gorro', 'Gorro']]
const GEAR: Opt<TeamCharacter['gear']> = [['ninguno', 'Ninguno'], ['lentes', 'Lentes'], ['sol', 'Gafas de sol'], ['audifonos', 'Audífonos'], ['gorra', 'Gorra'], ['aretes', 'Aretes']]
const OUTFIT: Opt<TeamCharacter['outfit']> = [['sudadera', 'Sudadera'], ['polera', 'Polera'], ['camisa', 'Camisa'], ['chaqueta', 'Chaqueta'], ['traje', 'Traje'], ['bata', 'Bata']]
const MOUTH: Opt<NonNullable<TeamCharacter['mouth']>> = [['sonrisa', 'Sonrisa'], ['grande', 'Alegre'], ['neutral', 'Neutral'], ['sorpresa', 'Sorpresa']]
const FACE: Opt<NonNullable<TeamCharacter['face']>> = [['normal', 'Normal'], ['pecas', 'Pecas'], ['rubor', 'Rubor']]
const FACIAL: Opt<NonNullable<TeamCharacter['facial']>> = [['ninguno', 'Ninguno'], ['barba', 'Barba'], ['bigote', 'Bigote'], ['perilla', 'Perilla']]
const HEADS: Opt<NonNullable<RobotLook['head']>> = [['redonda', 'Redonda'], ['cuadrada', 'Cuadrada'], ['tv', 'Tele'], ['domo', 'Domo']]
const BOT_EYES: Opt<NonNullable<RobotLook['eyes']>> = [['pixel', 'Píxel'], ['redondos', 'Redondos'], ['visor', 'Visor'], ['felices', 'Felices']]
const ANTENNAS: Opt<NonNullable<RobotLook['antenna']>> = [['bola', 'Bola'], ['doble', 'Doble'], ['helice', 'Hélice'], ['ninguna', 'Sin antena']]
const BOT_ACC: Opt<NonNullable<RobotLook['acc']>> = [['ninguno', 'Ninguno'], ['gorro', 'Gorro'], ['sombrero', 'Sombrero'], ['corona', 'Corona'], ['audifonos', 'Audífonos'], ['lentes', 'Lentes']]
const MODELS: TeamAgent['model'][] = ['haiku', 'sonnet', 'opus']
// color base de cada prenda si el usuario no eligió uno propio
const OUTFIT_COLOR: Record<TeamCharacter['outfit'], string> = { sudadera: '#5b73f0', polera: '#ff7a9c', camisa: '#d6dbea', chaqueta: '#2fbf8a', traje: '#2b3150', bata: '#f4f6fc' }
const HAIR_COLOR = '#2b2f4a'
const clamp = (n: number, a: number, b: number): number => Math.min(b, Math.max(a, n))
const pick = <T,>(l: T[]): T => l[Math.floor(Math.random() * l.length)]
/** Oscurece un #rrggbb (para la sombra del degradado de la ropa). */
const darken = (hex: string, f = 0.72): string => {
  const n = parseInt(hex.slice(1), 16)
  if (Number.isNaN(n) || hex.length !== 7) return hex
  const ch = (s: number): string => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0')
  return `#${ch(16)}${ch(8)}${ch(0)}`
}

/** Avatar en capas (SVG). Las clases av-* las anima el CSS: respiración, parpadeo y tecleo. */
function Avatar({ c, size = 150, live }: { c: TeamCharacter; size?: number; live?: 'idle' | 'work' }): ReactNode {
  const o1 = c.outfitColor ?? OUTFIT_COLOR[c.outfit] ?? '#5b73f0'
  const o2 = darken(o1)
  const hc = c.hairColor ?? HAIR_COLOR
  const eye = c.eyeColor ?? '#1a1c28'
  const facial = c.facial ?? (c.gear === 'barba' ? 'barba' : 'ninguno')
  const mouth = c.mouth ?? 'sonrisa'
  const shade = 'rgba(0,0,0,.14)'
  const cap = <path d="M34 62 q-2 -46 41 -46 q43 0 41 46 q-8 -22 -26 -24 q-14 8 -30 4 q-16 -2 -26 20z" fill={hc} />
  return (
    <svg className={`av ${live ? `av-${live}` : ''}`} width={size} height={size * 1.13} viewBox="0 0 150 170" role="img" aria-label={`Personaje ${c.name}`}>
      <defs>
        <linearGradient id="avO" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={o1} /><stop offset="1" stopColor={o2} /></linearGradient>
        <radialGradient id="avF" cx=".4" cy=".3" r=".85"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset="1" stopColor="#000" stopOpacity=".12" /></radialGradient>
      </defs>
      <ellipse cx="75" cy="166" rx="46" ry="5" fill="#000" opacity=".28" />
      {/* pelo que cae por detrás del cuerpo */}
      {c.hair === 'rizado' && <g fill={hc}>{[34, 48, 62, 76, 90, 104, 116].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 40 : 46} r="15" />)}<rect x="34" y="46" width="82" height="34" rx="14" /></g>}
      {c.hair === 'largo' && <path d="M32 58 q-8 56 4 74 h78 q12 -18 4 -74z" fill={hc} />}
      <g className="av-body">
        {/* hombros y brazos */}
        <path d="M18 168 q2 -50 34 -58 h46 q32 8 34 58z" fill="url(#avO)" />
        <path className="av-arm l" d="M24 168 q-2 -34 12 -50 l14 6 q-12 18 -8 44z" fill={o2} />
        <path className="av-arm r" d="M126 168 q2 -34 -12 -50 l-14 6 q12 18 8 44z" fill={o2} />
        {c.outfit === 'sudadera' && <><path d="M54 110 q21 22 42 0 l-4 -6 q-17 14 -34 0z" fill={shade} /><path d="M68 124 v18 M82 124 v18" stroke="#e8ebf4" strokeWidth="2.5" strokeLinecap="round" /></>}
        {c.outfit === 'camisa' && <><path d="M75 112 v54" stroke="#8a92aa" strokeWidth="2" /><path d="M60 106 l15 18 l15 -18 l-6 -4 l-9 10 l-9 -10z" fill="#fff" /><path d="M75 124 l-5 8 l5 24 l5 -24z" fill="#ff7a9c" /></>}
        {c.outfit === 'bata' && <><path d="M75 112 v54" stroke="#9aa1b4" strokeWidth="2" /><path d="M58 106 l17 24 l17 -24 l-8 -4 l-9 12 l-9 -12z" fill="#fff" stroke="#c9cfe0" /><rect x="94" y="136" width="16" height="14" rx="2" fill="none" stroke="#b6bdd0" /><path d="M98 136 v-6 M104 136 v-8" stroke="#5fe3b4" strokeWidth="2" strokeLinecap="round" /></>}
        {c.outfit === 'polera' && <path d="M58 107 q17 12 34 0" stroke={o2} strokeWidth="5" fill="none" strokeLinecap="round" />}
        {c.outfit === 'chaqueta' && <><path d="M62 106 l13 60 l13 -60z" fill="#e8ebf4" /><path d="M62 106 l13 60 M88 106 l-13 60" stroke={o2} strokeWidth="3" /><path d="M38 146 h16 M96 146 h16" stroke={o2} strokeWidth="2.5" strokeLinecap="round" /></>}
        {c.outfit === 'traje' && <><path d="M62 106 l13 34 l13 -34z" fill="#fff" /><path d="M75 112 l-4 6 l4 24 l4 -24z" fill="#c0392b" /><path d="M62 106 l13 34 l-11 -8z M88 106 l-13 34 l11 -8z" fill={o2} /></>}
        {/* cuello y cabeza */}
        <rect x="64" y="90" width="22" height="24" rx="8" fill={c.skin} /><rect x="64" y="90" width="22" height="24" rx="8" fill={shade} />
        <circle cx="36" cy="68" r="8" fill={c.skin} /><circle cx="114" cy="68" r="8" fill={c.skin} />
        {c.gear === 'aretes' && <g fill="#ffd166" stroke="#d9a13a"><circle cx="35" cy="78" r="3" /><circle cx="115" cy="78" r="3" /></g>}
        {c.hair === 'mono' && <circle cx="75" cy="13" r="13" fill={hc} />}
        <ellipse cx="75" cy="64" rx="38" ry="40" fill={c.skin} />
        <ellipse cx="75" cy="64" rx="38" ry="40" fill="url(#avF)" />
        {c.face === 'pecas' && <g fill="#8a5a3c" opacity=".55">{[[47, 77], [53, 81], [44, 83], [103, 77], [97, 81], [106, 83]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />)}</g>}
        {facial === 'barba' && <path d="M40 70 q35 56 70 0 q-6 26 -35 28 q-29 -2 -35 -28z" fill={hc} />}
        {(c.hair === 'corto' || c.hair === 'largo' || c.hair === 'mono') && <>{cap}<path d="M52 24 q14 -6 28 -2" stroke="#fff" strokeOpacity=".22" strokeWidth="3" fill="none" strokeLinecap="round" /></>}
        {c.hair === 'rizado' && <g fill={hc}>{[44, 60, 76, 92, 106].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 26 : 30} r="14" />)}</g>}
        {c.hair === 'rapado' && <path d="M37 58 q-1 -42 38 -42 q39 0 38 42 q-8 -20 -38 -20 q-30 0 -38 20z" fill={hc} opacity=".55" />}
        {c.hair === 'cresta' && <path d="M64 36 l-5 -16 l9 4 l7 -22 l7 22 l9 -4 l-5 16 q-11 -5 -22 0z" fill={hc} />}
        {c.hair === 'gorro' && <><path d="M33 58 q2 -46 42 -46 q40 0 42 46z" fill="#5fe3b4" /><rect x="31" y="52" width="88" height="12" rx="6" fill="#2fbf8a" /><circle cx="75" cy="8" r="7" fill="#e8ebf4" /></>}
        {/* cara */}
        <path d="M52 52 q8 -5 16 -1 M82 51 q8 -4 16 1" stroke={hc} strokeWidth="3" strokeLinecap="round" fill="none" />
        <g className="av-eyes">
          <ellipse cx="60" cy="66" rx="5" ry="6" fill="#fff" /><ellipse cx="90" cy="66" rx="5" ry="6" fill="#fff" />
          <circle cx="61" cy="67" r="3.4" fill={eye} /><circle cx="91" cy="67" r="3.4" fill={eye} />
          <circle cx="61" cy="67" r="1.7" fill="#0b0c14" /><circle cx="91" cy="67" r="1.7" fill="#0b0c14" />
          <circle cx="62.2" cy="65.6" r="1.1" fill="#fff" /><circle cx="92.2" cy="65.6" r="1.1" fill="#fff" />
        </g>
        <g fill="#ff7a9c" opacity={c.face === 'rubor' ? 0.5 : 0.22}><circle cx="50" cy="80" r="6" /><circle cx="100" cy="80" r="6" /></g>
        {mouth === 'sonrisa' && <path className="av-mouth" d="M66 84 q9 8 18 0" fill="none" stroke="#1a1c28" strokeWidth="2.6" strokeLinecap="round" />}
        {mouth === 'grande' && <path className="av-mouth" d="M64 82 q11 14 22 0z" fill="#1a1c28" stroke="#1a1c28" strokeWidth="2" strokeLinejoin="round" />}
        {mouth === 'neutral' && <path className="av-mouth" d="M67 86 h16" stroke="#1a1c28" strokeWidth="2.6" strokeLinecap="round" />}
        {mouth === 'sorpresa' && <ellipse className="av-mouth" cx="75" cy="87" rx="4" ry="5" fill="#1a1c28" />}
        {facial === 'bigote' && <path d="M62 81 q6 -6 13 -2 q7 -4 13 2 q-6 3 -13 0 q-7 3 -13 0z" fill={hc} />}
        {facial === 'perilla' && <path d="M69 94 q6 4 12 0 q-1 8 -6 10 q-5 -2 -6 -10z" fill={hc} />}
        {c.gear === 'lentes' && <g fill="rgba(143,164,255,.22)" stroke="#16182a" strokeWidth="3"><rect x="46" y="55" width="26" height="22" rx="7" /><rect x="78" y="55" width="26" height="22" rx="7" /><path d="M72 64 h6" /></g>}
        {c.gear === 'sol' && <><g fill="#16182a" stroke="#16182a" strokeWidth="3"><rect x="46" y="57" width="26" height="18" rx="7" /><rect x="78" y="57" width="26" height="18" rx="7" /><path d="M72 64 h6" /></g><path d="M51 62 h7 M83 62 h7" stroke="#fff" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" /></>}
        {c.gear === 'audifonos' && <g fill="none" stroke="#e8ebf4" strokeWidth="5" strokeLinecap="round"><path d="M37 68 q0 -48 38 -48 q38 0 38 48" /><rect x="30" y="62" width="11" height="22" rx="5" fill="#8fa4ff" stroke="none" /><rect x="109" y="62" width="11" height="22" rx="5" fill="#8fa4ff" stroke="none" /></g>}
        {c.gear === 'gorra' && <><path d="M35 54 q0 -40 40 -40 q40 0 40 40z" fill={o1} /><path d="M35 54 q40 -8 80 0" stroke={o2} strokeWidth="3" fill="none" /><path d="M80 52 q26 -4 46 6 q-22 4 -46 0z" fill={o2} /><circle cx="75" cy="15" r="3.5" fill={o2} /></>}
      </g>
    </svg>
  )
}

/** Robot de un agente: cabeza con pantalla, antena que late y emoji en el pecho. */
function Robot({ a, state, size = 86 }: { a: TeamAgent; state: 'idle' | 'work' | 'done'; size?: number }): ReactNode {
  const L = a.look ?? {}
  const head = L.head ?? 'redonda'
  const eyes = L.eyes ?? 'pixel'
  const ant = L.antenna ?? 'bola'
  const acc = L.acc ?? 'ninguno'
  // un sombrero tapa la antena: no se dibujan juntos
  const hat = acc === 'gorro' || acc === 'sombrero' || acc === 'corona'
  const rx = head === 'cuadrada' ? 5 : head === 'tv' ? 8 : 16
  const skull = (fill: string): ReactNode =>
    head === 'domo'
      ? <path d="M14 54 v-12 a29 28 0 0 1 58 0 v12 a8 8 0 0 1 -8 8 h-42 a8 8 0 0 1 -8 -8z" fill={fill} />
      : <rect x="14" y="16" width="58" height="46" rx={rx} fill={fill} />
  return (
    <svg className={`bot bot-${state}`} width={size} height={(size * 96) / 86} viewBox="0 0 86 96" style={{ ['--c' as string]: a.color }}>
      <ellipse cx="43" cy="92" rx="30" ry="4" fill="#000" opacity=".25" />
      <g className="bot-body">
        {!hat && ant === 'bola' && <><line x1="43" y1="6" x2="43" y2="18" stroke="#8a92aa" strokeWidth="3" /><circle className="bot-ant" cx="43" cy="6" r="5" fill={a.color} /></>}
        {!hat && ant === 'doble' && <><path d="M33 20 L27 7 M53 20 L59 7" stroke="#8a92aa" strokeWidth="3" strokeLinecap="round" /><circle className="bot-ant" cx="27" cy="6" r="4" fill={a.color} /><circle className="bot-ant" cx="59" cy="6" r="4" fill={a.color} /></>}
        {!hat && ant === 'helice' && <><line x1="43" y1="6" x2="43" y2="18" stroke="#8a92aa" strokeWidth="3" /><ellipse className="bot-prop" cx="43" cy="5" rx="13" ry="3" fill={a.color} /><circle cx="43" cy="5" r="2.5" fill="#8a92aa" /></>}
        <rect x="10" y="40" width="66" height="46" rx="14" fill="#2b3150" /><rect x="10" y="40" width="66" height="46" rx="14" fill={a.color} opacity=".18" />
        {skull(a.color)}{skull('url(#avF)')}
        <rect x="21" y="25" width="44" height="28" rx={head === 'redonda' || head === 'domo' ? 10 : 4} fill="#0e1020" />
        {head === 'tv' && <g fill="#0e1020"><circle cx="67" cy="57" r="2" /><circle cx="61" cy="57" r="2" /></g>}
        <g className="bot-eyes" fill={a.color} stroke={a.color}>
          {eyes === 'pixel' && <><rect x="29" y="33" width="9" height="12" rx="4" stroke="none" /><rect x="48" y="33" width="9" height="12" rx="4" stroke="none" /></>}
          {eyes === 'redondos' && <><circle cx="33.5" cy="39" r="5.5" stroke="none" /><circle cx="52.5" cy="39" r="5.5" stroke="none" /></>}
          {eyes === 'visor' && <rect x="26" y="35" width="34" height="8" rx="4" stroke="none" />}
          {eyes === 'felices' && <path d="M28 42 q5.5 -8 11 0 M47 42 q5.5 -8 11 0" fill="none" strokeWidth="3" strokeLinecap="round" />}
        </g>
        {acc !== 'audifonos' && <><rect x="4" y="30" width="8" height="18" rx="4" fill="#8a92aa" /><rect x="74" y="30" width="8" height="18" rx="4" fill="#8a92aa" /></>}
        <text x="43" y="76" textAnchor="middle" fontSize="17">{a.emoji}</text>
        {acc === 'gorro' && <><path d="M15 24 q0 -20 28 -20 q28 0 28 20z" fill="#ff7a9c" /><rect x="13" y="19" width="60" height="7" rx="3.5" fill="#e0557a" /><circle cx="43" cy="4" r="4" fill="#e8ebf4" /></>}
        {acc === 'sombrero' && <><rect x="29" y="1" width="28" height="15" rx="2" fill="#1b1d2c" /><rect x="29" y="11" width="28" height="3" fill={a.color} /><rect x="19" y="15" width="48" height="4" rx="2" fill="#1b1d2c" /></>}
        {acc === 'corona' && <path d="M25 19 l2 -15 l8 7 l8 -10 l8 10 l8 -7 l2 15z" fill="#ffd166" stroke="#d9a13a" strokeWidth="1.5" strokeLinejoin="round" />}
        {acc === 'audifonos' && <><path d="M8 34 q0 -28 35 -28 q35 0 35 28" stroke="#e8ebf4" strokeWidth="4" fill="none" /><rect x="2" y="27" width="11" height="22" rx="5" fill="#e8ebf4" /><rect x="73" y="27" width="11" height="22" rx="5" fill="#e8ebf4" /></>}
        {acc === 'lentes' && <g fill="none" stroke="#e8ebf4" strokeWidth="2.5"><rect x="25" y="30" width="17" height="18" rx="5" /><rect x="44" y="30" width="17" height="18" rx="5" /></g>}
      </g>
    </svg>
  )
}

/** Sala: escritorios con agentes, tu personaje y objetos que arrastras donde quieras (se guardan al soltar). */
function Room({ team, working, routing, done, sel, selAgent, progress, onStop, onSel, onAgent, onProps, onDrop }: {
  team: AgentTeam; working?: string; routing?: boolean; done?: string; sel: string; selAgent?: string; progress?: string; onStop?: () => void
  onSel: (id: string) => void; onAgent: (id: string) => void; onProps: (p: TeamProp[]) => void; onDrop: () => void
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
      {/* lámparas colgantes: dan luz cálida al suelo y algo de profundidad */}
      <i className="tr-pend p1" /><i className="tr-pend p2" />
      {team.agents.map((a, i) => {
        const st = a.id === working ? 'work' : a.id === done ? 'done' : 'idle'
        // hasta 3 agentes: una fila; con más, dos filas más pequeñas para que los escritorios no se pisen
        const two = n > 3
        const cols = two ? Math.ceil(n / 2) : n
        const row = two ? Math.floor(i / cols) : 0
        const inRow = two ? (row === 0 ? cols : n - cols) : n
        const left = two ? ((i % cols) + 0.5) / inRow * 74 + 4 : ((i + 0.5) / (n + 1)) * 88 + 4
        const top = two ? (row === 0 ? 62 : 86) : 79
        return (
          <div
            key={a.id}
            className={`tr-desk ${st} ${a.id === selAgent ? 'sel' : ''}`}
            style={{ left: `${left}%`, top: `${top}%`, ['--ds' as string]: two ? 0.72 : 1, ['--c' as string]: a.color, zIndex: 40 + row }}
            role="button"
            tabIndex={0}
            aria-label={`${a.name}${st === 'work' ? ', trabajando' : st === 'done' ? ', terminó' : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onAgent(a.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAgent(a.id) } }}
          >
            {/* al trabajar: foco desde arriba, anillo en el suelo y código que sale del portátil */}
            {st === 'work' && <><i className="tr-beam" /><i className="tr-ping" /><div className="tr-fx" aria-hidden><i>{'{ }'}</i><i>&lt;/&gt;</i><i>01</i><i>✦</i></div></>}
            {st !== 'idle' && <div className="tr-bubble">{st === 'work' ? <><i /><i /><i /></> : '✓ listo'}</div>}
            <Robot a={a} state={st} />
            <div className="tr-top"><div className="tr-lap"><span /><span /><span /></div></div>
            <div className="tr-legs"><i /><i /></div>
            <small className="tr-tag">{a.name}</small>
            {/* progreso en vivo justo bajo el agente que ejecuta, con su botón de detener */}
            {st === 'work' && onStop && (
              <span className="tr-prog" onClick={(e) => e.stopPropagation()}>
                <span>{progress || 'Trabajando…'}</span>
                <button aria-label={`Detener a ${a.name}`} title="Detener" onClick={onStop}>■</button>
              </span>
            )}
          </div>
        )
      })}
      <div className={`tr-me ${working ? 'work' : ''}`} style={{ left: '90%' }}>
        {routing && <div className="tr-bubble think">¿Quién lo atiende?</div>}
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
            aria-label={`${as.label}: flechas para mover, + y - para el tamaño, F para voltear, Supr para quitar`}
            onFocus={() => onSel(p.id)}
            onKeyDown={(e) => {
              const k = e.key
              if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); onProps(props.filter((q) => q.id !== p.id)); onDrop(); return }
              const scale = (ds: number): void => { e.preventDefault(); onProps(props.map((q) => (q.id === p.id ? { ...q, s: clamp(q.s + ds, 0.6, 2.2) } : q))); onDrop() }
              if (k === '+' || k === '=') return scale(0.15)
              if (k === '-') return scale(-0.15)
              if (k === 'f' || k === 'F') { e.preventDefault(); onProps(props.map((q) => (q.id === p.id ? { ...q, flip: !q.flip } : q))); onDrop(); return }
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
function withProps(t0: AgentTeam): AgentTeam {
  // la barba antes era un «accesorio»; ahora es vello facial y deja libre el accesorio
  const t = t0.character.gear === 'barba' ? { ...t0, character: { ...t0.character, gear: 'ninguno' as const, facial: 'barba' as const } } : t0
  if (t.props) return t
  const props: TeamProp[] = t.decor.map((e, i) => ({ id: `m${i}`, k: EMOJI_TO_ASSET[e] ?? 'plant', x: 12 + i * 14, y: 90, s: 1 })).filter((p) => ASSET_BY_KEY[p.k])
  return { ...t, props }
}

// borradores fuera del componente: al cambiar de vista se desmonta, pero lo escrito y los adjuntos pendientes se conservan
const kept = { draft: '', files: [] as Attachment[], msg: '' }
// carpeta de adjuntos del equipo (el main la crea al guardar el primero)
const TEAM_ATT = 'equipo'

export function TeamView(): ReactNode {
  const ui = useUi()
  const groups = useDB().groups ?? []
  const [team, setTeam] = useState<AgentTeam | null>(null)
  const [sel, setSel] = useState<string>('')
  const [selProp, setSelProp] = useState('')
  const [msg, setMsgRaw] = useState(kept.msg)
  const setMsg = (v: string): void => {
    kept.msg = v
    setMsgRaw(v)
  }
  const [files, setFilesRaw] = useState<Attachment[]>(kept.files)
  const setFiles = (f: Attachment[] | ((c: Attachment[]) => Attachment[])): void =>
    setFilesRaw((c) => (kept.files = typeof f === 'function' ? f(c) : f))
  const [dragging, setDragging] = useState(false)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [tab, setTab] = useState<'chat' | 'edit'>('chat')
  const [charTab, setCharTab] = useState<'cara' | 'pelo' | 'ropa'>('cara')
  const [draft, setDraftRaw] = useState(kept.draft)
  const setDraft = (v: string): void => {
    kept.draft = v
    setDraftRaw(v)
  }
  const [routing, setRouting] = useState(false)
  const [chatWork, setChatWork] = useState('')
  const [progress, setProgress] = useState('')
  const [q, setQ] = useState('')
  const [sugg, setSugg] = useState(0)
  const [renaming, setRenaming] = useState(false)
  const [dirOpen, setDirOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [fwd, setFwd] = useState('')
  const [since, setSince] = useState(0)
  const [, tick] = useState(0)
  const logRef = useRef<HTMLDivElement>(null)
  const teamRef = useRef<AgentTeam | null>(null)
  const [pop, setPop] = useState<'' | 'obj' | 'add' | 'more'>('')
  const [sub, setSub] = useState<'id' | 'brain' | 'test'>('id')
  const [confirmDel, setConfirmDel] = useState(false)
  // skills realmente instaladas: solo estas se pueden asignar (antes era una lista fija)
  const [installed, setInstalled] = useState<SkillInfo[]>([])
  useEffect(() => {
    if (sub !== 'brain') return
    void window.api.call('skills:list').then((l) => setInstalled(l.filter((s) => s.installed))).catch(() => setInstalled([]))
  }, [sub])
  // los popovers se cierran con Esc o al pulsar fuera
  useEffect(() => {
    if (!pop) return
    const down = (e: PointerEvent): void => { if (!(e.target as Element).closest('.tm-popwrap')) setPop('') }
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') setPop('') }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key) }
  }, [pop])
  teamRef.current = team
  const chatLen = (team?.chats?.find((c) => c.id === team.activeChat) ?? team?.chats?.[0])?.msgs.length ?? team?.chat?.length ?? 0

  // baja al último mensaje cuando llega uno nuevo o cambia el estado del agente
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chatLen, chatWork, routing, tab, team?.activeChat])
  // cronómetro del agente que trabaja (solo repinta mientras hay trabajo)
  // lo que el agente está haciendo (herramienta en uso / paso del plan)
  useEffect(() => window.api.onTeamProgress((p) => setProgress(p.text)), [])
  useEffect(() => {
    if (!chatWork && !busy) setProgress('')
  }, [chatWork, busy])
  useEffect(() => {
    if (!chatWork) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [chatWork])

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
    teamRef.current = next // varios mensajes seguidos del chat no deben pisarse entre renders
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
    setTab('edit')
  }
  // plantillas que aún no están en el equipo (el id es fijo, así no se duplican)
  const missingTpl = AGENT_TEMPLATES.filter((t) => !team.agents.some((a) => a.id === t.id))
  const addTemplate = (t: TeamAgent): void => {
    update({ ...team, agents: [...team.agents, { ...t, skills: [...t.skills], look: t.look && { ...t.look } }] })
    setSel(t.id)
    setReply('')
    setTab('edit')
  }
  const removeAgent = (): void => {
    const agents = team.agents.filter((a) => a.id !== sel)
    update({ ...team, agents })
    setSel(agents[0]?.id ?? '')
    setConfirmDel(false)
    setPop('')
  }
  const pickAgent = (id: string): void => {
    setSel(id)
    setReply('')
    setTab('edit')
    setConfirmDel(false)
    requestAnimationFrame(() => document.querySelector(`.rs-chip[data-id="${id}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' }))
  }
  // roving tabindex: las flechas mueven la selección dentro de la lista
  const rosterKey = (e: RKeyEvent): void => {
    const ids = team.agents.map((a) => a.id)
    const i = ids.indexOf(sel)
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? Math.min(i + 1, ids.length - 1) : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? Math.max(i - 1, 0) : e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    pickAgent(ids[next])
    requestAnimationFrame(() => (document.querySelector(`.rs-chip[data-id="${ids[next]}"]`) as HTMLElement | null)?.focus())
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
    setChar({
      skin: pick(SKINS.slice(0, 6)), hair: pick(HAIR)[0], gear: pick(GEAR)[0], outfit: pick(OUTFIT)[0],
      hairColor: pick(HAIR_COLORS), eyeColor: pick(EYE_COLORS), outfitColor: pick(OUTFIT_COLORS),
      mouth: pick(MOUTH)[0], face: pick(FACE)[0], facial: Math.random() < 0.7 ? 'ninguno' : pick(FACIAL)[0]
    })
  }
  const setLook = (p: Partial<RobotLook>): void => setAgent({ look: { ...agent?.look, ...p } })
  const randomBot = (): void =>
    setAgent({ color: pick(COLORS), look: { head: pick(HEADS)[0], eyes: pick(BOT_EYES)[0], antenna: pick(ANTENNAS)[0], acc: pick(BOT_ACC)[0] } })
  const ask = async (): Promise<void> => {
    if (!agent) return
    const id = agent.id
    if (!(await okOpus(id))) return
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

  const runQa = async (): Promise<void> => {
    if (!agent) return
    setBusy(true)
    setReply('')
    try {
      const r = await ui.run('team:qa', agent.workdir)
      if (typeof r === 'string') {
        setReply(r)
        setDone(agent.id)
      }
    } finally {
      setBusy(false)
    }
  }

  // ---- conversaciones: `chats` guarda varias; el chat antiguo (`chat`) pasa a ser la primera ----
  const convsOf = (t: AgentTeam): TeamConv[] => (t.chats?.length ? t.chats : [{ id: 'main', name: 'Principal', msgs: t.chat ?? [] }])
  const convs = convsOf(team)
  const activeId = convs.some((c) => c.id === team.activeChat) ? (team.activeChat as string) : convs[0].id
  const writeConvs = (t: AgentTeam, next: TeamConv[], active: string): AgentTeam => ({ ...t, chat: undefined, chats: next, activeChat: active })
  const mapConv = (t: AgentTeam, id: string, fn: (c: TeamConv) => TeamConv): AgentTeam => {
    const cur = convsOf(t)
    return writeConvs(t, cur.map((c) => (c.id === id ? fn(c) : c)), t.activeChat ?? cur[0].id)
  }
  const newConv = (): void => {
    const id = Math.random().toString(36).slice(2, 8)
    update(writeConvs(team, [...convs, { id, name: `Conversación ${convs.length + 1}`, msgs: [], workdir: convs.find((c) => c.id === activeId)?.workdir }], id))
    setQ('')
  }
  const delConv = (): void => {
    const rest = convs.filter((c) => c.id !== activeId)
    update(writeConvs(team, rest.length ? rest : [{ id: 'main', name: 'Principal', msgs: [] }], (rest[0] ?? { id: 'main' }).id))
  }
  // escribe en la conversación donde se pidió (aunque el usuario cambie de conversación mientras el agente trabaja)
  const pushChat = (m: Omit<TeamChatMsg, 'id' | 'at'>, convId = activeId): void => {
    const t = teamRef.current
    if (!t) return
    update(mapConv(t, convId, (c) => ({ ...c, msgs: [...c.msgs, { ...m, id: Math.random().toString(36).slice(2, 9), at: Date.now() }].slice(-60) })))
  }
  const mentioned = (text: string): TeamAgent | undefined => {
    const low = text.toLowerCase()
    return [...team.agents].sort((a, b) => b.name.length - a.name.length).find((a) => low.startsWith(`@${a.name.toLowerCase()}`))
  }
  // un agente con Opus gasta mucho más de la ventana de uso: se avisa siempre antes de lanzarlo
  const okOpus = async (agentId: string): Promise<boolean> => {
    const a = team.agents.find((x) => x.id === agentId)
    const names = agentId === ORCHESTRATOR_ID ? team.agents.filter((x) => x.model === 'opus').map((x) => x.name) : a?.model === 'opus' ? [a.name] : []
    if (!names.length) return true
    return ui.confirm(`${names.join(', ')} usa${names.length > 1 ? 'n' : ''} Opus, el modelo que más consume de tu límite de uso. ${agentId === ORCHESTRATOR_ID ? 'El orquestador puede llamar a esos agentes. ' : ''}¿Continuar?`, { title: 'Este agente usa Opus', confirmLabel: 'Sí, usar Opus' })
  }
  const stop = (): void => void window.api.call('team:cancel')
  /** Lanza una solicitud: `forced` fuerza el agente (reintentar / enviar a otro); si no, se enruta solo o por @mención. */
  const dispatch = async (text: string, sent: Attachment[], forced?: string): Promise<void> => {
    const cid = activeId
    const convDir = convs.find((c) => c.id === cid)?.workdir
    // lo anterior de esta conversación, para que el agente entienda referencias como «la idea 3»
    const history = (convs.find((c) => c.id === cid)?.msgs ?? [])
      .filter((m) => m.role !== 'system' && m.text.trim())
      .slice(-14)
      // las dos últimas respuestas de agentes (propuestas y lo ya aplicado) van casi completas para que no se pierdan; el resto, resumido
      .map((m, i, a) => {
        const lastAgent = a.map((x, j) => (x.role !== 'user' ? j : -1)).filter((j) => j >= 0).slice(-2)
        return `${m.role === 'user' ? 'Usuario' : byId(m.agentId)?.name ?? 'Agente'}: ${m.text.slice(0, m.role !== 'user' && lastAgent.includes(i) ? 6000 : m.role === 'user' ? 3000 : 1500)}`
      })
      .join('\n\n')
    pushChat({ role: 'user', text, attachments: sent.length ? sent : undefined }, cid)
    const at = forced ? undefined : mentioned(text)
    const body = at ? text.slice(at.name.length + 1).trim() || text : text
    let route: { agentId: string; reason: string } | undefined
    if (forced) route = { agentId: forced, reason: 'Elegido por ti' }
    else if (at) route = { agentId: at.id, reason: 'Lo mencionaste con @' }
    else {
      setRouting(true)
      try {
        route = (await ui.run('team:route', text, history)) ?? undefined
      } finally {
        setRouting(false)
      }
    }
    if (!route) return
    pushChat({ role: 'system', text: '', agentId: route.agentId, reason: route.reason }, cid)
    if (!(await okOpus(route.agentId))) {
      pushChat({ role: 'system', text: 'Cancelado: no se ejecutó porque usa Opus.' }, cid)
      return
    }
    setChatWork(route.agentId)
    setSince(Date.now())
    try {
      if (route.agentId === ORCHESTRATOR_ID) {
        // el orquestador reparte el trabajo: cada paso aparece como instrucción + respuesta del agente, y al final su resumen
        const o = await ui.run('team:orchestrate', body, sent, history, convDir)
        if (o) {
          for (const s of o.steps) {
            pushChat({ role: 'system', text: '', agentId: s.agentId, reason: s.instruction.slice(0, 200) }, cid)
            pushChat({ role: 'agent', text: s.output, agentId: s.agentId }, cid)
          }
          if (o.summary) pushChat({ role: 'agent', text: o.summary, agentId: ORCHESTRATOR_ID }, cid)
          setDone(ORCHESTRATOR_ID)
        }
        return
      }
      const r = await ui.run('team:ask', route.agentId, body, sent, history, convDir)
      if (typeof r === 'string') {
        pushChat({ role: 'agent', text: r, agentId: route.agentId }, cid)
        setDone(route.agentId)
      }
    } finally {
      setChatWork('')
    }
  }
  // comandos con «/»: se resuelven aquí, sin llamar a la IA
  const COMMANDS: Array<[string, string]> = [['/nueva', 'Nueva conversación'], ['/limpiar', 'Vaciar la conversación'], ['/buscar', 'Buscar en el historial: /buscar texto'], ['/detener', 'Detener al agente que trabaja']]
  const runCommand = (text: string): boolean => {
    const [cmd, ...rest] = text.split(/\s+/)
    if (!COMMANDS.some(([c]) => c === cmd)) return false
    setDraft('')
    if (cmd === '/nueva') newConv()
    else if (cmd === '/limpiar') update(mapConv(team, activeId, (c) => ({ ...c, msgs: [] })))
    else if (cmd === '/detener') stop()
    else if (cmd === '/buscar') setQ(rest.join(' '))
    return true
  }
  const send = async (): Promise<void> => {
    const text = draft.trim()
    if ((!text && !files.length) || routing || chatWork) return
    if (!files.length && runCommand(text)) return
    const sent = files
    setDraft('')
    setFiles([])
    await dispatch(text, sent)
  }
  // acciones por mensaje
  const prevUser = (id: string): TeamChatMsg | undefined => {
    const i = log.findIndex((m) => m.id === id)
    return log.slice(0, Math.max(i, 0)).reverse().find((m) => m.role === 'user')
  }
  const delMsg = (id: string): void => update(mapConv(team, activeId, (c) => ({ ...c, msgs: c.msgs.filter((m) => m.id !== id) })))
  const copyMsg = (text: string): void => void navigator.clipboard.writeText(text).catch(() => undefined)
  const retry = (m: TeamChatMsg): void => {
    const u = prevUser(m.id)
    if (u && m.agentId && !chatWork && !routing) void dispatch(u.text, u.attachments ?? [], m.agentId)
  }
  const forward = (m: TeamChatMsg, to: string): void => {
    setFwd('')
    const from = byId(m.agentId)?.name ?? 'otro agente'
    if (!chatWork && !routing) void dispatch(`Continúa a partir de esta respuesta de ${from}:\n\n${m.text.slice(0, 6000)}`, [], to)
  }
  const addBlobs = async (blobs: File[]): Promise<void> => {
    for (const f of blobs) {
      const a = await ui.run('attach:save', TEAM_ATT, f.name || 'captura.png', new Uint8Array(await f.arrayBuffer()))
      if (a) setFiles((cur) => [...cur, a])
    }
  }
  const pickFiles = async (): Promise<void> => {
    const r = await ui.run('attach:pick', TEAM_ATT)
    if (r?.length) setFiles((cur) => [...cur, ...r])
  }
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const blobs = [...e.clipboardData.files]
    if (!blobs.length) return
    e.preventDefault()
    void addBlobs(blobs)
  }
  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragging(false)
    void addBlobs([...e.dataTransfer.files])
  }
  // documentos de referencia del agente (se guardan en su propia carpeta y viajan con cada encargo)
  const addRefs = async (): Promise<void> => {
    if (!agent) return
    const r = await ui.run('attach:pick', `ref-${agent.id}`)
    if (r?.length) setAgent({ refs: [...(agent.refs ?? []), ...r] })
  }
  const byId = (id?: string): TeamAgent | undefined => team.agents.find((a) => a.id === id)
  const secs = chatWork ? Math.floor((Date.now() - since) / 1000) : 0
  const elapsed = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  const all = (convs.find((c) => c.id === activeId) ?? convs[0]).msgs
  const needle = q.trim().toLowerCase()
  const log = needle ? all.filter((m) => m.text.toLowerCase().includes(needle) || byId(m.agentId)?.name.toLowerCase().includes(needle)) : all
  // sugerencias: @agente al empezar el mensaje, /comando
  const mention = /^@([^\s@]*)$/.exec(draft)
  const slash = /^\/([^\s/]*)$/.exec(draft)
  const suggs: Array<{ key: string; label: string; hint: string; apply: () => void }> = mention
    ? team.agents.filter((a) => a.name.toLowerCase().startsWith(mention[1].toLowerCase())).map((a) => ({ key: a.id, label: `${a.emoji} @${a.name}`, hint: a.model, apply: () => setDraft(`@${a.name} `) }))
    : slash
      ? COMMANDS.filter(([c]) => c.startsWith(draft)).map(([c, h]) => ({ key: c, label: c, hint: h, apply: () => setDraft(c === '/buscar' ? '/buscar ' : c) }))
      : []
  const working = chatWork || (busy ? sel : undefined)

  const opts = <T extends string>(list: Array<[T, string]>, cur: T, on: (v: T) => void): ReactNode => (
    <div className="tm-opts">{list.map(([v, l]) => <button key={v} className={cur === v ? 'on' : ''} onClick={() => on(v)}>{l}</button>)}</div>
  )
  // muestras de color + selector libre (el último círculo abre el selector del sistema)
  const swatches = (list: string[], cur: string | undefined, on: (v: string) => void, label: string): ReactNode => {
    const custom = !!cur && !list.includes(cur)
    return (
      <div className="tm-sw" style={{ gridTemplateColumns: `repeat(${list.length + 1}, minmax(0, 20px))` }}>
        {list.map((s) => <button key={s} type="button" style={{ background: s }} className={cur === s ? 'on' : ''} aria-label={`${label} ${s}`} aria-pressed={cur === s} onClick={() => on(s)} />)}
        <label className={`tm-sw-custom ${custom ? 'on' : ''}`} title="Color personalizado" style={custom ? { background: cur } : undefined}>
          <input type="color" value={cur && /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#888888'} onChange={(e) => on(e.target.value)} aria-label={`${label}: color personalizado`} />
          {!custom && <span aria-hidden>＋</span>}
        </label>
        <input key={cur} className="tm-hex" defaultValue={cur ?? ''} maxLength={7} spellCheck={false} aria-label={`${label}: código hexadecimal`} placeholder="#rrggbb"
          onBlur={(e) => { const v = e.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) on(v.toLowerCase()); else e.target.value = cur ?? '' }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      </div>
    )
  }
  const ch = team.character
  const field = (label: string, body: ReactNode): ReactNode => <div className="tm-field"><span className="tm-lbl">{label}</span>{body}</div>

  return (
    <div className="tm-wrap">
      <section className="card tm-char">
        <div className="tm-head">
          <div className="tm-stage"><Avatar c={team.character} size={92} live="idle" /></div>
          <div className="tm-id">
            <div className="eyebrow">Tu personaje</div>
            <input className="tm-name" value={team.character.name} onChange={(e) => setChar({ name: e.target.value })} aria-label="Nombre del personaje" />
            <input className="tm-name sub" value={team.character.role} onChange={(e) => setChar({ role: e.target.value })} aria-label="Rol del personaje" />
            <button className="btn sm tm-rand" onClick={random}>🎲 Aleatorio</button>
          </div>
        </div>
        {/* por pestañas: con tantas opciones, una sola columna se volvía interminable */}
        <div className="tm-subtabs" role="tablist">
          {(['cara', 'pelo', 'ropa'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={charTab === k} className={charTab === k ? 'on' : ''} onClick={() => setCharTab(k)}>
              {k === 'cara' ? 'Cara' : k === 'pelo' ? 'Pelo' : 'Ropa y extras'}
            </button>
          ))}
        </div>
        {charTab === 'cara' && <>
          {field('Piel', swatches(SKINS, ch.skin, (skin) => setChar({ skin }), 'Piel'))}
          {field('Ojos', swatches(EYE_COLORS, ch.eyeColor ?? '#1a1c28', (eyeColor) => setChar({ eyeColor }), 'Ojos'))}
          {field('Boca', opts(MOUTH, ch.mouth ?? 'sonrisa', (mouth) => setChar({ mouth })))}
          {field('Mejillas', opts(FACE, ch.face ?? 'normal', (face) => setChar({ face })))}
          {field('Vello facial', opts(FACIAL, ch.facial ?? 'ninguno', (facial) => setChar({ facial })))}
        </>}
        {charTab === 'pelo' && <>
          {field('Peinado', opts(HAIR, ch.hair, (hair) => setChar({ hair })))}
          {field('Color de pelo', swatches(HAIR_COLORS, ch.hairColor ?? HAIR_COLOR, (hairColor) => setChar({ hairColor }), 'Pelo'))}
        </>}
        {charTab === 'ropa' && <>
          {field('Ropa', opts(OUTFIT, ch.outfit, (outfit) => setChar({ outfit })))}
          {field('Color de ropa', swatches(OUTFIT_COLORS, ch.outfitColor ?? OUTFIT_COLOR[ch.outfit], (outfitColor) => setChar({ outfitColor }), 'Ropa'))}
          {field('Accesorio', opts(GEAR, ch.gear === 'barba' ? 'ninguno' : ch.gear, (gear) => setChar({ gear })))}
        </>}
      </section>

      <section className="card tm-mid">
        <div className="eyebrow">La sala <span className="tm-hint">arrastra los objetos donde quieras</span></div>
        <Room
          team={team}
          working={working}
          progress={progress}
          onStop={stop}
          routing={routing}
          done={done}
          sel={selProp}
          selAgent={sel}
          onSel={setSelProp}
          onAgent={pickAgent}
          onProps={(p) => setTeam({ ...team, props: p })}
          onDrop={() => teamRef.current && void ui.run('team:save', teamRef.current)}
        />
        <div className="tr-bar">
          <div className="tm-popwrap">
            <button className="tr-objbtn" aria-expanded={pop === 'obj'} aria-haspopup="true" onClick={() => setPop(pop === 'obj' ? '' : 'obj')}>🪑 Objetos</button>
            {pop === 'obj' && (
              <div className="tr-pop" role="menu">
                {ASSETS.map((a) => <button key={a.k} role="menuitem" onClick={() => { addProp(a.k); setPop('') }} title={`Añadir: ${a.label}`}><span className="pv">{a.el}</span><small>{a.label}</small></button>)}
              </div>
            )}
          </div>
          {/* barra contextual: solo aparece con un objeto seleccionado */}
          {curProp ? (
            <div className="tr-ctx" role="toolbar" aria-label={`Ajustar ${ASSET_BY_KEY[curProp.k]?.label}`}>
              <span>{ASSET_BY_KEY[curProp.k]?.label}</span>
              <button title="Más grande (+)" aria-label="Más grande" onClick={() => patchProp({ s: clamp(curProp.s + 0.15, 0.6, 2.2) })}>＋</button>
              <button title="Más pequeño (-)" aria-label="Más pequeño" onClick={() => patchProp({ s: clamp(curProp.s - 0.15, 0.6, 2.2) })}>－</button>
              <button title="Voltear (F)" aria-label="Voltear" aria-pressed={!!curProp.flip} onClick={() => patchProp({ flip: !curProp.flip })}>⇋</button>
              <button title="Quitar (Supr)" aria-label="Quitar" onClick={() => { update({ ...team, props: props.filter((p) => p.id !== selProp) }); setSelProp('') }}>🗑</button>
            </div>
          ) : <span className="tr-hintbar">Selecciona un objeto para ajustarlo · flechas, + − F, Supr</span>}
        </div>
        <div className="tm-agents-h">
          <div className="eyebrow">Agentes <span className="tm-count">{team.agents.length}</span></div>
          <div className="tm-popwrap">
            <button className="btn primary sm" aria-expanded={pop === 'add'} aria-haspopup="true" onClick={() => setPop(pop === 'add' ? '' : 'add')}>＋ Agente</button>
            {pop === 'add' && (
              <div className="rs-pop right up" role="menu">
                <button role="menuitem" onClick={() => { setPop(''); addAgent() }}><span aria-hidden>🤖</span> Agente en blanco</button>
                {missingTpl.map((t) => (
                  <button key={t.id} role="menuitem" style={{ ['--c' as string]: t.color }} title={t.prompt} onClick={() => { setPop(''); addTemplate(t) }}><span aria-hidden>{t.emoji}</span> {t.name}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        {team.agents.length === 0 ? (
          <div className="rs-empty">
            <b>＋ Crea tu primer agente</b>
            <div>{AGENT_TEMPLATES.slice(0, 4).map((t) => <button key={t.id} style={{ ['--c' as string]: t.color }} onClick={() => addTemplate(t)}><span aria-hidden>{t.emoji}</span> {t.name}</button>)}</div>
          </div>
        ) : (
          <div className="tm-roster" role="listbox" aria-label="Agentes del equipo" onKeyDown={rosterKey}>
            {team.agents.map((a) => {
              const isSel = a.id === sel
              const isBusy = a.id === working
              return (
                <button
                  key={a.id}
                  role="option"
                  aria-selected={isSel}
                  tabIndex={isSel || (!agent && a === team.agents[0]) ? 0 : -1}
                  data-id={a.id}
                  aria-label={`${a.name}, ${a.model}${isBusy ? ', trabajando' : ''}`}
                  className={`rs-chip ${isSel ? 'on' : ''} ${isBusy ? 'busy' : ''}`}
                  style={{ ['--c' as string]: a.color }}
                  onClick={() => pickAgent(a.id)}
                >
                  <span className="rs-bot"><Robot a={a} state={isBusy ? 'work' : 'idle'} size={34} /></span>
                  {isSel && <span className="rs-txt"><b>{a.name}</b><small>{isBusy ? 'trabajando…' : a.model}{a.canEdit ? ' · edita' : ''}</small></span>}
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className={`card tm-edit ${tab === 'chat' ? 'is-chat' : ''}`}>
        <div className="tm-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>
            💬 Chat del equipo{(routing || chatWork) && <i className="tm-live" />}
          </button>
          <button role="tab" aria-selected={tab === 'edit'} className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>⚙ Editar agente</button>
        </div>
        {tab === 'chat' ? (
          <div className="tc">
            <div className="tc-bar">
              <div className="tc-convs" role="tablist" aria-label="Conversaciones">
                {convs.map((c) => c.id === activeId && renaming ? (
                  <input key={c.id} className="tc-ren" autoFocus defaultValue={c.name} maxLength={30} aria-label="Nombre de la conversación"
                    onBlur={(e) => { setRenaming(false); update(mapConv(team, c.id, (x) => ({ ...x, name: e.target.value.trim() || x.name }))) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }} />
                ) : (
                  <button key={c.id} role="tab" aria-selected={c.id === activeId} className={c.id === activeId ? 'on' : ''}
                    title={c.id === activeId ? 'Doble clic para renombrar' : c.name}
                    onClick={() => { setQ(''); update(writeConvs(team, convs, c.id)) }}
                    onDoubleClick={() => c.id === activeId && setRenaming(true)}>
                    {c.name}
                  </button>
                ))}
                <button className="tc-add" aria-label="Nueva conversación" title="Nueva conversación" onClick={newConv}>＋</button>
              </div>
              <button className={`tc-add ${searchOpen || q ? 'on' : ''}`} aria-label="Buscar en la conversación" title="Buscar" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setQ('') }}>🔍</button>
              {(searchOpen || q) && <input className="tc-search" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la conversación…" aria-label="Buscar en la conversación" />}
              {convs.length > 1 && <button className="tc-add" aria-label="Eliminar conversación" title="Eliminar esta conversación" onClick={delConv}>🗑</button>}
            </div>
            {(() => {
              // La carpeta es de la conversación y la usan todos los agentes; sin elegir, cae a la del agente que edita.
              const cur = convs.find((c) => c.id === activeId)
              const own = team.agents.find((a) => a.canEdit && a.workdir) ?? team.agents.find((a) => a.workdir)
              const dir = cur?.workdir || own?.workdir
              const setDir = (p: string): void => update(mapConv(team, activeId, (c) => ({ ...c, workdir: p })))
              const name = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p
              const grp = groups.find((g) => g.folders.some((f) => f.path === dir))
              const pick = (p: string): void => { setDir(p); setDirOpen(false) }
              return (
                <div className="tc-dirwrap">
                  <button type="button" className={`tc-dir ${dir ? '' : 'is-empty'} ${dirOpen ? 'open' : ''}`} aria-haspopup="menu" aria-expanded={dirOpen} title={dir ? `${dir}${cur?.workdir ? '' : ' (carpeta del agente)'}` : 'Elige la carpeta del proyecto'} onClick={() => setDirOpen(!dirOpen)}>
                    <span aria-hidden>📁</span>
                    <span className="tc-dir-n">{dir ? name(dir) : 'Elegir carpeta del proyecto'}</span>
                    {grp && <small>{grp.name}</small>}
                    <i aria-hidden>▾</i>
                  </button>
                  {dirOpen && (
                    <>
                      <button type="button" className="tc-dir-bg" aria-label="Cerrar" tabIndex={-1} onClick={() => setDirOpen(false)} />
                      <div className="tc-dir-menu" role="menu">
                        {groups.filter((g) => g.folders.length).map((g) => (
                          <div key={g.id} role="group" aria-label={g.name}>
                            <div className="tc-dir-g">{g.name}</div>
                            {g.folders.map((fo) => (
                              <button key={fo.path} type="button" role="menuitemradio" aria-checked={fo.path === dir} className={fo.path === dir ? 'on' : ''} title={fo.path} onClick={() => pick(fo.path)}>
                                <b>{name(fo.path)}</b><small>{fo.path}</small>
                              </button>
                            ))}
                          </div>
                        ))}
                        <button type="button" role="menuitem" className="tc-dir-o" onClick={() => void ui.run('folder:pick').then((p) => { if (p) pick(p); else setDirOpen(false) })}>📂 Elegir otra carpeta…</button>
                      </div>
                    </>
                  )}
                </div>
              )
            })()}
            <div className="tc-log" ref={logRef} aria-live="polite">
              {log.length === 0 && !routing && needle && <div className="tc-empty"><b>Sin resultados</b><p>Nada coincide con «{q}».</p></div>}
              {log.length === 0 && !routing && !needle && (
                <div className="tc-empty">
                  <span aria-hidden>🛰️</span>
                  <b>Pide algo al equipo</b>
                  <p>Describe lo que necesitas y se asigna solo al agente adecuado. Para elegirlo tú, empieza con <code>@nombre</code>.</p>
                </div>
              )}
              {log.map((m) => {
                const a = byId(m.agentId)
                if (m.role === 'user') return (
                  <div key={m.id} className="tc-msg me">
                    {m.attachments?.length ? <AttachmentList items={m.attachments} /> : null}
                    {m.text && <p>{m.text}</p>}
                    <div className="tc-act">
                      <button title="Copiar" onClick={() => copyMsg(m.text)}>Copiar</button>
                      <button title="Volver a ponerlo en el cuadro de texto" onClick={() => setDraft(m.text)}>Editar</button>
                      <button title="Eliminar" onClick={() => delMsg(m.id)}>Eliminar</button>
                    </div>
                  </div>
                )
                if (m.role === 'system' && m.text) return <div key={m.id} className="tc-note">{m.text}</div>
                if (m.role === 'system')
                  return (
                    <div key={m.id} className="tc-route" style={{ ['--c' as string]: a?.color ?? 'var(--accent)' }}>
                      <span>→ {a ? `${a.emoji} ${a.name}` : 'Agente eliminado'}</span>
                      {m.reason && <small>{m.reason}</small>}
                    </div>
                  )
                return (
                  <div key={m.id} className="tc-msg bot" style={{ ['--c' as string]: a?.color ?? 'var(--accent)' }}>
                    <span className="tc-av" aria-hidden>{a?.emoji ?? '🤖'}</span>
                    <div>
                      <b>{a?.name ?? 'Agente'}</b>
                      <div className="tc-md"><Markdown text={m.text} /></div>
                      <div className="tc-act">
                        <button onClick={() => copyMsg(m.text)}>Copiar</button>
                        <button disabled={!!(chatWork || routing) || !prevUser(m.id)} onClick={() => retry(m)}>Reintentar</button>
                        <span className="tm-popwrap">
                          <button aria-haspopup="true" aria-expanded={fwd === m.id} onClick={() => setFwd(fwd === m.id ? '' : m.id)}>Enviar a…</button>
                          {fwd === m.id && (
                            <div className="rs-pop" role="menu">
                              {team.agents.filter((x) => x.id !== m.agentId).map((x) => <button key={x.id} role="menuitem" onClick={() => forward(m, x.id)}>{x.emoji} {x.name}</button>)}
                            </div>
                          )}
                        </span>
                        <button onClick={() => delMsg(m.id)}>Eliminar</button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {routing && <div className="tc-status"><span className="tc-dots"><i /><i /><i /></span>Buscando al agente adecuado…</div>}
              {chatWork && (() => {
                const a = byId(chatWork)
                return (
                  <div className="tc-status work" style={{ ['--c' as string]: a?.color ?? 'var(--accent)' }}>
                    <span className="tc-av spin" aria-hidden>{a?.emoji}</span>
                    <span className="tc-st-txt"><b>{a?.name}</b><small>{progress || 'está trabajando…'}</small></span>
                    <span className="tc-st-act"><code>{elapsed}</code><button className="btn sm danger" onClick={stop}>■ Detener</button></span>
                  </div>
                )
              })()}
            </div>
            {suggs.length > 0 && (
              <div className="tc-sugg" role="listbox" aria-label="Sugerencias">
                {suggs.map((g, i) => (
                  <button key={g.key} role="option" aria-selected={i === sugg % suggs.length} className={i === sugg % suggs.length ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); g.apply() }}>
                    <span>{g.label}</span><small>{g.hint}</small>
                  </button>
                ))}
              </div>
            )}
            <div className="tc-mentions">
              {team.agents.map((a) => (
                <button key={a.id} style={{ ['--c' as string]: a.color }} title={`Asignar a ${a.name}`} onClick={() => {
                  // cambia la mención actual en vez de acumular varias
                  const cur = mentioned(draft)
                  setDraft(`@${a.name} ${cur ? draft.slice(cur.name.length + 1).trimStart() : draft}`)
                }}>
                  {a.emoji} {a.name}
                </button>
              ))}
            </div>
            <div className={`tc-comp ${dragging ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
              {files.length > 0 && <AttachmentList items={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />}
              <textarea
                value={draft}
                rows={2}
                placeholder="¿Qué necesitas? Ej.: revisa la seguridad del login…"
                onChange={(e) => { setDraft(e.target.value); setSugg(0) }}
                onPaste={onPaste}
                onKeyDown={(e) => {
                  if (suggs.length) {
                    const cur = suggs[sugg % suggs.length]
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setSugg(sugg + (e.key === 'ArrowDown' ? 1 : suggs.length - 1)); return }
                    // Tab siempre completa; Enter completa salvo que el comando ya esté escrito entero (entonces se ejecuta)
                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && draft !== cur.key)) { e.preventDefault(); cur.apply(); return }
                  }
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
                }}
              />
              <div className="tc-hint">{mentioned(draft) ? `Irá a ${mentioned(draft)?.name}` : 'Se asigna solo · @ agente · / comandos'}</div>
              <div className="tc-comp-f">
                <button className="ib clip" title="Adjuntar archivos o fotos (también puedes pegar o arrastrar)" aria-label="Adjuntar" onClick={() => void pickFiles()}><G n="files" size={16} /></button>
                <span className="tc-sp" />
                {all.length > 0 && <button className="btn sm" disabled={!!(routing || chatWork)} onClick={() => update(mapConv(team, activeId, (c) => ({ ...c, msgs: [] })))}>Limpiar</button>}
                <button className="btn primary sm" disabled={(!draft.trim() && !files.length) || routing || !!chatWork || !team.agents.length} onClick={() => void send()}>Enviar</button>
              </div>
              <p className="tc-hint">{mentioned(draft) ? `Irá a ${mentioned(draft)?.name}` : 'Se asigna automáticamente · Mayús+Enter: nueva línea'}</p>
            </div>
          </div>
        ) : agent ? (
          <>
            <div className="tm-edit-h" style={{ ['--c' as string]: agent.color }}>
              <span className="ic bot-prev"><Robot a={agent} state={agent.id === working ? 'work' : 'idle'} size={52} /></span>
              <span><b>{agent.name || 'Sin nombre'}</b><small>{agent.model} · {agent.skills.length} skill{agent.skills.length === 1 ? '' : 's'}</small></span>
              <div className="tm-popwrap tm-more">
                <button className="btn sm" aria-label="Más acciones" aria-haspopup="true" aria-expanded={pop === 'more'} onClick={() => { setConfirmDel(false); setPop(pop === 'more' ? '' : 'more') }}>⋯</button>
                {pop === 'more' && (
                  <div className="rs-pop right" role="menu">
                    {confirmDel
                      ? <button role="menuitem" className="danger" onClick={removeAgent}>Sí, eliminar «{agent.name}»</button>
                      : <button role="menuitem" className="danger" onClick={() => setConfirmDel(true)}>Eliminar agente…</button>}
                  </div>
                )}
              </div>
            </div>
            <div className="tm-subtabs" role="tablist" aria-label="Secciones del agente" onKeyDown={(e) => {
              const ks = ['id', 'brain', 'test'] as const
              const i = ks.indexOf(sub)
              const n = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : -1
              if (n < 0) return
              e.preventDefault()
              setSub(ks[n])
              requestAnimationFrame(() => (document.getElementById(`sub-${ks[n]}`) as HTMLElement | null)?.focus())
            }}>
              {([['id', 'Identidad'], ['brain', 'Cerebro'], ['test', 'Probar']] as const).map(([k, l]) => (
                <button key={k} id={`sub-${k}`} role="tab" aria-selected={sub === k} aria-controls="sub-panel" tabIndex={sub === k ? 0 : -1} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>{l}</button>
              ))}
            </div>
            <div id="sub-panel" role="tabpanel" aria-labelledby={`sub-${sub}`}>
            {sub === 'id' && <>
            <details className="tm-look" open>
              <summary>Apariencia del robot <button type="button" className="btn sm" onClick={(e) => { e.preventDefault(); randomBot() }}>🎲 Aleatorio</button></summary>
              {field('Color', swatches(COLORS, agent.color, (color) => setAgent({ color }), 'Color del agente'))}
              {field('Cabeza', opts(HEADS, agent.look?.head ?? 'redonda', (head) => setLook({ head })))}
              {field('Ojos', opts(BOT_EYES, agent.look?.eyes ?? 'pixel', (eyes) => setLook({ eyes })))}
              {field('Antena', opts(ANTENNAS, agent.look?.antenna ?? 'bola', (antenna) => setLook({ antenna })))}
              {field('Accesorio', opts(BOT_ACC, agent.look?.acc ?? 'ninguno', (acc) => setLook({ acc })))}
            </details>
            <label>Nombre y emoji</label>
            <div className="tm-row"><input className="tm-emoji" aria-label="Emoji" value={agent.emoji} onChange={(e) => setAgent({ emoji: Array.from(e.target.value).slice(0, 2).join('') })} /><input aria-label="Nombre" value={agent.name} maxLength={40} onChange={(e) => setAgent({ name: e.target.value })} /></div>
            </>}
            {sub === 'brain' && <>
            <label>Modelo</label>
            {opts(MODELS.map((m) => [m, m[0].toUpperCase() + m.slice(1)] as [TeamAgent['model'], string]), agent.model, (model) => setAgent({ model }))}
            <p className="tm-costhint">{agent.model === 'haiku' ? 'Rápido y barato: tareas cortas.' : agent.model === 'opus' ? 'El más capaz y el que más consume: úsalo solo si hace falta.' : 'Equilibrado: la opción recomendada.'}</p>
            <label>Instrucciones (prompt de sistema)</label>
            <textarea value={agent.prompt} onChange={(e) => setAgent({ prompt: e.target.value })} />
            <label>Permisos y carpeta</label>
            <label className="tm-check">
              <input type="checkbox" checked={!!agent.canEdit} onChange={(e) => setAgent({ canEdit: e.target.checked })} /> Puede modificar código
            </label>
            {agent.canEdit && (
              <div className="tm-warn" role="note">
                <p>⚠️ Este agente <b>lee y edita archivos</b> de la carpeta elegida sin pedir confirmación (solo puede ejecutar git de lectura y typecheck). Revisa el diff antes de hacer commit.</p>
              </div>
            )}
            <p className="tm-hint">{agent.canEdit ? 'Donde este agente edita archivos.' : 'Opcional: carpeta que el agente puede leer (sin editar). Si la dejas vacía usa la del agente que modifica código.'}</p>
        {groups.some((g) => g.folders.length > 0) && (
          <select aria-label="Grupo de carpetas" className="tm-groupsel" value={groups.some((g) => g.folders.some((f) => f.path === agent.workdir)) ? agent.workdir : ''} onChange={(e) => e.target.value && setAgent({ workdir: e.target.value })}>
            <option value="">Elegir de un grupo de carpetas…</option>
            {groups.filter((g) => g.folders.length > 0).map((g) => (
              <optgroup key={g.id} label={g.name}>
                {g.folders.map((f) => <option key={g.id + f.path} value={f.path}>{f.path.split(/[\\/]/).filter(Boolean).slice(-2).join('/')}{f.access === 'read' ? ' (solo lectura)' : ''}</option>)}
              </optgroup>
            ))}
          </select>
        )}
        <div className="tm-row">
          <input aria-label="Carpeta de trabajo" readOnly value={agent.workdir ?? ''} placeholder="Elige la carpeta del proyecto…" />
          <button type="button" className="btn" onClick={() => void ui.run('folder:pick').then((p) => p && setAgent({ workdir: p }))}>Elegir…</button>
        </div>
            <label>Documentos de referencia</label>
            <p className="tm-hint">Archivos que el agente lee en cada encargo (p. ej. una estimación anterior o una guía de cubicación).</p>
            {(agent.refs?.length ?? 0) > 0 && <AttachmentList items={agent.refs ?? []} onRemove={(i) => setAgent({ refs: (agent.refs ?? []).filter((_, j) => j !== i) })} />}
            <div className="tm-row"><button type="button" className="btn" onClick={() => void addRefs()}><G n="files" size={14} /> Añadir documentos…</button></div>
            <label>Skills</label>
            <p className="tm-hint">El agente las usará cuando la tarea encaje. Solo aparecen las instaladas.</p>
            <div className="tm-skills">
              {installed.map((s) => {
                const on = agent.skills.includes(s.name)
                return (
                  <button key={s.name} type="button" aria-pressed={on} title={s.description} className={'tm-skill' + (on ? ' on' : '')} onClick={() => setAgent({ skills: on ? agent.skills.filter((x) => x !== s.name) : [...agent.skills, s.name] })}>
                    <b>{s.name}</b><small>{s.description}</small>
                  </button>
                )
              })}
              {agent.skills.filter((n) => !installed.some((s) => s.name === n)).map((n) => (
                <button key={n} type="button" aria-pressed className="tm-skill on missing" title="No instalada: quítala o instálala desde el catálogo" onClick={() => setAgent({ skills: agent.skills.filter((x) => x !== n) })}>
                  <b>{n}</b><small>No instalada · pulsa para quitar</small>
                </button>
              ))}
            </div>
            <div className="tm-row"><button type="button" className="btn" onClick={() => void window.api.call('window:skills')}>Gestionar skills…</button></div>
            {(agent.id === 'estimador' || agent.skills.includes('cubicación')) && (
              <details className="tm-look" open>
                <summary>Plantillas de estimación</summary>
                <small>El agente usa la técnica o la comercial según lo que pidas (escribe «técnica» o «comercial» en el encargo).</small>
                {ESTIMATE_LEVELS.map(([lvl, label]) => {
                  const custom = team.estimateTemplates?.[lvl]
                  const setTpl = (v: string | undefined): void => update({ ...team, estimateTemplates: { ...team.estimateTemplates, [lvl]: v } })
                  return (
                    <div key={lvl}>
                      <label>{label} {custom?.trim() ? '(personalizada)' : '(por defecto)'}</label>
                      <textarea value={custom ?? DEFAULT_ESTIMATE_TEMPLATES[lvl]} style={{ minHeight: 120 }} onChange={(e) => setTpl(e.target.value)} />
                      <div className="tm-row">
                        <label className="btn sm">
                          Cargar archivo…
                          <input type="file" accept=".md,.txt,.csv,text/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void f.text().then(setTpl) }} />
                        </label>
                        <button className="btn sm" disabled={!custom?.trim()} onClick={() => setTpl(undefined)}>Restaurar por defecto</button>
                      </div>
                    </div>
                  )
                })}
              </details>
            )}
            </>}
            {sub === 'test' && <>
            <label>Encargo de prueba</label>
            <textarea value={msg} placeholder="Escribe un encargo para este agente…" onChange={(e) => setMsg(e.target.value)} style={{ minHeight: 96 }} />
            <div className="tm-row">
              <button className="btn primary" disabled={busy || !msg.trim()} onClick={() => void ask()}>{busy ? 'Pensando…' : 'Enviar'}</button>
              {agent.id === 'qa' && (
                <button className="btn" disabled={busy} title="Prueba en la app aislada lo que cambió (diff). Gasta tokens: solo a petición." onClick={() => void runQa()}>{busy ? 'Probando…' : '🧪 Probar este commit'}</button>
              )}
            </div>
            {reply && <pre className="tm-reply">{reply}</pre>}
            </>}
            </div>
          </>
        ) : (
          <div className="tm-empty">
            <span aria-hidden>🤖</span>
            <b>Aún no hay agentes</b>
            <p>Crea uno, dale instrucciones y skills, y pruébalo aquí mismo.</p>
            <button className="btn primary" onClick={addAgent}>+ Crear agente</button>
          </div>
        )}
      </section>
    </div>
  )
}
