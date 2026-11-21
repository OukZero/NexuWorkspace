import type { ReactNode } from 'react'

/**
 * Objetos de la sala dibujados en SVG (64×64). `wall` = cuelga de la pared; `w` = ancho base en px.
 * Cada uno lleva degradados (id `g-…`, únicos por objeto), luz arriba-izquierda, sombra de contacto y un detalle vivo.
 */
export interface Asset { k: string; label: string; wall: boolean; w: number; el: ReactNode }

const shade = <ellipse cx="32" cy="58" rx="20" ry="3.2" fill="#000" opacity=".28" />
const lin = (id: string, a: string, b: string, vertical = true): ReactNode => (
  <linearGradient id={id} x1="0" y1="0" x2={vertical ? 0 : 1} y2={vertical ? 1 : 0}><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
)

export const ASSETS: Asset[] = [
  { k: 'plant', label: 'Planta', wall: false, w: 60, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-pl-leaf', '#7af0c4', '#2fa675')}{lin('g-pl-pot', '#e8956a', '#b4623a')}</defs>{shade}
      <g className="as-sway">
        <path d="M32 42 C16 36 11 20 18 8 C27 14 33 26 32 42Z" fill="url(#g-pl-leaf)" />
        <path d="M32 42 C48 36 53 18 46 6 C37 12 31 26 32 42Z" fill="url(#g-pl-leaf)" />
        <path d="M32 44 C27 30 30 16 32 4 C40 18 38 32 32 44Z" fill="#46d49c" />
        <path d="M32 42 C31 30 31 20 32 10 M32 40 C24 34 20 26 19 16 M32 40 C40 34 44 24 45 14" stroke="#1f7d57" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity=".6" />
        <path d="M24 22 C27 26 29 30 30 34" stroke="#fff" strokeOpacity=".35" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </g>
      <path d="M18 41 h28 l-3.5 17 a3 3 0 0 1 -3 2.5 h-15 a3 3 0 0 1 -3 -2.5z" fill="url(#g-pl-pot)" />
      <rect x="15" y="37" width="34" height="7" rx="3" fill="#f0a578" /><rect x="15" y="37" width="34" height="2.5" rx="1.2" fill="#fff" opacity=".28" />
      <ellipse cx="32" cy="38" rx="14" ry="2" fill="#4a2f22" opacity=".55" />
    </svg>
  ) },
  { k: 'cactus', label: 'Cactus', wall: false, w: 50, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-ca-body', '#6fe29b', '#2f9b5f', false)}{lin('g-ca-pot', '#e6b06f', '#b9803f')}</defs>{shade}
      <path d="M25 32 h-5 a5 5 0 0 1 -5 -5 v-7 a3.5 3.5 0 0 1 7 0 v5 h3z" fill="url(#g-ca-body)" />
      <path d="M39 38 h5 a5 5 0 0 0 5 -5 v-9 a3.5 3.5 0 0 0 -7 0 v7 h-3z" fill="url(#g-ca-body)" />
      <rect x="24" y="10" width="16" height="42" rx="8" fill="url(#g-ca-body)" />
      <path d="M29 16 v32 M35 16 v32" stroke="#237a49" strokeWidth="1.3" opacity=".55" />
      <g stroke="#f6f1d4" strokeWidth="1" strokeLinecap="round"><path d="M26 20 l-2.5 -1 M38 26 l2.5 -1 M26 34 l-2.5 -1 M38 40 l2.5 -1 M17 22 l-2 -1.4 M47 27 l2 -1.4" /></g>
      <path d="M28 14 q-1 5 -1 10" stroke="#fff" strokeOpacity=".4" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="32" cy="9.5" r="3" fill="#ff7a9c" /><circle cx="32" cy="9.5" r="1.2" fill="#ffd0dc" />
      <path d="M19 48 h26 l-3 11 a2.5 2.5 0 0 1 -2.5 2 h-15 a2.5 2.5 0 0 1 -2.5 -2z" fill="url(#g-ca-pot)" /><rect x="17" y="46" width="30" height="5" rx="2" fill="#f0c486" />
    </svg>
  ) },
  { k: 'cat', label: 'Gato', wall: false, w: 62, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-ct-fur', '#ffc673', '#e8963a')}</defs>{shade}
      <path className="as-tail" d="M48 52 C63 52 61 32 52 34" fill="none" stroke="#e8963a" strokeWidth="6.5" strokeLinecap="round" />
      <path d="M48 52 C63 52 61 32 52 34" fill="none" stroke="#c97a2a" strokeWidth="1.5" strokeDasharray="3 5" strokeLinecap="round" opacity=".6" />
      <ellipse cx="31" cy="48" rx="19" ry="12.5" fill="url(#g-ct-fur)" />
      <path d="M20 42 q3 3 0 7 M27 40 q3 3 0 8" stroke="#c97a2a" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity=".7" />
      <ellipse cx="22" cy="57" rx="5" ry="3" fill="#fbb85c" /><ellipse cx="37" cy="57" rx="5" ry="3" fill="#fbb85c" />
      <path d="M14 24 l2 -14 l10 7z M36 17 l10 -7 l2 14z" fill="url(#g-ct-fur)" /><path d="M17 20 l1 -7 l5 4z M39 17 l5 -4 l1 7z" fill="#f4a0a8" />
      <circle cx="27" cy="31" r="13" fill="url(#g-ct-fur)" />
      <path d="M24 19 v5 M27 18 v6 M30 19 v5" stroke="#c97a2a" strokeWidth="1.6" strokeLinecap="round" opacity=".8" />
      <ellipse cx="29" cy="37" rx="6" ry="4.4" fill="#fff3dc" />
      <g className="as-eyes"><ellipse cx="22" cy="30" rx="2.6" ry="3.3" fill="#2b2f4a" /><ellipse cx="32" cy="30" rx="2.6" ry="3.3" fill="#2b2f4a" /><circle cx="22.9" cy="28.7" r="1" fill="#fff" /><circle cx="32.9" cy="28.7" r="1" fill="#fff" /></g>
      <path d="M26.5 34.5 h3 l-1.5 2z" fill="#e87a8a" /><path d="M28 36.5 q-2 2.5 -4 1.5 M28 36.5 q2 2.5 4 1.5" stroke="#6b4a3a" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M12 33 h8 M12 37 h8 M36 33 h8 M36 37 h8" stroke="#fff" strokeOpacity=".7" strokeWidth="1" strokeLinecap="round" />
    </svg>
  ) },
  { k: 'trophy', label: 'Trofeo', wall: false, w: 46, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-tr-gold', '#fff0a8', '#e8a62a', false)}{lin('g-tr-base', '#8a6a3c', '#5a3f1c')}</defs>{shade}
      <path d="M19 8 h26 v16 a13 13 0 0 1 -26 0z" fill="url(#g-tr-gold)" />
      <path d="M19 13 h-9 v5 a9 9 0 0 0 9 9 M45 13 h9 v5 a9 9 0 0 1 -9 9" fill="none" stroke="#e8a62a" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M26 12 v13" stroke="#fff" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 15 l2.2 4.6 l5 .6 l-3.7 3.4 l1 5 l-4.5 -2.5 l-4.5 2.5 l1 -5 l-3.7 -3.4 l5 -.6z" fill="#fff7cf" opacity=".85" />
      <path d="M28 37 h8 l1.5 8 h-11z" fill="url(#g-tr-gold)" />
      <rect x="18" y="45" width="28" height="6" rx="1.5" fill="url(#g-tr-base)" /><rect x="14" y="51" width="36" height="7" rx="2" fill="url(#g-tr-base)" />
      <rect x="25" y="53" width="14" height="2.4" rx="1.2" fill="#ffd978" opacity=".8" />
    </svg>
  ) },
  { k: 'frame', label: 'Cuadro', wall: true, w: 64, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-fr-wood', '#b07a52', '#6e4328')}{lin('g-fr-sky', '#1f2f6e', '#c87aa8')}</defs>
      <path d="M32 3 l-14 7 M32 3 l14 7" stroke="#8a8fa4" strokeWidth="1" fill="none" />
      <rect x="5" y="9" width="54" height="44" rx="3" fill="url(#g-fr-wood)" /><rect x="5" y="9" width="54" height="3" rx="1.5" fill="#fff" opacity=".22" />
      <rect x="10" y="14" width="44" height="34" fill="#f2e9d4" /><rect x="11.5" y="15.5" width="41" height="31" fill="url(#g-fr-sky)" />
      <circle cx="42" cy="26" r="5.5" fill="#ffe29a" /><circle cx="42" cy="26" r="8.5" fill="#ffe29a" opacity=".22" />
      <path d="M11.5 46.5 l12 -17 l9 11 l7 -8 l13 14z" fill="#2f8f78" /><path d="M11.5 46.5 l12 -17 l6 8 l-9 9z" fill="#237a63" /><path d="M23.5 29.5 l-3 4 l3 -1 l2 2z" fill="#fff" opacity=".7" />
      <path d="M11.5 15.5 h41 v31 h-41z" fill="none" stroke="#000" strokeOpacity=".25" strokeWidth="1.5" />
    </svg>
  ) },
  { k: 'poster', label: 'Póster', wall: true, w: 50, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-po-bg', '#a9b9ff', '#5a6fe0')}</defs>
      <path d="M16 7 h32 l3 3 v43 l-3 3 h-32 l-3 -3 v-43z" fill="#000" opacity=".25" transform="translate(1.5 2)" />
      <rect x="13" y="5" width="38" height="52" rx="2" fill="#f4f0e4" />
      <rect x="17" y="9" width="30" height="31" fill="url(#g-po-bg)" />
      <circle cx="32" cy="25" r="9" fill="#fff" opacity=".18" />
      <path d="M32 14 l3.4 7.4 l8 .9 l-6 5.5 l1.7 8 l-7.1 -4.1 l-7.1 4.1 l1.7 -8 l-6 -5.5 l8 -.9z" fill="#fff" />
      <path d="M17 40 l9 -7 l7 6 l6 -5 l8 6 v0 h-30z" fill="#2c3a9a" opacity=".5" />
      <rect x="17" y="45" width="30" height="3" rx="1.5" fill="#2b2f4a" /><rect x="17" y="51" width="18" height="2" rx="1" fill="#8a8fa4" />
      <path d="M13 5 h38 v3 h-38z" fill="#fff" opacity=".6" />
    </svg>
  ) },
  { k: 'clock', label: 'Reloj', wall: true, w: 46, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-cl-ring', '#8a92aa', '#3d4468')}</defs>
      <circle cx="33" cy="34" r="25" fill="#000" opacity=".22" />
      <circle cx="32" cy="32" r="26" fill="url(#g-cl-ring)" /><circle cx="32" cy="32" r="22" fill="#f6f3ea" /><circle cx="32" cy="32" r="22" fill="none" stroke="#000" strokeOpacity=".12" strokeWidth="2" />
      <g stroke="#2b2f4a" strokeLinecap="round">
        <path d="M32 13 v4 M32 47 v4 M13 32 h4 M47 32 h4" strokeWidth="2.4" />
        <path d="M44.2 20 l-2 2 M44.2 44 l-2 -2 M19.8 20 l2 2 M19.8 44 l2 -2" strokeWidth="1.2" />
        <path className="as-hand slow" d="M32 32 v-11" strokeWidth="3.2" /><path className="as-hand" d="M32 32 v-16" strokeWidth="2" stroke="#ff7a9c" />
      </g>
      <circle cx="32" cy="32" r="3" fill="#2b2f4a" /><circle cx="32" cy="32" r="1.2" fill="#ff7a9c" />
      <path d="M16 22 a18 18 0 0 1 12 -9" stroke="#fff" strokeOpacity=".7" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  ) },
  { k: 'lamp', label: 'Lámpara', wall: false, w: 54, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-lp-shade', '#ffe0a0', '#f09a4a')}<radialGradient id="g-lp-glow"><stop offset="0" stopColor="#ffd98a" stopOpacity=".55" /><stop offset="1" stopColor="#ffd98a" stopOpacity="0" /></radialGradient></defs>
      <ellipse className="as-glow" cx="32" cy="24" rx="30" ry="24" fill="url(#g-lp-glow)" />{shade}
      <path d="M32 24 l-9 34 h18z" fill="#ffd98a" opacity=".14" />
      <rect x="30.4" y="24" width="3.2" height="32" rx="1.6" fill="#a7adc2" /><rect x="30.4" y="24" width="1.2" height="32" fill="#fff" opacity=".4" />
      <path d="M18 24 l6 -17 h16 l6 17z" fill="url(#g-lp-shade)" /><path d="M24 7 h16 l1 3 h-18z" fill="#fff" opacity=".35" />
      <ellipse cx="32" cy="24" rx="14" ry="2.6" fill="#fff4cf" />
      <ellipse cx="32" cy="57" rx="12" ry="4" fill="#4a5068" /><ellipse cx="32" cy="55.6" rx="12" ry="3.4" fill="#6b7390" />
    </svg>
  ) },
  { k: 'sofa', label: 'Sofá', wall: false, w: 104, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-sf-back', '#7c6cf0', '#5444c8')}{lin('g-sf-seat', '#9a8cff', '#6a5be0')}{lin('g-sf-arm', '#6a5be0', '#4a3bb8', false)}</defs>
      <ellipse cx="32" cy="58" rx="29" ry="3.4" fill="#000" opacity=".3" />
      <rect x="7" y="16" width="50" height="28" rx="10" fill="url(#g-sf-back)" /><rect x="7" y="16" width="50" height="4" rx="2" fill="#fff" opacity=".2" />
      <circle cx="22" cy="30" r="1.4" fill="#3a2f90" opacity=".7" /><circle cx="32" cy="28" r="1.4" fill="#3a2f90" opacity=".7" /><circle cx="42" cy="30" r="1.4" fill="#3a2f90" opacity=".7" />
      <rect x="2" y="28" width="13" height="26" rx="6.5" fill="url(#g-sf-arm)" /><rect x="49" y="28" width="13" height="26" rx="6.5" fill="url(#g-sf-arm)" />
      <rect x="11" y="34" width="42" height="16" rx="6" fill="url(#g-sf-seat)" /><path d="M32 35 v14" stroke="#4a3bb8" strokeWidth="1.6" opacity=".6" /><rect x="11" y="34" width="42" height="3" rx="1.5" fill="#fff" opacity=".22" />
      <rect x="17" y="24" width="12" height="10" rx="3.5" fill="#ff7a9c" transform="rotate(-8 23 29)" /><path d="M19 27 l8 -2 M19 30 l8 -2" stroke="#fff" strokeOpacity=".4" strokeWidth="1.2" transform="rotate(-8 23 29)" />
      <rect x="9" y="53" width="4" height="5" rx="1" fill="#2c2370" /><rect x="51" y="53" width="4" height="5" rx="1" fill="#2c2370" />
    </svg>
  ) },
  { k: 'books', label: 'Libros', wall: false, w: 46, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-bk-1', '#6f86ff', '#3a4fc0', false)}{lin('g-bk-2', '#ff9ab4', '#e0507a', false)}{lin('g-bk-3', '#7af0c4', '#2fa675', false)}</defs>{shade}
      <rect x="9" y="42" width="46" height="12" rx="2" fill="url(#g-bk-1)" /><rect x="9" y="42" width="5" height="12" rx="2" fill="#2c3a9a" /><path d="M18 45 h30 M18 51 h22" stroke="#fff" strokeOpacity=".5" strokeWidth="1.4" /><rect x="40" y="44.5" width="9" height="3" rx="1.5" fill="#ffd978" opacity=".85" />
      <rect x="13" y="30" width="40" height="12" rx="2" fill="url(#g-bk-2)" /><rect x="13" y="30" width="5" height="12" rx="2" fill="#b0345c" /><path d="M22 33 h24 M22 39 h16" stroke="#fff" strokeOpacity=".5" strokeWidth="1.4" />
      <rect x="11" y="18" width="38" height="12" rx="2" fill="url(#g-bk-3)" transform="rotate(-3 30 24)" /><rect x="11" y="18" width="5" height="12" rx="2" fill="#1f7d57" transform="rotate(-3 30 24)" /><path d="M20 22 h22 M20 27 h14" stroke="#fff" strokeOpacity=".5" strokeWidth="1.4" transform="rotate(-3 30 24)" />
      <path d="M9 42 h46" stroke="#fff" strokeOpacity=".25" strokeWidth="1" />
    </svg>
  ) },
  { k: 'coffee', label: 'Café', wall: false, w: 38, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-cf-cup', '#ffffff', '#cfd3e2', false)}</defs>{shade}
      <g className="as-steam" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2.6" strokeLinecap="round"><path d="M24 22 q-5 -6 0 -12" /><path d="M33 22 q-5 -6 0 -12" /><path d="M42 22 q-4 -5 0 -10" /></g>
      <ellipse cx="32" cy="55" rx="22" ry="4.5" fill="#8a92aa" /><ellipse cx="32" cy="53.6" rx="22" ry="4" fill="#b8bfd4" />
      <path d="M46 30 h3 a6 6 0 0 1 0 12 h-4" fill="none" stroke="url(#g-cf-cup)" strokeWidth="4.2" />
      <path d="M14 26 h36 v15 a14 14 0 0 1 -14 14 h-8 a14 14 0 0 1 -14 -14z" fill="url(#g-cf-cup)" />
      <ellipse cx="32" cy="26.5" rx="18" ry="4" fill="#e4e7f2" /><ellipse cx="32" cy="27" rx="15.5" ry="3" fill="#6b4226" /><ellipse cx="29" cy="26.4" rx="6" ry="1" fill="#a8744a" opacity=".8" />
      <path d="M22 36 h20 M24 42 q8 4 16 0" stroke="#ff7a9c" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".85" />
    </svg>
  ) },
  { k: 'console', label: 'Consola', wall: false, w: 54, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-cn-body', '#5a6590', '#2c3354')}</defs>
      <ellipse cx="32" cy="52" rx="26" ry="3.4" fill="#000" opacity=".3" />
      <path d="M12 24 h40 a9 9 0 0 1 9 9 v8 a7 7 0 0 1 -12 5 l-5 -6 h-24 l-5 6 a7 7 0 0 1 -12 -5 v-8 a9 9 0 0 1 9 -9z" fill="url(#g-cn-body)" />
      <path d="M12 24 h40 a9 9 0 0 1 8 5 h-56 a9 9 0 0 1 8 -5z" fill="#fff" opacity=".18" />
      <rect x="25" y="29" width="14" height="9" rx="2" fill="#0b0d1c" /><rect x="26.5" y="30.5" width="11" height="6" rx="1" fill="#2a3a8a" /><path d="M28 34 l3 -2.5 l2.5 2 l2 -1.5" stroke="#5fe3b4" strokeWidth="1.2" fill="none" />
      <path d="M17 31 v9 M12.5 35.5 h9" stroke="#e8ebf4" strokeWidth="3" strokeLinecap="round" />
      <circle cx="46" cy="32" r="2.8" fill="#ff7a9c" /><circle cx="52" cy="36.5" r="2.8" fill="#5fe3b4" /><circle cx="46" cy="40.5" r="2.8" fill="#8fa4ff" /><circle cx="40" cy="36.5" r="2.8" fill="#ffd27a" />
      <circle cx="25" cy="43" r="1.6" fill="#8a92aa" /><circle cx="39" cy="43" r="1.6" fill="#8a92aa" />
    </svg>
  ) },
  { k: 'shelf', label: 'Estantería', wall: false, w: 96, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-sh-wood', '#8a6a9e', '#5a4278')}{lin('g-sh-in', '#2a2348', '#3a3060')}</defs>
      <ellipse cx="32" cy="61" rx="26" ry="2.6" fill="#000" opacity=".3" />
      <rect x="8" y="4" width="48" height="56" rx="3" fill="url(#g-sh-wood)" /><rect x="11" y="7" width="42" height="50" rx="1.5" fill="url(#g-sh-in)" />
      <path d="M11 22 h42 M11 39 h42" stroke="#7a5c90" strokeWidth="2.6" /><rect x="8" y="4" width="48" height="2.4" rx="1.2" fill="#fff" opacity=".22" />
      <rect x="14" y="10" width="4" height="11" rx="1" fill="#6f86ff" /><rect x="18.5" y="11" width="3.5" height="10" rx="1" fill="#ff7a9c" /><rect x="22.5" y="9" width="4" height="12" rx="1" fill="#ffd27a" /><rect x="27" y="12" width="3.2" height="9" rx="1" fill="#5fe3b4" transform="rotate(12 28 16)" />
      <circle cx="44" cy="16" r="4.5" fill="#46d49c" /><rect x="41" y="17" width="6" height="4" rx="1" fill="#e8956a" />
      <rect x="14" y="30" width="12" height="8" rx="1.5" fill="#b8bfd4" /><rect x="15.5" y="31.5" width="9" height="5" rx="1" fill="#8fa4ff" opacity=".7" />
      <rect x="34" y="26" width="3.5" height="12" rx="1" fill="#ff9ab4" /><rect x="38" y="27" width="3.5" height="11" rx="1" fill="#8fa4ff" /><rect x="42" y="25" width="4" height="13" rx="1" fill="#7af0c4" /><rect x="46.5" y="28" width="3.5" height="10" rx="1" fill="#ffb868" />
      <rect x="14" y="47" width="16" height="8" rx="1.5" fill="#5a4278" /><rect x="14" y="47" width="16" height="2" fill="#fff" opacity=".2" /><circle cx="44" cy="51" r="4" fill="#ffe0a0" /><path d="M42 51 l2 -2 l2 2" stroke="#b9803f" strokeWidth="1" fill="none" />
    </svg>
  ) },
  { k: 'board', label: 'Pizarra', wall: true, w: 120, el: (
    <svg viewBox="0 0 64 40"><defs>{lin('g-bd-frame', '#b8bfd4', '#7a83a0')}</defs>
      <rect x="2" y="2" width="60" height="34" rx="2.5" fill="url(#g-bd-frame)" /><rect x="4.5" y="4.5" width="55" height="29" rx="1.5" fill="#f4f6fc" />
      <path d="M8 10 h14 M8 14 h10 M8 18 h12" stroke="#5b73f0" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="27" y="8" width="11" height="7" rx="1.5" fill="#ffd27a" /><rect x="40" y="8" width="11" height="7" rx="1.5" fill="#7af0c4" /><rect x="27" y="17" width="11" height="7" rx="1.5" fill="#ff9ab4" />
      <path d="M8 29 l6 -5 l5 3 l7 -7 l6 4" stroke="#ff7a9c" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="47" cy="25" r="4" fill="none" stroke="#5fe3b4" strokeWidth="1.3" /><path d="M45 25 l1.5 1.5 l3 -3" stroke="#5fe3b4" strokeWidth="1.3" fill="none" />
      <rect x="18" y="35" width="28" height="2.6" rx="1.3" fill="#7a83a0" /><rect x="22" y="33.5" width="6" height="2" rx="1" fill="#ff7a9c" /><rect x="30" y="33.5" width="6" height="2" rx="1" fill="#5b73f0" />
    </svg>
  ) },
  { k: 'server', label: 'Servidor', wall: false, w: 58, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-sv-body', '#3d4468', '#1d2238', false)}</defs>
      <ellipse cx="32" cy="61" rx="18" ry="2.4" fill="#000" opacity=".3" />
      <rect x="16" y="4" width="32" height="56" rx="3" fill="url(#g-sv-body)" /><rect x="16" y="4" width="32" height="2" rx="1" fill="#fff" opacity=".2" />
      {[10, 22, 34, 46].map((y, i) => (
        <g key={y}>
          <rect x="19" y={y} width="26" height="9" rx="1.5" fill="#0b0d1c" />
          <path d={`M22 ${y + 4.5} h10`} stroke="#3a4060" strokeWidth="1.6" strokeLinecap="round" />
          <circle className={`as-led l${i}`} cx="38" cy={y + 4.5} r="1.6" fill="#5fe3b4" /><circle className={`as-led l${(i + 2) % 4}`} cx="42" cy={y + 4.5} r="1.6" fill={i % 2 ? '#8fa4ff' : '#ffd27a'} />
        </g>
      ))}
    </svg>
  ) },
  { k: 'cooler', label: 'Dispensador', wall: false, w: 46, el: (
    <svg viewBox="0 0 64 64"><defs>{lin('g-wc-water', '#bfe8ff', '#5aa8f0')}{lin('g-wc-body', '#f4f6fc', '#b8bfd4', false)}</defs>{shade}
      <path d="M22 4 h20 a3 3 0 0 1 3 3 v14 a6 6 0 0 1 -6 6 h-14 a6 6 0 0 1 -6 -6 v-14 a3 3 0 0 1 3 -3z" fill="url(#g-wc-water)" opacity=".85" />
      <path d="M24 8 v12" stroke="#fff" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round" />
      <circle className="as-bubble" cx="34" cy="20" r="1.4" fill="#fff" opacity=".8" /><circle className="as-bubble b2" cx="38" cy="22" r="1" fill="#fff" opacity=".8" />
      <rect x="18" y="27" width="28" height="31" rx="3" fill="url(#g-wc-body)" /><rect x="24" y="33" width="16" height="9" rx="2" fill="#3d4468" />
      <rect x="27" y="35" width="3" height="4" rx="1" fill="#5aa8f0" /><rect x="34" y="35" width="3" height="4" rx="1" fill="#ff7a9c" /><rect x="24" y="44" width="16" height="2" rx="1" fill="#8a92aa" />
    </svg>
  ) },
  { k: 'beanbag', label: 'Puf', wall: false, w: 66, el: (
    <svg viewBox="0 0 64 64"><defs><radialGradient id="g-bb" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#ffb3c6" /><stop offset="1" stopColor="#d9467a" /></radialGradient></defs>
      <ellipse cx="32" cy="59" rx="26" ry="3.4" fill="#000" opacity=".3" />
      <path d="M8 52 C4 34 16 18 32 18 C48 18 60 34 56 52 C50 60 14 60 8 52Z" fill="url(#g-bb)" />
      <path d="M32 19 C28 32 28 46 32 58 M32 19 C38 32 38 46 32 58" stroke="#b03462" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".45" />
      <path d="M20 26 C24 22 30 21 34 22" stroke="#fff" strokeOpacity=".45" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  ) },
  { k: 'neon', label: 'Neón', wall: true, w: 90, el: (
    <svg viewBox="0 0 64 32"><defs><filter id="g-ne-blur" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="1.8" /></filter></defs>
      <rect x="2" y="2" width="60" height="28" rx="5" fill="#0b0d1c" opacity=".55" stroke="#2a2f55" />
      <g className="as-flicker" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 10 l-7 6 l7 6 M47 10 l7 6 l-7 6 M36 8 l-8 16" stroke="#ff4fd8" strokeWidth="3.4" filter="url(#g-ne-blur)" opacity=".9" />
        <path d="M17 10 l-7 6 l7 6 M47 10 l7 6 l-7 6 M36 8 l-8 16" stroke="#ffd1f5" strokeWidth="1.5" />
      </g>
    </svg>
  ) },
  { k: 'globe', label: 'Globo', wall: false, w: 44, el: (
    <svg viewBox="0 0 64 64"><defs><radialGradient id="g-gl" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#9fd0ff" /><stop offset="1" stopColor="#2f5fc0" /></radialGradient></defs>{shade}
      <path d="M14 28 a18 18 0 0 0 30 13" stroke="#c9a46a" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <circle cx="32" cy="26" r="15" fill="url(#g-gl)" />
      <g className="as-turn"><path d="M24 18 q5 -3 8 1 q-2 4 2 6 q-3 4 -8 2 q-4 -4 -2 -9z M36 30 q5 -1 6 3 q-2 4 -6 3z" fill="#5fe3b4" opacity=".9" /></g>
      <path d="M22 16 a12 12 0 0 1 8 -4" stroke="#fff" strokeOpacity=".6" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="30.5" y="41" width="3" height="10" fill="#8a6a3c" /><ellipse cx="32" cy="54" rx="11" ry="3.4" fill="#6e4328" /><ellipse cx="32" cy="53" rx="11" ry="3" fill="#b07a52" />
    </svg>
  ) }
]

export const ASSET_BY_KEY: Record<string, Asset> = Object.fromEntries(ASSETS.map((a) => [a.k, a]))

/** Emoji antiguos (campo `decor`) → asset equivalente. */
export const EMOJI_TO_ASSET: Record<string, string> = { '🪴': 'plant', '🐈': 'cat', '🏆': 'trophy', '🖼️': 'frame', '🎮': 'console', '☕': 'coffee', '🕹️': 'console', '🛋️': 'sofa', '📚': 'books' }
