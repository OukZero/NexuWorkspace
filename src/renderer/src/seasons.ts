/** Eventos del calendario de Chile: dan color, partículas y saludo a la app según la fecha. */
export type Season = { id: string; name: string; emoji: string; color: string; greet: string; bits: string[]; hat?: 'gorro' | 'sombrero' | 'corona' }

export const SEASONS: Season[] = [
  { id: 'navidad', name: 'Navidad', emoji: '🎄', color: '#e5484d', greet: '¡Feliz Navidad! 🎄', bits: ['❄', '❅', '✦', '🎁'], hat: 'gorro' },
  { id: 'anonuevo', name: 'Año Nuevo', emoji: '🎆', color: '#f5c542', greet: '¡Feliz año nuevo! 🎆', bits: ['✦', '🎉', '✨', '🥂'], hat: 'sombrero' },
  { id: 'valentin', name: 'San Valentín', emoji: '💘', color: '#ff5d8f', greet: 'Feliz San Valentín 💘', bits: ['❤', '💕', '💗'] },
  { id: 'pascua', name: 'Semana Santa y Pascua', emoji: '🐣', color: '#b78cf2', greet: 'Felices Pascuas 🐣', bits: ['🥚', '🐣', '🌷'] },
  { id: 'trabajo', name: 'Día del Trabajo', emoji: '🛠', color: '#f08a24', greet: 'Feliz Día del Trabajo 🛠', bits: ['✦', '⚙'] },
  { id: 'glorias', name: 'Glorias Navales', emoji: '⚓', color: '#3b82f6', greet: 'Glorias Navales ⚓', bits: ['⚓', '✦', '🌊'] },
  { id: 'madre', name: 'Día de la Madre', emoji: '💐', color: '#ec6fb0', greet: 'Feliz Día de la Madre 💐', bits: ['🌸', '💐', '❤'] },
  { id: 'padre', name: 'Día del Padre', emoji: '👔', color: '#3aa0c8', greet: 'Feliz Día del Padre 👔', bits: ['✦', '⭐'] },
  { id: 'indigenas', name: 'Día de los Pueblos Indígenas', emoji: '🌄', color: '#d97a2b', greet: 'We Tripantu · Día de los Pueblos Indígenas 🌄', bits: ['✦', '🌿', '☀'] },
  { id: 'carmen', name: 'Virgen del Carmen', emoji: '🌹', color: '#4fa36a', greet: 'Día de la Virgen del Carmen 🌹', bits: ['🌹', '✦'] },
  { id: 'patrias', name: 'Fiestas Patrias', emoji: '🇨🇱', color: '#d52b1e', greet: '¡Felices Fiestas Patrias! 🇨🇱', bits: ['🇨🇱', '✦', '🪁', '⭐'] },
  { id: 'halloween', name: 'Halloween', emoji: '🎃', color: '#ff7a1a', greet: 'Feliz Halloween 🎃', bits: ['🎃', '🦇', '👻'] },
  { id: 'santos', name: 'Todos los Santos', emoji: '🕯', color: '#e0b84f', greet: 'Día de Todos los Santos 🕯', bits: ['🕯', '✦'] }
]

/** Domingo de Pascua (algoritmo gregoriano anónimo). */
function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, mo - 1, da)
}
/** n-ésimo domingo del mes (mes 0-11). */
const nthSunday = (y: number, mo: number, n: number): Date => {
  const first = new Date(y, mo, 1)
  return new Date(y, mo, 1 + ((7 - first.getDay()) % 7) + 7 * (n - 1))
}
const day = (d: Date): number => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 864e5)

/** Evento vigente en la fecha (o el forzado, para previsualizar); null si no hay ninguno. */
export function currentSeason(now = new Date(), force = ''): Season | null {
  if (force) return SEASONS.find((s) => s.id === force) ?? null
  const y = now.getFullYear(), m = now.getMonth(), dd = now.getDate(), t = day(now)
  const id = ((): string | null => {
    if ((m === 11 && dd === 31) || (m === 0 && dd <= 3)) return 'anonuevo'
    if (m === 11) return 'navidad'
    const e = day(easter(y))
    if (t >= e - 7 && t <= e + 1) return 'pascua'
    if (m === 1 && dd >= 12 && dd <= 14) return 'valentin'
    if (m === 4 && dd === 1) return 'trabajo'
    if (m === 4 && dd === 21) return 'glorias'
    if (m === 4 && Math.abs(t - day(nthSunday(y, 4, 2))) <= 2) return 'madre'
    if (m === 5 && Math.abs(t - day(nthSunday(y, 5, 3))) <= 2) return 'padre'
    if (m === 5 && dd >= 20 && dd <= 21) return 'indigenas'
    if (m === 6 && dd === 16) return 'carmen'
    if (m === 8 && dd >= 12 && dd <= 20) return 'patrias'
    if (m === 9 && dd >= 28) return 'halloween'
    if (m === 10 && dd === 1) return 'santos'
    return null
  })()
  return id ? SEASONS.find((s) => s.id === id) ?? null : null
}
