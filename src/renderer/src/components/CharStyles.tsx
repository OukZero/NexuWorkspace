import type { ReactNode } from 'react'
import type { TeamAgent, TeamCharacter } from '../../../shared/types'

/** Estilos alternativos de dibujo (chibi, plano, pixel, kawaii). Usan las mismas clases av-* / bot-* que el clásico para heredar sus animaciones. */

// color base de cada prenda si el usuario no eligió uno propio
export const OUTFIT_COLOR: Record<TeamCharacter['outfit'], string> = { sudadera: '#5b73f0', polera: '#ff7a9c', camisa: '#d6dbea', chaqueta: '#2fbf8a', traje: '#2b3150', bata: '#f4f6fc', capucha: '#8a6cf0', overol: '#d6dbea', delantal: '#ffb347', bufanda: '#5b73f0', rayas: '#f4f6fc', hawaiana: '#2fbf8a', vestido: '#ff7a9c', kimono: '#8a5ad8', armadura: '#8a92aa', camiseta: '#2b3150' }
type Gear = TeamCharacter['gear']
/** Color base de cada accesorio (los que usan el pelo o la ropa no tienen uno fijo). */
export const GEAR_COLOR: Partial<Record<Gear, string>> = { lentes: '#16182a', sol: '#16182a', audifonos: '#8fa4ff', aretes: '#ffd166', lazo: '#ff7a9c', halo: '#ffd166', corona: '#ffd166', bandana: '#e0443e', sombrero: '#2b2f4a', cinta: '#ff7a9c', mascarilla: '#e8ebf4', parche: '#16182a', collar: '#ffd166', flor: '#ff7a9c', cuernos: '#ff5d5d', monoculo: '#ffd166' }
/** Oscurece un #rrggbb (sombra de la ropa y los dos tonos del estilo plano). */
export const darken = (hex: string, f = 0.72): string => {
  const n = parseInt(hex.slice(1), 16)
  if (Number.isNaN(n) || hex.length !== 7) return hex
  const ch = (s: number): string => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0')
  return `#${ch(16)}${ch(8)}${ch(0)}`
}

export type Live = 'idle' | 'work' | 'type'
type Props = Record<string, string | number>
const OL = '#12142a'
const HAIR_COLOR = '#2b2f4a'

/** Teclado que aparece al escribir; las teclas se encienden en desorden. */
function Keyboard({ skin }: { skin: string }): ReactNode {
  return (
    <g className="av-kb">
      <rect x="22" y="147" width="106" height="21" rx="6" fill="#222740" stroke="#8fa4ff" strokeOpacity=".5" />
      {[0, 1, 2].flatMap((r) => Array.from({ length: 9 }, (_, k) => (
        <rect key={`${r}-${k}`} className="av-key" x={30 + k * 10 + (r === 1 ? 2 : r === 2 ? 4 : 0)} y={150.5 + r * 5.4} width="8" height="4" rx="1.2" fill="#8fa4ff" style={{ animationDelay: `${((r * 9 + k) * 37 % 100) * 0.006}s` }} />
      )))}
      <circle className="av-hand l" cx="54" cy="146" r="6.5" fill={skin} stroke="rgba(0,0,0,.18)" />
      <circle className="av-hand r" cx="96" cy="146" r="6.5" fill={skin} stroke="rgba(0,0,0,.18)" />
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* Chibi / plano / kawaii: mismo esqueleto vectorial, distinta forma de dibujar */
/* ------------------------------------------------------------------ */

type Mode = 'chibi' | 'plano' | 'kawaii'

function hairBack(c: TeamCharacter, hc: string, S: Props): ReactNode {
  return (
    <>
      {c.hair === 'rizado' && <g fill={hc} {...S}>{[36, 48, 60, 75, 90, 102, 114].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 40 : 46} r="14" />)}<rect x="36" y="46" width="78" height="30" rx="14" stroke="none" /></g>}
      {c.hair === 'largo' && <path d="M32 58 q-8 52 6 72 h74 q14 -20 6 -72z" fill={hc} {...S} />}
      {c.hair === 'mono' && <circle cx="75" cy="12" r="12" fill={hc} {...S} />}
    </>
  )
}

function hairFront(c: TeamCharacter, hc: string, S: Props): ReactNode {
  return (
    <>
      {(c.hair === 'corto' || c.hair === 'largo' || c.hair === 'mono') && <><path d="M34 56 q-2 -44 41 -44 q43 0 41 44 q-8 -22 -26 -26 q-14 10 -30 5 q-16 -1 -26 21z" fill={hc} {...S} /><path d="M54 20 q12 -6 26 -2" stroke="#fff" strokeOpacity=".28" strokeWidth="3" fill="none" strokeLinecap="round" /></>}
      {c.hair === 'rizado' && <g fill={hc} {...S}>{[46, 60, 75, 90, 104].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 28 : 32} r="14" />)}</g>}
      {c.hair === 'rapado' && <path d="M38 52 q0 -34 37 -34 q37 0 37 34 q-8 -16 -37 -16 q-29 0 -37 16z" fill={hc} opacity=".55" />}
      {c.hair === 'cresta' && <path d="M64 30 l-5 -14 l9 4 l7 -20 l7 20 l9 -4 l-5 14 q-11 -5 -22 0z" fill={hc} {...S} />}
      {c.hair === 'gorro' && <><path d="M36 54 q2 -42 39 -42 q37 0 39 42z" fill="#5fe3b4" {...S} /><rect x="34" y="48" width="82" height="12" rx="6" fill="#2fbf8a" {...S} /><circle cx="75" cy="8" r="7" fill="#e8ebf4" {...S} /></>}
    </>
  )
}

/** Un accesorio concreto con su color (`col` ya resuelto: el elegido o el propio). Se llama para gear y gear2. */
function gearPiece(g: Gear, col: string, hc: string, o1: string, o2: string, S: Props, ears: boolean): ReactNode {
  const dk = darken(col, 0.65)
  switch (g) {
    case 'aretes': return ears ? <g fill={col} stroke={dk}><circle cx="35" cy="72" r="3" /><circle cx="115" cy="72" r="3" /></g> : null
    case 'orejas': return <g><path d="M42 30 l-6 -26 l24 14z" fill={hc} {...S} /><path d="M108 30 l6 -26 l-24 14z" fill={hc} {...S} /><path d="M43 24 l-3 -12 l11 7z M107 24 l3 -12 l-11 7z" fill={col} /></g>
    case 'lazo': return <g className="av-bow"><path d="M44 26 l-16 -10 v20z M44 26 l16 -10 v20z" fill={col} stroke={dk} strokeWidth="1.8" strokeLinejoin="round" /><circle cx="44" cy="26" r="4" fill={dk} /></g>
    case 'halo': return <ellipse className="av-halo" cx="75" cy="10" rx="24" ry="6" fill="none" stroke={col} strokeWidth="4" />
    case 'corona': return <path d="M50 28 l3 -22 l13 11 l9 -16 l9 16 l13 -11 l3 22z" fill={col} stroke={dk} strokeWidth="2" strokeLinejoin="round" />
    case 'lentes': return <g fill="rgba(143,164,255,.22)" stroke={col} strokeWidth="3"><rect x="47" y="52" width="26" height="22" rx="7" /><rect x="77" y="52" width="26" height="22" rx="7" /><path d="M73 61 h4" /></g>
    case 'sol': return <><g fill={col} stroke={col} strokeWidth="3"><rect x="47" y="54" width="26" height="18" rx="7" /><rect x="77" y="54" width="26" height="18" rx="7" /><path d="M73 61 h4" /></g><path d="M52 59 h7 M82 59 h7" stroke="#fff" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" /></>
    case 'audifonos': return <g fill="none" stroke={col} strokeWidth="5" strokeLinecap="round"><path d="M36 62 q0 -46 39 -46 q39 0 39 46" /><rect x="29" y="56" width="11" height="22" rx="5" fill={dk} stroke="none" /><rect x="110" y="56" width="11" height="22" rx="5" fill={dk} stroke="none" /></g>
    case 'gorra': return <><path d="M35 52 q0 -40 40 -40 q40 0 40 40z" fill={col} {...S} /><path d="M35 52 q40 -8 80 0" stroke={dk} strokeWidth="3" fill="none" /><path d="M80 50 q26 -4 46 6 q-22 4 -46 0z" fill={dk} {...S} /></>
    case 'bandana': return <><path d="M36 40 q39 -16 78 0 l0 10 q-39 -14 -78 0z" fill={col} {...S} /><path d="M112 42 l14 -4 l-3 12z" fill={col} {...S} /></>
    case 'sombrero': return <><ellipse cx="75" cy="36" rx="48" ry="8" fill={col} {...S} /><path d="M50 36 q0 -32 25 -32 q25 0 25 32z" fill={col} {...S} /><rect x="50" y="28" width="50" height="6" fill={dk} /></>
    case 'cinta': return <path d="M36 42 q39 -14 78 0" fill="none" stroke={col} strokeWidth="6" strokeLinecap="round" />
    case 'mascarilla': return <><path d="M52 80 q23 -8 46 0 q-2 20 -23 22 q-21 -2 -23 -22z" fill={col} {...S} /><path d="M52 82 l-12 -6 M98 82 l12 -6" stroke={dk} strokeWidth="2" /></>
    case 'parche': return <><path d="M44 46 l62 14" stroke={dk} strokeWidth="2.5" /><ellipse cx="90" cy="62" rx="12" ry="10" fill={col} {...S} /></>
    case 'collar': return <><path d="M52 96 q23 16 46 0" fill="none" stroke={col} strokeWidth="3" /><circle cx="75" cy="108" r="5" fill={col} stroke={dk} strokeWidth="1.5" /></>
    case 'flor': return <g transform="translate(106 26)">{[0, 72, 144, 216, 288].map((a) => <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 7} cy={Math.sin((a * Math.PI) / 180) * 7} r="5.5" fill={col} stroke={dk} strokeWidth="1.2" />)}<circle r="4" fill="#ffd166" /></g>
    case 'cuernos': return <g fill={col} stroke={dk} strokeWidth="1.8" strokeLinejoin="round"><path d="M46 28 q-12 -4 -10 -22 q14 6 20 18z" /><path d="M104 28 q12 -4 10 -22 q-14 6 -20 18z" /></g>
    case 'monoculo': return <g fill="rgba(143,164,255,.2)" stroke={col} strokeWidth="3"><circle cx="90" cy="64" r="13" /><path d="M99 74 q6 16 2 28" fill="none" strokeWidth="1.8" /></g>
    default: return null
  }
}

export function gearLayer(c: TeamCharacter, hc: string, o1: string, o2: string, S: Props, ears: boolean): ReactNode {
  return (
    <>
      {c.gear !== 'ninguno' && c.gear !== 'barba' && gearPiece(c.gear, c.gearColor ?? GEAR_COLOR[c.gear] ?? '#ffd166', hc, o1, o2, S, ears)}
      {c.gear2 && c.gear2 !== 'ninguno' && c.gear2 !== 'barba' && c.gear2 !== c.gear && gearPiece(c.gear2, c.gear2Color ?? GEAR_COLOR[c.gear2] ?? '#ffd166', hc, o1, o2, S, ears)}
    </>
  )
}

/** Ropa sobre el torso; se dibuja para un cuello en y=98 y se desplaza con translate. */
export function outfitLayer(c: TeamCharacter, o1: string, o2: string): ReactNode {
  const shade = 'rgba(0,0,0,.14)'
  switch (c.outfit) {
    case 'sudadera': return <><path d="M62 98 q13 14 26 0 l-3 -5 q-10 9 -20 0z" fill={o2} /><path d="M69 108 v14 M81 108 v14" stroke="#e8ebf4" strokeWidth="2.5" strokeLinecap="round" /></>
    case 'camisa': return <><path d="M62 98 l13 14 l13 -14 l-5 -4 l-8 8 l-8 -8z" fill="#fff" /><path d="M75 112 l-4 6 l4 20 l4 -20z" fill="#ff7a9c" /></>
    case 'bata': return <><path d="M60 98 l15 22 l15 -22 l-7 -4 l-8 10 l-8 -10z" fill="#fff" stroke="#c9cfe0" /><rect x="84" y="120" width="12" height="11" rx="2" fill="none" stroke="#b6bdd0" /></>
    case 'polera': return <path d="M62 99 q13 9 26 0" stroke={o2} strokeWidth="5" fill="none" strokeLinecap="round" />
    case 'chaqueta': return <><path d="M63 98 l12 40 l12 -40z" fill="#e8ebf4" /><path d="M63 98 l12 40 M87 98 l-12 40" stroke={o2} strokeWidth="2.5" /></>
    case 'traje': return <><path d="M63 98 l12 26 l12 -26z" fill="#fff" /><path d="M75 104 l-3.5 5 l3.5 18 l3.5 -18z" fill="#c0392b" /><path d="M63 98 l12 26 l-10 -6z M87 98 l-12 26 l10 -6z" fill={o2} /></>
    case 'capucha': return <><path d="M54 104 q21 -14 42 0 v8 q-21 -14 -42 0z" fill={o2} /><path d="M69 112 v14 M81 112 v14" stroke="#e8ebf4" strokeWidth="2.5" strokeLinecap="round" /></>
    case 'overol': return <><rect x="62" y="118" width="26" height="24" rx="5" fill="#4a6fa5" /><path d="M64 100 v18 M86 100 v18" stroke="#4a6fa5" strokeWidth="6" /><circle cx="64" cy="118" r="2.2" fill="#ffd166" /><circle cx="86" cy="118" r="2.2" fill="#ffd166" /></>
    case 'delantal': return <><path d="M64 100 l-4 16 M86 100 l4 16" stroke="#e8ebf4" strokeWidth="3.5" strokeLinecap="round" /><rect x="60" y="116" width="30" height="26" rx="6" fill="#e8ebf4" /><rect x="68" y="126" width="14" height="8" rx="2" fill="none" stroke="#c9cfe0" /></>
    case 'bufanda': return <><path d="M56 98 q19 14 38 0 v10 q-19 14 -38 0z" fill="#ff7a9c" /><rect x="84" y="106" width="11" height="28" rx="4" fill="#e0557a" /><path d="M62 104 q13 9 26 0" stroke={shade} strokeWidth="2" fill="none" /></>
    case 'rayas': return <g stroke={darken(o1, 0.55)} strokeWidth="3.5">{[106, 116, 126, 136].map((y) => <path key={y} d={`M${50 + (y - 100) * 0.1} ${y} H${100 - (y - 100) * 0.1}`} />)}</g>
    case 'hawaiana': return <><path d="M62 98 l13 16 l13 -16 l-5 -4 l-8 8 l-8 -8z" fill={o2} /><g fill="#ffd166"><circle cx="58" cy="118" r="3" /><circle cx="90" cy="126" r="3" /><circle cx="72" cy="134" r="3" /></g><g fill="#ff7a9c"><circle cx="82" cy="112" r="2.5" /><circle cx="64" cy="128" r="2.5" /></g></>
    case 'vestido': return <><path d="M62 98 q13 12 26 0" stroke={o2} strokeWidth="4" fill="none" /><path d="M50 138 q25 8 50 0 l4 8 q-29 10 -58 0z" fill={o2} /><path d="M60 126 h30" stroke={o2} strokeWidth="3" /></>
    case 'kimono': return <><path d="M62 98 l22 40" stroke="#fff" strokeWidth="5" /><path d="M88 98 l-22 40" stroke={o2} strokeWidth="5" /><rect x="50" y="124" width="50" height="9" fill="#ffd166" /></>
    case 'armadura': return <><path d="M60 98 q15 12 30 0 v8 q-15 12 -30 0z" fill="#c9cfe0" stroke={shade} /><path d="M52 112 h46 M52 126 h46" stroke={o2} strokeWidth="2.5" /><circle cx="75" cy="119" r="4" fill="#ffd166" /></>
    case 'camiseta': return <path d="M62 98 q13 10 26 0" fill="none" stroke={o2} strokeWidth="3" />
    default: return null
  }
}

function BodyAvatar({ c, size, live, mode }: { c: TeamCharacter; size: number; live?: Live; mode: Mode }): ReactNode {
  const o1 = c.outfitColor ?? OUTFIT_COLOR[c.outfit] ?? '#5b73f0'
  const o2 = darken(o1)
  const hc = c.hairColor ?? HAIR_COLOR
  const eye = c.eyeColor ?? '#1a1c28'
  const facial = c.facial ?? (c.gear === 'barba' ? 'barba' : 'ninguno')
  const mouth = c.mouth ?? 'sonrisa'
  const mc = facial === 'barba' ? '#f2f4ff' : '#1a1c28'
  const S: Props = mode === 'chibi' ? { stroke: OL, strokeWidth: 2.6, strokeLinejoin: 'round', strokeLinecap: 'round' } : {}
  const kawaii = mode === 'kawaii'
  const hx = kawaii ? 45 : mode === 'chibi' ? 40 : 38
  const hy = kawaii ? 40 : 38
  const half = mode === 'plano'
  const torso = 'M48 142 q-4 -34 14 -44 h26 q18 10 14 44z'
  const bean = 'M38 168 q-2 -46 37 -70 q39 24 37 70z'
  const sk2 = darken(c.skin, 0.86)
  const ey = kawaii ? 66 : mode === 'chibi' ? 62 : 63
  const blush = (c.face === 'rubor' ? 0.55 : 0.28)
  return (
    <svg className={`av ${live ? `av-${live}` : ''}`} width={size} height={size * 1.13} viewBox="0 0 150 170" role="img" aria-label={`Personaje ${c.name}`}>
      <defs>
        <clipPath id="avHalf"><rect x="75" y="0" width="75" height="170" /></clipPath>
        <radialGradient id="avK" cx=".38" cy=".3" r=".9"><stop offset="0" stopColor="#fff" stopOpacity=".42" /><stop offset=".6" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="75" cy="166" rx={kawaii ? 38 : 40} ry="5" fill="#000" opacity=".28" />
      {hairBack(c, hc, S)}
      <g className="av-body">
        {kawaii ? (
          <>
            <ellipse cx="62" cy="165" rx="12" ry="5" fill={o2} /><ellipse cx="88" cy="165" rx="12" ry="5" fill={o2} />
            <path d={bean} fill={o1} />
            <ellipse cx="75" cy="144" rx="16" ry="14" fill="#fff" opacity=".12" />
            <g transform="translate(0 8)">{outfitLayer(c, o1, o2)}</g>
            <ellipse className="av-arm l" cx="38" cy="142" rx="8" ry="14" transform="rotate(14 38 142)" fill={o2} />
            <ellipse className="av-arm r" cx="112" cy="142" rx="8" ry="14" transform="rotate(-14 112 142)" fill={o2} />
          </>
        ) : (
          <>
            <rect x="58" y="138" width="14" height="22" rx="6" fill="#2b2f4a" {...S} /><rect x="78" y="138" width="14" height="22" rx="6" fill="#2b2f4a" {...S} />
            <rect x="53" y="156" width="22" height="10" rx="5" fill="#f2f4ff" {...S} /><rect x="75" y="156" width="22" height="10" rx="5" fill="#f2f4ff" {...S} />
            <rect x="67" y="90" width="16" height="14" rx="5" fill={sk2} {...S} />
            <path d={torso} fill={o1} {...S} />
            {half && <path d={torso} fill="#000" opacity=".14" clipPath="url(#avHalf)" />}
            {outfitLayer(c, o1, o2)}
            <path className="av-arm l" d="M52 104 q-14 12 -12 38 q3 6 11 3 q0 -16 7 -30z" fill={o2} {...S} />
            <path className="av-arm r" d="M98 104 q14 12 12 38 q-3 6 -11 3 q0 -16 -7 -30z" fill={o2} {...S} />
            <circle cx="45" cy="146" r="7" fill={c.skin} {...S} /><circle cx="105" cy="146" r="7" fill={c.skin} {...S} />
          </>
        )}
        {!kawaii && <><circle cx="35" cy="62" r="7" fill={c.skin} {...S} /><circle cx="115" cy="62" r="7" fill={c.skin} {...S} /></>}
        <ellipse cx="75" cy="60" rx={hx} ry={hy} fill={c.skin} {...S} />
        {half && <ellipse cx="75" cy="60" rx={hx} ry={hy} fill="#000" opacity=".1" clipPath="url(#avHalf)" />}
        {mode !== 'plano' && <ellipse cx="75" cy="60" rx={hx} ry={hy} fill="url(#avK)" />}
        {c.face === 'pecas' && <g fill="#8a5a3c" opacity=".55">{[[48, 74], [54, 78], [45, 80], [102, 74], [96, 78], [105, 80]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />)}</g>}
        {facial === 'barba' && <path d="M38 64 q37 58 74 0 q-6 28 -37 30 q-31 -2 -37 -30z" fill={hc} />}
        {hairFront(c, hc, S)}
        {!kawaii && <path d="M50 50 q8 -5 16 -1 M84 49 q8 -4 16 1" stroke={hc} strokeWidth="3" strokeLinecap="round" fill="none" />}
        {kawaii && <path d="M50 52 q6 -4 12 -1 M88 51 q6 -3 12 1" stroke={hc} strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".8" />}
        {/* ojos */}
        <g className="av-eyes">
          {mode === 'chibi' && (
            <>
              <ellipse cx="60" cy={ey} rx="9" ry="11" fill="#fff" stroke={OL} strokeWidth="2.4" /><ellipse cx="90" cy={ey} rx="9" ry="11" fill="#fff" stroke={OL} strokeWidth="2.4" />
              <circle cx="61" cy={ey + 3} r="7" fill={eye} /><circle cx="91" cy={ey + 3} r="7" fill={eye} />
              <circle cx="61" cy={ey + 3} r="3.5" fill="#0b0c14" /><circle cx="91" cy={ey + 3} r="3.5" fill="#0b0c14" />
              <circle cx="64" cy={ey - 1} r="2.8" fill="#fff" /><circle cx="94" cy={ey - 1} r="2.8" fill="#fff" />
              <circle cx="58" cy={ey + 7} r="1.4" fill="#fff" /><circle cx="88" cy={ey + 7} r="1.4" fill="#fff" />
            </>
          )}
          {mode === 'plano' && (
            <>
              <circle cx="60" cy={ey} r="6" fill={eye} /><circle cx="90" cy={ey} r="6" fill={eye} />
              <circle cx="62" cy={ey - 2.4} r="2" fill="#fff" /><circle cx="92" cy={ey - 2.4} r="2" fill="#fff" />
            </>
          )}
          {kawaii && (
            <>
              <ellipse cx="57" cy={ey} rx="4.6" ry="5.8" fill={eye} /><ellipse cx="93" cy={ey} rx="4.6" ry="5.8" fill={eye} />
              <circle cx="58.6" cy={ey - 2.4} r="2" fill="#fff" /><circle cx="94.6" cy={ey - 2.4} r="2" fill="#fff" />
              <circle cx="55.6" cy={ey + 2.6} r="1" fill="#fff" /><circle cx="91.6" cy={ey + 2.6} r="1" fill="#fff" />
            </>
          )}
        </g>
        {mode === 'chibi' && <path d="M75 70 q2 3 4 0" stroke="#000" strokeOpacity=".3" strokeWidth="2.2" fill="none" strokeLinecap="round" />}
        <g fill="#ff7a9c" opacity={blush}>{kawaii ? <><ellipse cx="45" cy="79" rx="9" ry="5.5" /><ellipse cx="105" cy="79" rx="9" ry="5.5" /></> : <><ellipse cx="49" cy="75" rx="7" ry="4.5" /><ellipse cx="101" cy="75" rx="7" ry="4.5" /></>}</g>
        {/* boca */}
        {kawaii ? (
          <>
            {mouth === 'sonrisa' && <path className="av-mouth" d="M69 82 q3 4 6 0 q3 4 6 0" fill="none" stroke={mc} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
            {mouth === 'grande' && <path className="av-mouth" d="M69 80 q6 11 12 0z" fill="#7a2a3a" stroke="#7a2a3a" strokeWidth="2" strokeLinejoin="round" />}
            {mouth === 'neutral' && <path className="av-mouth" d="M70 83 h10" stroke={mc} strokeWidth="2.2" strokeLinecap="round" />}
            {mouth === 'sorpresa' && <ellipse className="av-mouth" cx="75" cy="83" rx="3" ry="3.6" fill="#7a2a3a" />}
            {mouth === 'lengua' && <g className="av-mouth"><ellipse cx="75" cy="87.5" rx="3" ry="3.6" fill="#ff7a9c" /><path d="M69 82 q3 4 6 0 q3 4 6 0" fill="none" stroke={mc} strokeWidth="2.2" strokeLinecap="round" /></g>}
            {mouth === 'enojada' && <path className="av-mouth" d="M69 85 q6 -6 12 0" fill="none" stroke={mc} strokeWidth="2.2" strokeLinecap="round" />}
          </>
        ) : (
          <>
            {mouth === 'sonrisa' && <path className="av-mouth" d="M66 82 q9 9 18 0" fill="none" stroke={mc} strokeWidth="3" strokeLinecap="round" />}
            {mouth === 'grande' && <path className="av-mouth" d="M64 80 q11 15 22 0z" fill="#7a2a3a" stroke={mode === 'chibi' ? OL : '#7a2a3a'} strokeWidth="2.4" strokeLinejoin="round" />}
            {mouth === 'neutral' && <path className="av-mouth" d="M67 84 h16" stroke={mc} strokeWidth="3" strokeLinecap="round" />}
            {mouth === 'sorpresa' && <ellipse className="av-mouth" cx="75" cy="85" rx="4" ry="5" fill="#7a2a3a" stroke={mode === 'chibi' ? OL : 'none'} strokeWidth="2" />}
            {mouth === 'lengua' && <g className="av-mouth"><ellipse cx="76" cy="89" rx="4.5" ry="6" fill="#ff7a9c" /><path d="M65 81 q10 9 20 0" fill="none" stroke={mc} strokeWidth="3" strokeLinecap="round" /></g>}
            {mouth === 'enojada' && <path className="av-mouth" d="M66 86 q9 -7 18 0" fill="none" stroke={mc} strokeWidth="3" strokeLinecap="round" />}
          </>
        )}
        {c.face === 'lunar' && <circle cx="101" cy="76" r="2.2" fill="#5c3a26" />}
        {c.face === 'cicatriz' && <g stroke="#c9877a" strokeWidth="2.2" strokeLinecap="round"><path d="M97 46 l-9 22" /><path d="M93 54 l5 2 M91 60 l5 2" strokeWidth="1.6" /></g>}
        {facial === 'bigote' && <path d="M62 78 q6 -6 13 -2 q7 -4 13 2 q-6 3 -13 0 q-7 3 -13 0z" fill={hc} />}
        {facial === 'perilla' && <path d="M69 90 q6 4 12 0 q-1 8 -6 10 q-5 -2 -6 -10z" fill={hc} />}
        {gearLayer(c, hc, o1, o2, S, !kawaii)}
      </g>
      {(live === 'type' || live === 'work') && <Keyboard skin={c.skin} />}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Pixel art: todo en una cuadrícula de 5×5 (30×34 celdas) */
/* ------------------------------------------------------------------ */

const U = 5
const cell = (x: number, y: number, w: number, h: number, fill: string, key: string, opacity?: number): ReactNode => (
  <rect key={key} x={x * U} y={y * U} width={w * U} height={h * U} fill={fill} opacity={opacity} />
)
/** Bloque con las esquinas escalonadas (da el aspecto redondeado del pixel art). */
const blob = (x: number, y: number, w: number, h: number, fill: string, key: string): ReactNode => (
  <g key={key}>{cell(x + 1, y, w - 2, h, fill, 'a')}{cell(x, y + 1, w, h - 2, fill, 'b')}</g>
)
const outlined = (x: number, y: number, w: number, h: number, fill: string, key: string): ReactNode => (
  <g key={key}>{blob(x - 1, y - 1, w + 2, h + 2, OL, 'o')}{blob(x, y, w, h, fill, 'f')}</g>
)

/** Accesorios en versión píxel (los aretes se dibujan aparte, detrás de la cabeza). */
function pixelGear(g: Gear, col: string, hc: string): ReactNode {
  const dk = darken(col, 0.65)
  const P = (n: ReactNode): ReactNode => <g key={g}>{n}</g>
  switch (g) {
    case 'lentes': return P(<g fill="none">{cell(10, 9, 5, 1, col, 'a')}{cell(10, 13, 5, 1, col, 'b')}{cell(10, 9, 1, 5, col, 'c')}{cell(14, 9, 1, 5, col, 'd')}{cell(16, 9, 5, 1, col, 'e')}{cell(16, 13, 5, 1, col, 'f')}{cell(16, 9, 1, 5, col, 'g')}{cell(20, 9, 1, 5, col, 'h')}{cell(15, 10, 1, 1, col, 'i')}</g>)
    case 'sol': return P(<>{cell(10, 9, 5, 4, col, 'a')}{cell(16, 9, 5, 4, col, 'b')}{cell(15, 10, 1, 1, col, 'c')}{cell(11, 10, 1, 1, '#fff', 'd', 0.5)}{cell(17, 10, 1, 1, '#fff', 'e', 0.5)}</>)
    case 'audifonos': return P(<>{cell(8, 2, 14, 1, col, 'a')}{cell(7, 3, 1, 8, col, 'b')}{cell(22, 3, 1, 8, col, 'c')}{cell(5, 8, 3, 5, dk, 'd')}{cell(22, 8, 3, 5, dk, 'e')}</>)
    case 'gorra': return P(<>{blob(7, 2, 16, 5, col, 'a')}{cell(15, 6, 9, 2, dk, 'b')}</>)
    case 'orejas': return P(<>{cell(8, 2, 3, 3, hc, 'a')}{cell(9, 1, 1, 1, hc, 'b')}{cell(19, 2, 3, 3, hc, 'c')}{cell(20, 1, 1, 1, hc, 'd')}{cell(9, 3, 1, 1, col, 'e')}{cell(20, 3, 1, 1, col, 'f')}</>)
    case 'lazo': return P(<g className="av-bow">{cell(17, 1, 2, 4, col, 'a')}{cell(21, 1, 2, 4, col, 'b')}{cell(19, 2, 2, 2, dk, 'c')}</g>)
    case 'halo': return P(<g className="av-halo">{cell(10, 0, 10, 1, col, 'a')}{cell(9, 1, 1, 1, col, 'b')}{cell(20, 1, 1, 1, col, 'c')}</g>)
    case 'corona': return P(<>{cell(9, 2, 12, 2, col, 'a')}{cell(9, 0, 2, 2, col, 'b')}{cell(14, 0, 2, 2, col, 'c')}{cell(19, 0, 2, 2, col, 'd')}</>)
    case 'bandana': return P(<>{cell(8, 5, 14, 2, col, 'a')}{cell(22, 5, 3, 1, col, 'b')}{cell(23, 6, 2, 2, dk, 'c')}</>)
    case 'sombrero': return P(<>{cell(4, 4, 22, 2, col, 'a')}{cell(9, 0, 12, 4, col, 'b')}{cell(9, 3, 12, 1, dk, 'c')}</>)
    case 'cinta': return P(cell(8, 6, 14, 1, col, 'a'))
    case 'mascarilla': return P(<>{cell(10, 14, 10, 3, col, 'a')}{cell(8, 14, 2, 1, dk, 'b')}{cell(20, 14, 2, 1, dk, 'c')}</>)
    case 'parche': return P(<>{cell(10, 6, 12, 1, dk, 'a')}{cell(16, 9, 5, 4, col, 'b')}</>)
    case 'collar': return P(<>{cell(11, 19, 8, 1, col, 'a')}{cell(14, 20, 2, 2, col, 'b')}</>)
    case 'flor': return P(<>{cell(20, 2, 3, 3, col, 'a')}{cell(21, 3, 1, 1, '#ffd166', 'b')}</>)
    case 'cuernos': return P(<>{cell(8, 0, 2, 4, col, 'a')}{cell(20, 0, 2, 4, col, 'b')}{cell(9, 0, 1, 1, dk, 'c')}{cell(20, 0, 1, 1, dk, 'd')}</>)
    case 'monoculo': return P(<>{cell(16, 9, 5, 1, col, 'a')}{cell(16, 13, 5, 1, col, 'b')}{cell(16, 9, 1, 5, col, 'c')}{cell(20, 9, 1, 5, col, 'd')}{cell(20, 14, 1, 4, col, 'e')}</>)
    default: return null
  }
}

function PixelAvatar({ c, size, live }: { c: TeamCharacter; size: number; live?: Live }): ReactNode {
  const o1 = c.outfitColor ?? OUTFIT_COLOR[c.outfit] ?? '#5b73f0'
  const o2 = darken(o1)
  const hc = c.hairColor ?? HAIR_COLOR
  const eye = c.eyeColor ?? '#1a1c28'
  const facial = c.facial ?? (c.gear === 'barba' ? 'barba' : 'ninguno')
  const mouth = c.mouth ?? 'sonrisa'
  const sk2 = darken(c.skin, 0.84)
  const mc = facial === 'barba' ? '#f2f4ff' : '#1a1c28'
  const k = (n: string): string => n
  const outfit = ((): ReactNode => {
    switch (c.outfit) {
      case 'sudadera': return <>{cell(11, 18, 8, 1, o2, k('a'))}{cell(13, 19, 1, 3, '#e8ebf4', k('b'))}{cell(16, 19, 1, 3, '#e8ebf4', k('c'))}</>
      case 'camisa': return <>{cell(12, 18, 3, 2, '#fff', k('a'))}{cell(15, 18, 3, 2, '#fff', k('b'))}{cell(14, 20, 2, 6, '#ff7a9c', k('c'))}</>
      case 'bata': return <>{cell(12, 18, 1, 8, '#c9cfe0', k('a'))}{cell(17, 18, 1, 8, '#c9cfe0', k('b'))}{cell(19, 22, 3, 3, '#c9cfe0', k('c'))}</>
      case 'polera': return cell(12, 18, 6, 1, o2, k('a'))
      case 'chaqueta': return <>{cell(12, 18, 6, 9, '#e8ebf4', k('a'))}{cell(12, 18, 1, 9, o2, k('b'))}{cell(17, 18, 1, 9, o2, k('c'))}</>
      case 'traje': return <>{cell(12, 18, 6, 4, '#fff', k('a'))}{cell(14, 19, 2, 6, '#c0392b', k('b'))}{cell(11, 18, 1, 6, o2, k('c'))}{cell(18, 18, 1, 6, o2, k('d'))}</>
      case 'capucha': return <>{cell(10, 17, 10, 2, o2, k('a'))}{cell(13, 19, 1, 3, '#e8ebf4', k('b'))}{cell(16, 19, 1, 3, '#e8ebf4', k('c'))}</>
      case 'overol': return <>{cell(11, 22, 8, 6, '#4a6fa5', k('a'))}{cell(11, 18, 1, 4, '#4a6fa5', k('b'))}{cell(18, 18, 1, 4, '#4a6fa5', k('c'))}{cell(12, 22, 1, 1, '#ffd166', k('d'))}{cell(17, 22, 1, 1, '#ffd166', k('e'))}</>
      case 'delantal': return <>{cell(11, 21, 8, 7, '#e8ebf4', k('a'))}{cell(13, 24, 4, 2, '#c9cfe0', k('b'))}</>
      case 'bufanda': return <>{cell(9, 18, 12, 2, '#ff7a9c', k('a'))}{cell(17, 20, 2, 5, '#e0557a', k('b'))}</>
      case 'rayas': return <>{cell(8, 20, 14, 1, o2, k('a'))}{cell(8, 23, 14, 1, o2, k('b'))}{cell(8, 26, 14, 1, o2, k('c'))}</>
      case 'hawaiana': return <>{cell(12, 18, 3, 2, o2, k('a'))}{cell(15, 18, 3, 2, o2, k('b'))}{cell(9, 21, 1, 1, '#ffd166', k('c'))}{cell(19, 23, 1, 1, '#ffd166', k('d'))}{cell(13, 25, 1, 1, '#ff7a9c', k('e'))}{cell(17, 21, 1, 1, '#ff7a9c', k('f'))}</>
      case 'vestido': return <>{cell(12, 18, 6, 1, o2, k('a'))}{cell(8, 26, 14, 2, o2, k('b'))}{cell(8, 22, 14, 1, o2, k('c'))}</>
      case 'kimono': return <>{cell(12, 18, 1, 9, '#fff', k('a'))}{cell(17, 18, 1, 9, o2, k('b'))}{cell(8, 23, 14, 2, '#ffd166', k('c'))}</>
      case 'armadura': return <>{cell(11, 18, 8, 1, '#c9cfe0', k('a'))}{cell(8, 21, 14, 1, o2, k('b'))}{cell(8, 25, 14, 1, o2, k('c'))}{cell(14, 22, 2, 2, '#ffd166', k('d'))}</>
      case 'camiseta': return cell(12, 18, 6, 1, o2, k('a'))
      default: return null
    }
  })()
  const eyeBox = (x: number, key: string): ReactNode => <g key={key}>{cell(x, 10, 2, 3, eye, 'e')}{cell(x, 10, 1, 1, '#fff', 'h')}</g>
  const mouthEl = ((): ReactNode => {
    switch (mouth) {
      case 'grande': return <g className="av-mouth">{cell(13, 14, 4, 2, '#7a2a3a', 'a')}{cell(14, 15, 2, 1, '#ff7a9c', 'b')}</g>
      case 'neutral': return <g className="av-mouth">{cell(13, 15, 4, 1, mc, 'a')}</g>
      case 'sorpresa': return <g className="av-mouth">{cell(14, 14, 2, 2, '#7a2a3a', 'a')}</g>
      case 'lengua': return <g className="av-mouth">{cell(12, 14, 1, 1, mc, 'a')}{cell(13, 15, 4, 1, mc, 'b')}{cell(17, 14, 1, 1, mc, 'c')}{cell(15, 16, 2, 1, '#ff7a9c', 'd')}</g>
      case 'enojada': return <g className="av-mouth">{cell(12, 15, 1, 1, mc, 'a')}{cell(13, 14, 4, 1, mc, 'b')}{cell(17, 15, 1, 1, mc, 'c')}</g>
      default: return <g className="av-mouth">{cell(12, 14, 1, 1, mc, 'a')}{cell(13, 15, 4, 1, mc, 'b')}{cell(17, 14, 1, 1, mc, 'c')}</g>
    }
  })()
  return (
    <svg className={`av ${live ? `av-${live}` : ''}`} width={size} height={size * 1.13} viewBox="0 0 150 170" role="img" aria-label={`Personaje ${c.name}`} shapeRendering="crispEdges">
      {cell(8, 33, 14, 1, '#000', 'sh', 0.28)}
      {/* pelo trasero */}
      {c.hair === 'largo' && cell(7, 6, 16, 14, hc, 'hb')}
      {c.hair === 'rizado' && <>{cell(6, 4, 18, 8, hc, 'r1')}{cell(7, 3, 16, 2, hc, 'r2')}</>}
      {c.hair === 'mono' && outlined(13, 0, 4, 3, hc, 'bun')}
      <g className="av-body">
        {/* piernas y zapatos */}
        {cell(10, 27, 4, 5, '#2b2f4a', 'l1')}{cell(16, 27, 4, 5, '#2b2f4a', 'l2')}
        {cell(9, 31, 5, 2, '#f2f4ff', 's1')}{cell(16, 31, 5, 2, '#f2f4ff', 's2')}
        {cell(9, 33, 5, 1, OL, 'so1')}{cell(16, 33, 5, 1, OL, 'so2')}
        {/* torso */}
        {outlined(7, 18, 16, 10, o1, 'torso')}
        {cell(20, 19, 2, 8, '#000', 'tshade', 0.14)}
        {outfit}
        {/* brazos */}
        <g className="av-arm l">{cell(4, 19, 3, 7, OL, 'ao')}{cell(5, 19, 2, 7, o2, 'af')}{cell(4, 26, 3, 3, c.skin, 'ah')}</g>
        <g className="av-arm r">{cell(23, 19, 3, 7, OL, 'ao')}{cell(23, 19, 2, 7, o2, 'af')}{cell(23, 26, 3, 3, c.skin, 'ah')}</g>
        {/* cabeza */}
        {cell(13, 17, 4, 1, sk2, 'neck')}
        {[[c.gear, c.gearColor], [c.gear2, c.gear2Color]].map(([g, col], i) => g === 'aretes' && <g key={i}>{cell(7, 12, 1, 2, col ?? GEAR_COLOR.aretes!, 'e1')}{cell(22, 12, 1, 2, col ?? GEAR_COLOR.aretes!, 'e2')}</g>)}
        {outlined(8, 4, 14, 13, c.skin, 'head')}
        {cell(6, 9, 2, 4, c.skin, 'ear1')}{cell(22, 9, 2, 4, c.skin, 'ear2')}
        {cell(20, 6, 2, 10, '#000', 'hshade', 0.12)}
        {c.face === 'pecas' && <>{cell(9, 12, 1, 1, '#8a5a3c', 'p1')}{cell(11, 13, 1, 1, '#8a5a3c', 'p2')}{cell(20, 12, 1, 1, '#8a5a3c', 'p3')}{cell(18, 13, 1, 1, '#8a5a3c', 'p4')}</>}
        {facial === 'barba' && <>{cell(8, 12, 3, 4, hc, 'b1')}{cell(19, 12, 3, 4, hc, 'b2')}{cell(9, 15, 12, 1, hc, 'b3')}{cell(10, 16, 10, 1, hc, 'b4')}</>}
        {/* pelo delantero */}
        {(c.hair === 'corto' || c.hair === 'largo' || c.hair === 'mono') && <>{blob(7, 2, 16, 5, hc, 'h1')}{cell(7, 6, 2, 5, hc, 'h2')}{cell(21, 6, 2, 5, hc, 'h3')}{cell(9, 6, 4, 1, hc, 'h4')}{cell(17, 6, 3, 2, hc, 'h5')}</>}
        {c.hair === 'rizado' && <>{blob(7, 2, 16, 5, hc, 'h1')}{cell(7, 6, 2, 3, hc, 'h2')}{cell(21, 6, 2, 3, hc, 'h3')}{cell(10, 6, 2, 1, hc, 'h4')}{cell(14, 6, 2, 1, hc, 'h5')}{cell(18, 6, 2, 1, hc, 'h6')}</>}
        {c.hair === 'rapado' && cell(9, 4, 12, 2, hc, 'h1', 0.55)}
        {c.hair === 'cresta' && <>{cell(14, 0, 2, 5, hc, 'h1')}{cell(12, 2, 6, 3, hc, 'h2')}</>}
        {c.hair === 'gorro' && <>{blob(7, 1, 16, 6, '#5fe3b4', 'h1')}{cell(7, 5, 16, 2, '#2fbf8a', 'h2')}{cell(14, 0, 2, 1, '#e8ebf4', 'h3')}</>}
        {/* cara */}
        <g className="av-eyes">{eyeBox(11, 'le')}{eyeBox(17, 're')}</g>
        {cell(9, 13, 2, 1, '#ff7a9c', 'bl1', c.face === 'rubor' ? 0.8 : 0.45)}{cell(19, 13, 2, 1, '#ff7a9c', 'bl2', c.face === 'rubor' ? 0.8 : 0.45)}
        {mouthEl}
        {c.face === 'lunar' && cell(19, 12, 1, 1, '#5c3a26', 'lun')}
        {c.face === 'cicatriz' && cell(19, 5, 1, 5, '#c9877a', 'cic')}
        {facial === 'bigote' && <>{cell(11, 13, 4, 1, hc, 'm1')}{cell(15, 13, 4, 1, hc, 'm2')}</>}
        {facial === 'perilla' && cell(14, 17, 2, 2, hc, 'pe')}
        {/* complementos */}
        {c.gear !== 'ninguno' && c.gear !== 'barba' && pixelGear(c.gear, c.gearColor ?? GEAR_COLOR[c.gear] ?? '#ffd166', hc)}
        {c.gear2 && c.gear2 !== 'ninguno' && c.gear2 !== 'barba' && c.gear2 !== c.gear && pixelGear(c.gear2, c.gear2Color ?? GEAR_COLOR[c.gear2] ?? '#ffd166', hc)}
      </g>
      {(live === 'type' || live === 'work') && <Keyboard skin={c.skin} />}
    </svg>
  )
}

export function StyledAvatar({ c, size, live, style }: { c: TeamCharacter; size: number; live?: Live; style: 'chibi' | 'plano' | 'pixel' | 'kawaii' }): ReactNode {
  return style === 'pixel' ? <PixelAvatar c={c} size={size} live={live} /> : <BodyAvatar c={c} size={size} live={live} mode={style} />
}

/* ------------------------------------------------------------------ */
/* Robot pixel (el resto de estilos reutiliza el robot clásico con variantes) */
/* ------------------------------------------------------------------ */

export function PixelRobot({ a, state, size }: { a: TeamAgent; state: 'idle' | 'work' | 'done'; size: number }): ReactNode {
  const L = a.look ?? {}
  const head = L.head ?? 'redonda'
  const eyes = L.eyes ?? 'pixel'
  const ant = L.antenna ?? 'bola'
  const acc = L.acc ?? 'ninguno'
  const hat = acc === 'gorro' || acc === 'sombrero' || acc === 'corona' || acc === 'orejas' || acc === 'halo' || acc === 'cuernos'
  const mouth = L.mouth ?? 'ninguna'
  const cheeks = L.cheeks ?? 'ninguno'
  const outfit = L.outfit ?? 'ninguna'
  const col = a.color
  const T = 3
  const c = (x: number, y: number, w: number, h: number, fill: string, key: string, op?: number): ReactNode => <rect key={key} x={x * T} y={y * T} width={w * T} height={h * T} fill={fill} opacity={op} />
  const round = head === 'redonda' || head === 'domo'
  const bl = (x: number, y: number, w: number, h: number, fill: string, key: string, r = round): ReactNode => r
    ? <g key={key}>{c(x + 1, y, w - 2, h, fill, 'a')}{c(x, y + 1, w, h - 2, fill, 'b')}</g>
    : c(x, y, w, h, fill, key)
  const emojiX = outfit === 'corbata' || outfit === 'mono' ? 26 : 43
  const eyeEl = ((): ReactNode => {
    switch (eyes) {
      case 'redondos': return <>{c(10, 9, 1, 3, col, 'a')}{c(9, 10, 3, 1, col, 'b')}{c(17, 9, 1, 3, col, 'c')}{c(16, 10, 3, 1, col, 'd')}</>
      case 'visor': return c(9, 10, 10, 2, col, 'a')
      case 'felices': return <>{c(8, 11, 1, 1, col, 'a')}{c(9, 10, 2, 1, col, 'b')}{c(11, 11, 1, 1, col, 'c')}{c(16, 11, 1, 1, col, 'd')}{c(17, 10, 2, 1, col, 'e')}{c(19, 11, 1, 1, col, 'f')}</>
      case 'enojados': return <>{c(9, 10, 2, 3, col, 'a')}{c(17, 10, 2, 3, col, 'b')}{c(8, 8, 2, 1, col, 'c')}{c(10, 9, 1, 1, col, 'd')}{c(18, 8, 2, 1, col, 'e')}{c(17, 9, 1, 1, col, 'f')}</>
      case 'dormidos': return <>{c(8, 11, 3, 1, col, 'a')}{c(17, 11, 3, 1, col, 'b')}{c(21, 7, 1, 1, col, 'z')}</>
      case 'estrellas': return <>{c(9, 10, 3, 1, col, 'a')}{c(10, 9, 1, 3, col, 'b')}{c(17, 10, 3, 1, col, 'c')}{c(18, 9, 1, 3, col, 'd')}</>
      case 'guino': return <>{c(9, 9, 2, 3, col, 'a')}{c(17, 11, 3, 1, col, 'b')}</>
      default: return <>{c(9, 9, 2, 3, col, 'a')}{c(17, 9, 2, 3, col, 'b')}</>
    }
  })()
  const mouthEl = ((): ReactNode => {
    switch (mouth) {
      case 'sonrisa': return <>{c(11, 14, 1, 1, col, 'a')}{c(12, 15, 4, 1, col, 'b')}{c(16, 14, 1, 1, col, 'c')}</>
      case 'neutral': return c(12, 15, 4, 1, col, 'a')
      case 'o': return c(13, 14, 2, 2, col, 'a')
      case 'diente': return <>{c(11, 14, 1, 1, col, 'a')}{c(12, 15, 4, 1, col, 'b')}{c(16, 14, 1, 1, col, 'c')}{c(13, 15, 2, 1, '#e8ebf4', 'd')}</>
      default: return null
    }
  })()
  const outfitEl = ((): ReactNode => {
    switch (outfit) {
      case 'corbata': return <>{c(8, 19, 2, 2, col, 'a')}{c(8, 21, 2, 5, col, 'b')}</>
      case 'mono': return <>{c(6, 19, 6, 2, col, 'a')}{c(8, 19, 2, 2, '#e8ebf4', 'b')}</>
      case 'bufanda': return <>{c(3, 19, 22, 2, '#ff7a9c', 'a')}{c(19, 21, 2, 5, '#e0557a', 'b')}</>
      case 'delantal': return c(7, 22, 14, 8, '#e8ebf4', 'a', 0.92)
      case 'chaleco': return <>{c(3, 19, 7, 11, '#1b1d2c', 'a', 0.88)}{c(18, 19, 7, 11, '#1b1d2c', 'b', 0.88)}</>
      case 'hoodie': return <>{c(6, 19, 16, 2, col, 'a')}{c(12, 21, 1, 3, '#e8ebf4', 'b')}{c(15, 21, 1, 3, '#e8ebf4', 'c')}</>
      default: return null
    }
  })()
  const frame = (x: number, key: string, fill: string): ReactNode => <g key={key}>{c(x, 8, 6, 1, fill, 'a')}{c(x, 13, 6, 1, fill, 'b')}{c(x, 8, 1, 6, fill, 'c')}{c(x + 5, 8, 1, 6, fill, 'd')}</g>
  const accEl = ((): ReactNode => {
    switch (acc) {
      case 'gorro': return <>{bl(4, 2, 20, 4, '#ff7a9c', 'a', true)}{c(3, 5, 22, 2, '#e0557a', 'b')}{c(13, 0, 2, 2, '#e8ebf4', 'c')}</>
      case 'sombrero': return <>{c(9, 0, 10, 5, '#1b1d2c', 'a')}{c(9, 3, 10, 1, col, 'b')}{c(6, 5, 16, 1, '#1b1d2c', 'c')}</>
      case 'corona': return <>{c(8, 3, 12, 2, '#ffd166', 'a')}{c(8, 1, 2, 2, '#ffd166', 'b')}{c(13, 0, 2, 3, '#ffd166', 'c')}{c(18, 1, 2, 2, '#ffd166', 'd')}</>
      case 'audifonos': return <>{c(4, 3, 20, 1, '#e8ebf4', 'a')}{c(3, 4, 1, 6, '#e8ebf4', 'b')}{c(24, 4, 1, 6, '#e8ebf4', 'c')}{c(1, 8, 3, 6, '#e8ebf4', 'd')}{c(24, 8, 3, 6, '#e8ebf4', 'e')}</>
      case 'lentes': return <>{frame(8, 'l', '#e8ebf4')}{frame(14, 'r', '#e8ebf4')}</>
      case 'gafasSol': return <>{c(8, 9, 6, 4, '#05060c', 'a')}{c(14, 9, 6, 4, '#05060c', 'b')}{c(8, 8, 12, 1, '#e8ebf4', 'c')}</>
      case 'orejas': return <>{c(5, 3, 3, 3, col, 'a')}{c(6, 2, 1, 1, col, 'b')}{c(20, 3, 3, 3, col, 'c')}{c(21, 2, 1, 1, col, 'd')}</>
      case 'halo': return <g className="bot-halo">{c(9, 1, 10, 1, '#ffd166', 'a')}{c(8, 2, 1, 1, '#ffd166', 'b')}{c(19, 2, 1, 1, '#ffd166', 'c')}</g>
      case 'cuernos': return <>{c(6, 2, 2, 3, '#ff5d5d', 'a')}{c(5, 1, 1, 1, '#ff5d5d', 'b')}{c(20, 2, 2, 3, '#ff5d5d', 'c')}{c(22, 1, 1, 1, '#ff5d5d', 'd')}</>
      case 'parche': return <>{c(8, 8, 6, 6, '#1b1d2c', 'a')}{c(5, 7, 8, 1, '#1b1d2c', 'b')}</>
      default: return null
    }
  })()
  return (
    <svg className={`bot bot-${state}`} width={size} height={(size * 96) / 86} viewBox="0 0 86 96" shapeRendering="crispEdges" style={{ ['--c' as string]: a.color }}>
      <g transform="translate(1 0)">
        {c(6, 31, 16, 1, '#000', 'sh', 0.25)}
        <g className="bot-body">
          {outfit === 'capa' && <g className="bot-cape">{c(1, 19, 26, 12, col, 'a', 0.7)}</g>}
          {!hat && ant === 'bola' && <>{c(13, 2, 2, 3, '#8a92aa', 'a')}<g className="bot-ant">{c(12, 0, 4, 2, col, 'b')}</g></>}
          {!hat && ant === 'doble' && <>{c(8, 2, 1, 3, '#8a92aa', 'a')}{c(19, 2, 1, 3, '#8a92aa', 'b')}<g className="bot-ant">{c(7, 0, 3, 2, col, 'c')}{c(18, 0, 3, 2, col, 'd')}</g></>}
          {!hat && ant === 'helice' && <>{c(13, 2, 2, 3, '#8a92aa', 'a')}<g className="bot-prop">{c(9, 1, 10, 1, col, 'b')}</g></>}
          {/* cuerpo */}
          {bl(2, 18, 24, 13, '#12142a', 'bo', true)}{bl(3, 19, 22, 11, '#2b3150', 'bf', true)}{c(3, 19, 22, 11, col, 'bt', 0.2)}
          {c(0, 20, 3, 8, '#12142a', 'ao1')}{c(1, 21, 2, 6, col, 'af1')}{c(25, 20, 3, 8, '#12142a', 'ao2')}{c(25, 21, 2, 6, col, 'af2')}
          {/* cabeza */}
          {bl(3, 4, 22, 16, '#12142a', 'ho')}{bl(4, 5, 20, 14, col, 'hf')}{c(22, 6, 2, 12, '#000', 'hs', 0.15)}
          {acc !== 'audifonos' && <>{c(2, 9, 2, 5, '#8a92aa', 'n1')}{c(24, 9, 2, 5, '#8a92aa', 'n2')}</>}
          {bl(6, 7, 16, 9, '#0e1020', 'sc')}
          <g className="bot-eyes">{eyeEl}</g>
          {cheeks === 'rubor' && <g className="bot-cheeks">{c(7, 13, 2, 1, '#ff7a9c', 'a', 0.7)}{c(19, 13, 2, 1, '#ff7a9c', 'b', 0.7)}</g>}
          {cheeks === 'pecas' && <>{c(7, 13, 1, 1, col, 'a')}{c(8, 14, 1, 1, col, 'b')}{c(20, 13, 1, 1, col, 'c')}{c(19, 14, 1, 1, col, 'd')}</>}
          {mouth !== 'ninguna' && <g className="bot-mouth">{mouthEl}</g>}
          {outfitEl}
          <text x={emojiX} y="80" textAnchor="middle" fontSize={emojiX === 43 ? 14 : 12} shapeRendering="auto">{a.emoji}</text>
          {accEl}
        </g>
      </g>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Robot vectorial para chibi / plano / kawaii (misma geometría que el clásico) */
/* ------------------------------------------------------------------ */

function VectorRobot({ a, state, size, mode }: { a: TeamAgent; state: 'idle' | 'work' | 'done'; size: number; mode: Mode }): ReactNode {
  const L = a.look ?? {}
  const head = L.head ?? 'redonda'
  const eyes = L.eyes ?? 'pixel'
  const ant = L.antenna ?? 'bola'
  const acc = L.acc ?? 'ninguno'
  const hat = acc === 'gorro' || acc === 'sombrero' || acc === 'corona' || acc === 'orejas' || acc === 'halo' || acc === 'cuernos'
  const mouth = L.mouth ?? 'ninguna'
  const cheeks = L.cheeks ?? (mode === 'kawaii' ? 'rubor' : 'ninguno')
  const outfit = L.outfit ?? 'ninguna'
  const col = a.color
  const S: Props = mode === 'chibi' ? { stroke: OL, strokeWidth: 2.4, strokeLinejoin: 'round', strokeLinecap: 'round' } : {}
  const kawaii = mode === 'kawaii'
  const emojiX = outfit === 'corbata' || outfit === 'mono' ? 26 : 43
  const rx = kawaii ? 24 : head === 'cuadrada' ? 7 : head === 'tv' ? 10 : 20
  const top = kawaii ? 12 : 16
  const hh = kawaii ? 52 : 46
  const skull = (fill: string, extra?: Props): ReactNode => head === 'domo' && !kawaii
    ? <path d="M14 54 v-12 a29 28 0 0 1 58 0 v12 a8 8 0 0 1 -8 8 h-42 a8 8 0 0 1 -8 -8z" fill={fill} {...extra} />
    : <rect x="14" y={top} width="58" height={hh} rx={rx} fill={fill} {...extra} />
  const dark = darken(col, 0.78)
  const body = kawaii ? '#3a4170' : '#2b3150'
  const eyeFill = { fill: col, stroke: 'none' }
  const hl = (x: number, y: number): ReactNode => <circle cx={x} cy={y} r={kawaii ? 2.6 : 2} fill="#fff" />
  const stem = mode === 'chibi' ? OL : '#8a92aa'
  return (
    <svg className={`bot bot-${state}`} width={size} height={(size * 96) / 86} viewBox="0 0 86 96" style={{ ['--c' as string]: col }}>
      <defs>
        <radialGradient id="avK" cx=".38" cy=".3" r=".9"><stop offset="0" stopColor="#fff" stopOpacity=".42" /><stop offset=".6" stopColor="#fff" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="43" cy="92" rx="30" ry="4" fill="#000" opacity=".25" />
      <g className="bot-body">
        {outfit === 'capa' && <g className="bot-cape"><path d="M12 60 q-12 22 -8 36 h78 q4 -14 -8 -36z" fill={col} {...S} /><path d="M12 60 q-12 22 -8 36 h78 q4 -14 -8 -36z" fill="#000" opacity=".2" /></g>}
        {!hat && ant === 'bola' && <><line x1="43" y1="6" x2="43" y2="18" stroke={stem} strokeWidth={mode === 'chibi' ? 4 : 3} /><circle className="bot-ant" cx="43" cy="6" r="5.5" fill={col} {...S} /></>}
        {!hat && ant === 'doble' && <><path d="M33 20 L27 7 M53 20 L59 7" stroke={stem} strokeWidth={mode === 'chibi' ? 4 : 3} strokeLinecap="round" /><circle className="bot-ant" cx="27" cy="6" r="4.5" fill={col} {...S} /><circle className="bot-ant" cx="59" cy="6" r="4.5" fill={col} {...S} /></>}
        {!hat && ant === 'helice' && <><line x1="43" y1="6" x2="43" y2="18" stroke={stem} strokeWidth="3" /><ellipse className="bot-prop" cx="43" cy="5" rx="13" ry="3" fill={col} {...S} /></>}
        {kawaii
          ? <ellipse cx="43" cy="72" rx="23" ry="17" fill={body} {...S} />
          : <rect x="12" y="40" width="62" height="46" rx="18" fill={body} {...S} />}
        {mode === 'plano' && <path d="M43 40 h13 a18 18 0 0 1 18 18 v10 a18 18 0 0 1 -18 18 h-13z" fill="#000" opacity=".16" />}
        {!kawaii && <rect x="12" y="40" width="62" height="46" rx="18" fill={col} opacity=".16" />}
        {skull(col, S)}
        {mode === 'plano' && <path d="M43 16 h13 a16 16 0 0 1 16 16 v14 a16 16 0 0 1 -16 16 h-13z" fill="#000" opacity=".14" />}
        {mode !== 'plano' && skull('url(#avK)')}
        <rect x="21" y={kawaii ? 24 : 25} width="44" height={kawaii ? 32 : 28} rx={kawaii ? 14 : 12} fill={kawaii ? '#1b1f3a' : '#0e1020'} />
        <g className="bot-eyes">
          {eyes === 'pixel' && <><ellipse cx="33.5" cy="39" rx={kawaii ? 6 : 5} ry={kawaii ? 7.5 : 7} {...eyeFill} /><ellipse cx="52.5" cy="39" rx={kawaii ? 6 : 5} ry={kawaii ? 7.5 : 7} {...eyeFill} />{hl(35, 36)}{hl(54, 36)}</>}
          {eyes === 'redondos' && <><circle cx="33.5" cy="39" r={kawaii ? 7 : 6} {...eyeFill} /><circle cx="52.5" cy="39" r={kawaii ? 7 : 6} {...eyeFill} />{hl(35.5, 36.5)}{hl(54.5, 36.5)}</>}
          {eyes === 'visor' && <><rect x="26" y="35" width="34" height="9" rx="4.5" {...eyeFill} /><rect x="30" y="37" width="10" height="2" rx="1" fill="#fff" opacity=".6" /></>}
          {eyes === 'felices' && <path d="M28 42 q5.5 -9 11 0 M47 42 q5.5 -9 11 0" fill="none" stroke={col} strokeWidth="3.2" strokeLinecap="round" />}
          {eyes === 'enojados' && <><ellipse cx="33.5" cy="40" rx="5" ry="6" {...eyeFill} /><ellipse cx="52.5" cy="40" rx="5" ry="6" {...eyeFill} /><path d="M26 30 l14 6 M60 30 l-14 6" fill="none" stroke={col} strokeWidth="3" strokeLinecap="round" /></>}
          {eyes === 'dormidos' && <><path d="M28 40 h11 M47 40 h11" fill="none" stroke={col} strokeWidth="3.2" strokeLinecap="round" /><text className="bot-z" x="58" y="34" fontSize="9" fill={col}>z</text></>}
          {eyes === 'estrellas' && <><text x="33.5" y="45" textAnchor="middle" fontSize="15" fill={col}>★</text><text x="52.5" y="45" textAnchor="middle" fontSize="15" fill={col}>★</text></>}
          {eyes === 'guino' && <><ellipse cx="33.5" cy="39" rx="5" ry="7" {...eyeFill} />{hl(35, 36)}<path d="M47 41 q5.5 -8 11 0" fill="none" stroke={col} strokeWidth="3.2" strokeLinecap="round" /></>}
        </g>
        {cheeks === 'rubor' && <g className="bot-cheeks" fill="#ff7a9c" opacity=".6"><ellipse cx="25" cy="48" rx="4.5" ry="2.8" /><ellipse cx="61" cy="48" rx="4.5" ry="2.8" /></g>}
        {cheeks === 'pecas' && <g fill={col} opacity=".8"><circle cx="25" cy="47" r="1.1" /><circle cx="29" cy="49" r="1.1" /><circle cx="57" cy="49" r="1.1" /><circle cx="61" cy="47" r="1.1" /></g>}
        {mouth !== 'ninguna' && (
          <g className="bot-mouth" fill="none" stroke={col} strokeWidth="2.2" strokeLinecap="round">
            {mouth === 'sonrisa' && <path d="M36 48 q7 5 14 0" />}
            {mouth === 'neutral' && <path d="M37 49.5 h12" />}
            {mouth === 'o' && <circle cx="43" cy="49" r="2.6" />}
            {mouth === 'diente' && <><path d="M35 47.5 q8 6 16 0" /><rect x="40" y="48" width="6" height="3" rx="1" fill="#e8ebf4" stroke="none" /></>}
          </g>
        )}
        {acc !== 'audifonos' && !kawaii && <><rect x="4" y="30" width="9" height="18" rx="4.5" fill={dark} {...S} /><rect x="73" y="30" width="9" height="18" rx="4.5" fill={dark} {...S} /></>}
        {outfit === 'corbata' && <path d="M43 63 l-4 4 l4 3 l4 -3z M43 70 l-5 5 l5 11 l5 -11z" fill={col} {...S} />}
        {outfit === 'mono' && <g className="bot-bow"><path d="M43 68 l-11 -6 v12z M43 68 l11 -6 v12z" fill={col} {...S} /><circle cx="43" cy="68" r="3" fill="#e8ebf4" /></g>}
        {outfit === 'bufanda' && <g className="bot-scarf"><rect x="11" y="60" width="64" height="9" rx="4.5" fill="#ff7a9c" {...S} /><rect x="52" y="64" width="10" height="20" rx="3" fill="#e0557a" {...S} /></g>}
        {outfit === 'delantal' && <><rect x="24" y="66" width="38" height="20" rx="6" fill="#e8ebf4" {...S} /><path d="M30 66 l-5 -4 M56 66 l5 -4" stroke="#e8ebf4" strokeWidth="2.5" strokeLinecap="round" /></>}
        {outfit === 'chaleco' && <g fill="#1b1d2c" opacity=".9"><path d="M12 62 h20 v24 h-12 a8 8 0 0 1 -8 -8z" /><path d="M74 62 h-20 v24 h12 a8 8 0 0 0 8 -8z" /></g>}
        {outfit === 'hoodie' && <g><path d="M18 62 q25 18 50 0 v7 q-25 18 -50 0z" fill={col} {...S} /><path d="M38 72 v10 M48 72 v10" stroke="#e8ebf4" strokeWidth="2" strokeLinecap="round" /></g>}
        <text x={emojiX} y="77" textAnchor="middle" fontSize={emojiX === 43 ? 17 : 14}>{a.emoji}</text>
        {acc === 'gorro' && <><path d="M15 24 q0 -20 28 -20 q28 0 28 20z" fill="#ff7a9c" {...S} /><rect x="13" y="19" width="60" height="7" rx="3.5" fill="#e0557a" {...S} /><circle cx="43" cy="4" r="4" fill="#e8ebf4" {...S} /></>}
        {acc === 'sombrero' && <><rect x="29" y="1" width="28" height="15" rx="2" fill="#1b1d2c" {...S} /><rect x="29" y="11" width="28" height="3" fill={col} /><rect x="19" y="15" width="48" height="4" rx="2" fill="#1b1d2c" {...S} /></>}
        {acc === 'corona' && <path d="M25 19 l2 -15 l8 7 l8 -10 l8 10 l8 -7 l2 15z" fill="#ffd166" stroke={mode === 'chibi' ? OL : '#d9a13a'} strokeWidth="1.8" strokeLinejoin="round" />}
        {acc === 'audifonos' && <><path d="M8 34 q0 -28 35 -28 q35 0 35 28" stroke="#e8ebf4" strokeWidth="4" fill="none" /><rect x="2" y="27" width="11" height="22" rx="5" fill="#e8ebf4" {...S} /><rect x="73" y="27" width="11" height="22" rx="5" fill="#e8ebf4" {...S} /></>}
        {acc === 'orejas' && <g className="bot-ears"><path d="M17 24 l1 -20 l16 12z" fill={col} {...S} /><path d="M69 24 l-1 -20 l-16 12z" fill={col} {...S} /><path d="M21 17 l.8 -9 l7 5.5z M65 17 l-.8 -9 l-7 5.5z" fill="#ff9db8" /></g>}
        {acc === 'halo' && <ellipse className="bot-halo" cx="43" cy="7" rx="15" ry="4" fill="none" stroke="#ffd166" strokeWidth="3" />}
        {acc === 'cuernos' && <><path d="M21 22 q-6 -4 -5 -16 q9 3 15 12z" fill="#ff5d5d" {...S} /><path d="M65 22 q6 -4 5 -16 q-9 3 -15 12z" fill="#ff5d5d" {...S} /></>}
        {acc === 'parche' && <><path d="M16 26 L70 44" stroke="#1b1d2c" strokeWidth="2.5" /><ellipse cx="33.5" cy="39" rx="9" ry="10" fill="#1b1d2c" stroke="#8a92aa" strokeWidth="1" /></>}
        {acc === 'gafasSol' && <g fill="#05060c" stroke="#e8ebf4" strokeWidth="2"><rect x="24" y="31" width="19" height="15" rx="5" /><rect x="44" y="31" width="19" height="15" rx="5" /></g>}
        {acc === 'lentes' && <g fill="none" stroke="#e8ebf4" strokeWidth="2.5"><rect x="25" y="30" width="17" height="18" rx="5" /><rect x="44" y="30" width="17" height="18" rx="5" /></g>}
      </g>
    </svg>
  )
}

export function StyledRobot({ a, state, size, style }: { a: TeamAgent; state: 'idle' | 'work' | 'done'; size: number; style: 'chibi' | 'plano' | 'pixel' | 'kawaii' }): ReactNode {
  return style === 'pixel' ? <PixelRobot a={a} state={state} size={size} /> : <VectorRobot a={a} state={state} size={size} mode={style} />
}
