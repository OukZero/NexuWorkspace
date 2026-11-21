import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent, ReactNode } from 'react'
import type { AgentTeam, RobotLook, TeamAgent, TeamCharacter, TeamChatMsg, TeamProp } from '../../../shared/types'
import { AGENT_TEMPLATES, ORCHESTRATOR_ID } from '../../../shared/teamTemplates'
import { useUi } from '../ui'
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
const SKILLS = ['review', 'seguridad', 'cubicación', 'leer-repo', 'tests', 'git', 'web']
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
function Room({ team, working, routing, done, sel, onSel, onProps, onDrop }: {
  team: AgentTeam; working?: string; routing?: boolean; done?: string; sel: string
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
          <div key={a.id} className={`tr-desk ${st}`} style={{ left: `${left}%`, top: `${top}%`, ['--ds' as string]: two ? 0.72 : 1, ['--c' as string]: a.color, zIndex: 40 + row }}>
            {/* al trabajar: foco desde arriba, anillo en el suelo y código que sale del portátil */}
            {st === 'work' && <><i className="tr-beam" /><i className="tr-ping" /><div className="tr-fx" aria-hidden><i>{'{ }'}</i><i>&lt;/&gt;</i><i>01</i><i>✦</i></div></>}
            {st !== 'idle' && <div className="tr-bubble">{st === 'work' ? <><i /><i /><i /></> : '✓ listo'}</div>}
            <Robot a={a} state={st} />
            <div className="tr-top"><div className="tr-lap"><span /><span /><span /></div></div>
            <div className="tr-legs"><i /><i /></div>
            <small className="tr-tag">{a.name}</small>
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
function withProps(t0: AgentTeam): AgentTeam {
  // la barba antes era un «accesorio»; ahora es vello facial y deja libre el accesorio
  const t = t0.character.gear === 'barba' ? { ...t0, character: { ...t0.character, gear: 'ninguno' as const, facial: 'barba' as const } } : t0
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
  const [tab, setTab] = useState<'chat' | 'edit'>('chat')
  const [charTab, setCharTab] = useState<'cara' | 'pelo' | 'ropa'>('cara')
  const [draft, setDraft] = useState('')
  const [routing, setRouting] = useState(false)
  const [chatWork, setChatWork] = useState('')
  const [since, setSince] = useState(0)
  const [, tick] = useState(0)
  const logRef = useRef<HTMLDivElement>(null)
  const teamRef = useRef<AgentTeam | null>(null)
  teamRef.current = team
  const chatLen = team?.chat?.length ?? 0

  // baja al último mensaje cuando llega uno nuevo o cambia el estado del agente
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chatLen, chatWork, routing, tab])
  // cronómetro del agente que trabaja (solo repinta mientras hay trabajo)
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

  // ---- chat general: la solicitud se asigna sola al agente adecuado (o al que menciones con @) ----
  const pushChat = (m: Omit<TeamChatMsg, 'id' | 'at'>): void => {
    const t = teamRef.current
    if (!t) return
    update({ ...t, chat: [...(t.chat ?? []), { ...m, id: Math.random().toString(36).slice(2, 9), at: Date.now() }].slice(-60) })
  }
  const mentioned = (text: string): TeamAgent | undefined => {
    const low = text.toLowerCase()
    return [...team.agents].sort((a, b) => b.name.length - a.name.length).find((a) => low.startsWith(`@${a.name.toLowerCase()}`))
  }
  const send = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || routing || chatWork) return
    setDraft('')
    pushChat({ role: 'user', text })
    const forced = mentioned(text)
    const body = forced ? text.slice(forced.name.length + 1).trim() || text : text
    let route: { agentId: string; reason: string } | undefined
    if (forced) route = { agentId: forced.id, reason: 'Lo mencionaste con @' }
    else {
      setRouting(true)
      try {
        route = (await ui.run('team:route', text)) ?? undefined
      } finally {
        setRouting(false)
      }
    }
    if (!route) return
    pushChat({ role: 'system', text: '', agentId: route.agentId, reason: route.reason })
    setChatWork(route.agentId)
    setSince(Date.now())
    try {
      if (route.agentId === ORCHESTRATOR_ID) {
        // el orquestador reparte el trabajo: cada paso aparece como instrucción + respuesta del agente, y al final su resumen
        const o = await ui.run('team:orchestrate', body)
        if (o) {
          for (const s of o.steps) {
            pushChat({ role: 'system', text: '', agentId: s.agentId, reason: s.instruction.slice(0, 200) })
            pushChat({ role: 'agent', text: s.output, agentId: s.agentId })
          }
          if (o.summary) pushChat({ role: 'agent', text: o.summary, agentId: ORCHESTRATOR_ID })
          setDone(ORCHESTRATOR_ID)
        }
        return
      }
      const r = await ui.run('team:ask', route.agentId, body)
      if (typeof r === 'string') {
        pushChat({ role: 'agent', text: r, agentId: route.agentId })
        setDone(route.agentId)
      }
    } finally {
      setChatWork('')
    }
  }
  const byId = (id?: string): TeamAgent | undefined => team.agents.find((a) => a.id === id)
  const secs = chatWork ? Math.floor((Date.now() - since) / 1000) : 0
  const elapsed = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  const log = team.chat ?? []
  const working = chatWork || (busy ? sel : undefined)

  const opts = <T extends string>(list: Array<[T, string]>, cur: T, on: (v: T) => void): ReactNode => (
    <div className="tm-opts">{list.map(([v, l]) => <button key={v} className={cur === v ? 'on' : ''} onClick={() => on(v)}>{l}</button>)}</div>
  )
  // muestras de color + selector libre (el último círculo abre el selector del sistema)
  const swatches = (list: string[], cur: string | undefined, on: (v: string) => void, label: string): ReactNode => {
    const custom = !!cur && !list.includes(cur)
    return (
      <div className="tm-sw">
        {list.map((s) => <button key={s} type="button" style={{ background: s }} className={cur === s ? 'on' : ''} aria-label={`${label} ${s}`} aria-pressed={cur === s} onClick={() => on(s)} />)}
        <label className={`tm-sw-custom ${custom ? 'on' : ''}`} title="Color personalizado" style={custom ? { background: cur } : undefined}>
          <input type="color" value={cur && /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#888888'} onChange={(e) => on(e.target.value)} aria-label={`${label}: color personalizado`} />
        </label>
      </div>
    )
  }
  const ch = team.character
  const field = (label: string, body: ReactNode): ReactNode => <div className="tm-field"><span className="tm-lbl">{label}</span>{body}</div>

  return (
    <div className="tm-wrap">
      <section className="card tm-char">
        <div className="eyebrow">Tu personaje</div>
        <div className="tm-stage"><Avatar c={team.character} size={170} live="idle" /></div>
        <input className="tm-name" value={team.character.name} onChange={(e) => setChar({ name: e.target.value })} aria-label="Nombre del personaje" />
        <input className="tm-name sub" value={team.character.role} onChange={(e) => setChar({ role: e.target.value })} aria-label="Rol del personaje" />
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
        <button className="btn tm-rand" onClick={random}>🎲 Aleatorio</button>
      </section>

      <section className="card tm-mid">
        <div className="eyebrow">La sala <span className="tm-hint">arrastra los objetos donde quieras</span></div>
        <Room
          team={team}
          working={working}
          routing={routing}
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
        <div className="tm-agents-h">
          <div className="eyebrow">Agentes <span className="tm-count">{team.agents.length}</span></div>
          <button className="btn primary sm" onClick={addAgent}>+ Nuevo agente</button>
        </div>
        <div className="tm-agents">
          {team.agents.map((a) => (
            <button key={a.id} className={`tm-agent ${a.id === sel ? 'on' : ''} ${a.id === working ? 'busy' : ''}`} style={{ ['--c' as string]: a.color }} onClick={() => { setSel(a.id); setReply(''); setTab('edit') }}>
              <span className="ic">{a.emoji}</span>
              <span className="tm-ag-body"><b title={a.name}>{a.name}</b><span className="sk">{a.skills.map((s) => <span key={s}>{s}</span>)}</span></span>
              <span className="st">{a.id === working ? 'trabajando…' : a.model}</span>
            </button>
          ))}
        </div>
        {missingTpl.length > 0 && (
          <div className="tm-tpl">
            <span className="tm-tpl-h">Añadir un agente listo:</span>
            {missingTpl.map((t) => (
              <button key={t.id} style={{ ['--c' as string]: t.color }} title={t.prompt} onClick={() => addTemplate(t)}>
                <span aria-hidden>{t.emoji}</span> {t.name}
              </button>
            ))}
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
            <div className="tc-log" ref={logRef} aria-live="polite">
              {log.length === 0 && !routing && (
                <div className="tc-empty">
                  <span aria-hidden>🛰️</span>
                  <b>Pide algo al equipo</b>
                  <p>Describe lo que necesitas y se asigna solo al agente adecuado. Para elegirlo tú, empieza con <code>@nombre</code>.</p>
                </div>
              )}
              {log.map((m) => {
                const a = byId(m.agentId)
                if (m.role === 'user') return <div key={m.id} className="tc-msg me"><p>{m.text}</p></div>
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
                    <div><b>{a?.name ?? 'Agente'}</b><p>{m.text}</p></div>
                  </div>
                )
              })}
              {routing && <div className="tc-status"><span className="tc-dots"><i /><i /><i /></span>Buscando al agente adecuado…</div>}
              {chatWork && (() => {
                const a = byId(chatWork)
                return (
                  <div className="tc-status work" style={{ ['--c' as string]: a?.color ?? 'var(--accent)' }}>
                    <span className="tc-av spin" aria-hidden>{a?.emoji}</span>
                    <span><b>{a?.name}</b> está trabajando…</span>
                    <code>{elapsed}</code>
                  </div>
                )
              })()}
            </div>
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
            <div className="tc-comp">
              <textarea
                value={draft}
                rows={3}
                placeholder="¿Qué necesitas? Ej.: revisa la seguridad del login…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
              />
              <div className="tc-comp-f">
                <span>{mentioned(draft) ? `Irá a ${mentioned(draft)?.name}` : 'Se asigna automáticamente · Mayús+Enter: nueva línea'}</span>
                {log.length > 0 && <button className="btn sm" disabled={!!(routing || chatWork)} onClick={() => update({ ...team, chat: [] })}>Limpiar</button>}
                <button className="btn primary sm" disabled={!draft.trim() || routing || !!chatWork || !team.agents.length} onClick={() => void send()}>Enviar</button>
              </div>
            </div>
          </div>
        ) : agent ? (
          <>
            <div className="tm-edit-h" style={{ ['--c' as string]: agent.color }}>
              <span className="ic bot-prev"><Robot a={agent} state={agent.id === working ? 'work' : 'idle'} size={52} /></span>
              <span><b>{agent.name || 'Sin nombre'}</b><small>{agent.model} · {agent.skills.length} skill{agent.skills.length === 1 ? '' : 's'}</small></span>
            </div>
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
            <label>Modelo</label>
            {opts(MODELS.map((m) => [m, m[0].toUpperCase() + m.slice(1)] as [TeamAgent['model'], string]), agent.model, (model) => setAgent({ model }))}
            <label>Instrucciones (prompt de sistema)</label>
            <textarea value={agent.prompt} onChange={(e) => setAgent({ prompt: e.target.value })} />
            <label>Skills asignadas</label>
            <div className="tm-opts">{SKILLS.map((s) => <button key={s} className={agent.skills.includes(s) ? 'on' : ''} onClick={() => setAgent({ skills: agent.skills.includes(s) ? agent.skills.filter((x) => x !== s) : [...agent.skills, s] })}>{s}</button>)}</div>
            <label>Probar</label>
            <textarea value={msg} placeholder="Escribe un encargo para este agente…" onChange={(e) => setMsg(e.target.value)} style={{ minHeight: 96 }} />
            <div className="tm-row">
              <button className="btn primary" disabled={busy || !msg.trim()} onClick={() => void ask()}>{busy ? 'Pensando…' : 'Enviar'}</button>
              <button className="btn" onClick={removeAgent}>Eliminar</button>
            </div>
            {reply && <pre className="tm-reply">{reply}</pre>}
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
