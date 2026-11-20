import type { ReactNode } from 'react'

/** Objetos de la sala dibujados en SVG (64×64). `wall` = cuelga de la pared; `w` = ancho base en px. */
export interface Asset { k: string; label: string; wall: boolean; w: number; el: ReactNode }

export const ASSETS: Asset[] = [
  { k: 'plant', label: 'Planta', wall: false, w: 60, el: (
    <svg viewBox="0 0 64 64"><g className="as-sway"><path d="M32 40 C18 34 14 20 20 10 C28 16 32 26 32 40Z" fill="#3fbf8a" /><path d="M32 40 C46 34 50 18 44 8 C36 14 32 26 32 40Z" fill="#5fe3b4" /><path d="M32 42 C30 30 32 18 32 8 C38 20 36 32 32 42Z" fill="#2fa675" /></g><path d="M18 40 h28 l-4 20 h-20z" fill="#c9774a" /><rect x="16" y="37" width="32" height="6" rx="2" fill="#e08c5c" /></svg>
  ) },
  { k: 'cactus', label: 'Cactus', wall: false, w: 50, el: (
    <svg viewBox="0 0 64 64"><rect x="25" y="14" width="14" height="36" rx="7" fill="#4cc27f" /><path d="M25 30 h-6 a4 4 0 0 1 -4 -4 v-6 a3 3 0 0 1 6 0 v4 h4z" fill="#3aa86b" /><path d="M39 36 h6 a4 4 0 0 0 4 -4 v-8 a3 3 0 0 0 -6 0 v6 h-4z" fill="#3aa86b" /><path d="M28 20 v24 M36 20 v24" stroke="#2f8f5a" strokeWidth="1.5" /><path d="M20 48 h24 l-3 12 h-18z" fill="#d9a066" /></svg>
  ) },
  { k: 'cat', label: 'Gato', wall: false, w: 62, el: (
    <svg viewBox="0 0 64 64"><path className="as-tail" d="M48 50 C62 50 60 32 52 34" fill="none" stroke="#f0a24a" strokeWidth="6" strokeLinecap="round" /><ellipse cx="32" cy="48" rx="19" ry="12" fill="#f5b25c" /><circle cx="26" cy="30" r="12" fill="#f5b25c" /><path d="M16 22 l3 -12 l8 8z M36 18 l8 -8 l2 12z" fill="#f5b25c" /><path d="M18 20 l1.5 -6 l4 4z M37 18 l4 -4 l1 6z" fill="#f4a0a0" /><g className="as-eyes"><ellipse cx="22" cy="30" rx="2" ry="2.6" fill="#2b2f4a" /><ellipse cx="31" cy="30" rx="2" ry="2.6" fill="#2b2f4a" /></g><path d="M25 35 l1.5 1.5 l1.5 -1.5z" fill="#e87a8a" /><path d="M10 34 h8 M10 38 h8 M34 34 h8 M34 38 h8" stroke="#fff" strokeOpacity=".6" strokeWidth="1" /><path d="M24 44 q3 8 0 12 M34 46 q3 8 0 10" stroke="#e39a45" strokeWidth="3" fill="none" strokeLinecap="round" /></svg>
  ) },
  { k: 'trophy', label: 'Trofeo', wall: false, w: 46, el: (
    <svg viewBox="0 0 64 64"><path d="M20 10 h24 v14 a12 12 0 0 1 -24 0z" fill="#ffcf5a" /><path d="M20 14 h-8 v4 a8 8 0 0 0 8 8 M44 14 h8 v4 a8 8 0 0 1 -8 8" fill="none" stroke="#e8b43a" strokeWidth="3" /><rect x="29" y="34" width="6" height="12" fill="#e8b43a" /><rect x="20" y="46" width="24" height="8" rx="2" fill="#7a5a2c" /><path d="M26 14 v10" stroke="#fff" strokeOpacity=".6" strokeWidth="3" strokeLinecap="round" /></svg>
  ) },
  { k: 'frame', label: 'Cuadro', wall: true, w: 64, el: (
    <svg viewBox="0 0 64 64"><rect x="6" y="10" width="52" height="42" rx="3" fill="#8a5a3c" /><rect x="10" y="14" width="44" height="34" fill="#243a6b" /><circle cx="42" cy="24" r="5" fill="#ffd27a" /><path d="M10 48 l14 -18 l10 12 l8 -8 l12 14z" fill="#3fbf8a" /><path d="M10 48 l14 -18 l6 8 l-8 10z" fill="#2fa675" /></svg>
  ) },
  { k: 'poster', label: 'Póster', wall: true, w: 50, el: (
    <svg viewBox="0 0 64 64"><rect x="14" y="6" width="36" height="50" rx="2" fill="#f2efe6" /><rect x="18" y="10" width="28" height="30" fill="#8fa4ff" /><path d="M32 16 l3.5 8 l8.5 .8 l-6.5 5.6 l2 8.4 l-7.5 -4.5 l-7.5 4.5 l2 -8.4 l-6.5 -5.6 l8.5 -.8z" fill="#fff" /><path d="M18 46 h28 M18 51 h18" stroke="#8a8fa4" strokeWidth="2" /></svg>
  ) },
  { k: 'clock', label: 'Reloj', wall: true, w: 46, el: (
    <svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#f2efe6" stroke="#5d6478" strokeWidth="4" /><g stroke="#2b2f4a" strokeLinecap="round"><path d="M32 12 v4 M32 48 v4 M12 32 h4 M48 32 h4" strokeWidth="2" /><path className="as-hand slow" d="M32 32 v-12" strokeWidth="3" /><path className="as-hand" d="M32 32 v-17" strokeWidth="2" stroke="#ff7a9c" /></g><circle cx="32" cy="32" r="2.5" fill="#2b2f4a" /></svg>
  ) },
  { k: 'lamp', label: 'Lámpara', wall: false, w: 54, el: (
    <svg viewBox="0 0 64 64"><ellipse cx="32" cy="22" rx="26" ry="20" fill="#ffd27a" opacity=".16" className="as-glow" /><path d="M20 22 l5 -14 h14 l5 14z" fill="#ffb868" /><rect x="30.5" y="22" width="3" height="32" fill="#8a8fa4" /><ellipse cx="32" cy="56" rx="11" ry="3.5" fill="#5d6478" /></svg>
  ) },
  { k: 'sofa', label: 'Sofá', wall: false, w: 104, el: (
    <svg viewBox="0 0 64 64"><rect x="6" y="22" width="52" height="22" rx="8" fill="#6a5be0" /><rect x="2" y="30" width="12" height="22" rx="6" fill="#5a4bd0" /><rect x="50" y="30" width="12" height="22" rx="6" fill="#5a4bd0" /><rect x="12" y="32" width="40" height="14" rx="5" fill="#8478f0" /><path d="M32 33 v12" stroke="#6a5be0" strokeWidth="2" /><rect x="8" y="52" width="4" height="5" fill="#3a2f90" /><rect x="52" y="52" width="4" height="5" fill="#3a2f90" /></svg>
  ) },
  { k: 'books', label: 'Libros', wall: false, w: 46, el: (
    <svg viewBox="0 0 64 64"><rect x="10" y="40" width="44" height="10" rx="2" fill="#4a63d6" /><rect x="14" y="30" width="38" height="10" rx="2" fill="#ff7a9c" /><rect x="12" y="20" width="40" height="10" rx="2" fill="#5fe3b4" /><path d="M16 45 h30 M20 35 h24 M18 25 h26" stroke="#fff" strokeOpacity=".5" strokeWidth="1.5" /></svg>
  ) },
  { k: 'coffee', label: 'Café', wall: false, w: 38, el: (
    <svg viewBox="0 0 64 64"><g className="as-steam" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="2.5" strokeLinecap="round"><path d="M24 22 q-4 -6 0 -12" /><path d="M34 22 q-4 -6 0 -12" /></g><path d="M16 26 h30 v14 a12 12 0 0 1 -12 12 h-6 a12 12 0 0 1 -12 -12z" fill="#f2efe6" /><path d="M46 30 h4 a5 5 0 0 1 0 10 h-4" fill="none" stroke="#f2efe6" strokeWidth="4" /><rect x="16" y="26" width="30" height="5" fill="#8a5a3c" /></svg>
  ) },
  { k: 'console', label: 'Consola', wall: false, w: 54, el: (
    <svg viewBox="0 0 64 64"><path d="M12 28 h40 a8 8 0 0 1 8 8 v6 a6 6 0 0 1 -10 4 l-4 -6 h-28 l-4 6 a6 6 0 0 1 -10 -4 v-6 a8 8 0 0 1 8 -8z" fill="#3d4468" /><path d="M20 33 v8 M16 37 h8" stroke="#e8ebf4" strokeWidth="2.5" strokeLinecap="round" /><circle cx="44" cy="35" r="2.5" fill="#ff7a9c" /><circle cx="50" cy="39" r="2.5" fill="#5fe3b4" /><circle cx="32" cy="36" r="2" fill="#8fa4ff" /></svg>
  ) }
]

export const ASSET_BY_KEY: Record<string, Asset> = Object.fromEntries(ASSETS.map((a) => [a.k, a]))

/** Emoji antiguos (campo `decor`) → asset equivalente. */
export const EMOJI_TO_ASSET: Record<string, string> = { '🪴': 'plant', '🐈': 'cat', '🏆': 'trophy', '🖼️': 'frame', '🎮': 'console', '☕': 'coffee', '🕹️': 'console', '🛋️': 'sofa', '📚': 'books' }
