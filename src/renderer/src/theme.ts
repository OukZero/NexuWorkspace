// Apariencia y perfil, compartidos con la ventana flotante vía localStorage:
// tema día/noche/sistema, color de acento, densidad, tamaño de letra y nombre.
export type ThemeMode = 'light' | 'dark' | 'system'
export type Density = 'comfortable' | 'compact'

/** Color de acento por perfil: [tema oscuro, tema claro]. */
export const ACCENTS: Record<string, [string, string]> = {
  indigo: ['#7c8cff', '#4f5fe0'],
  verde: ['#5ee0b0', '#12936a'],
  rosa: ['#ff7ab6', '#d6336c'],
  ambar: ['#ffb454', '#b86e00'],
  cian: ['#5ad1ff', '#0a7fa8']
}

const mq = matchMedia('(prefers-color-scheme: light)')

const read = (k: string, d: string): string => {
  try {
    return localStorage.getItem(k) || d
  } catch {
    return d
  }
}
const write = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sin storage */
  }
}

export const getMode = (): ThemeMode => read('theme', 'system') as ThemeMode
export const getAccent = (): string => (read('accent', 'indigo') in ACCENTS ? read('accent', 'indigo') : 'indigo')
export const getDensity = (): Density => (read('density', 'comfortable') === 'compact' ? 'compact' : 'comfortable')
/** Tamaño de letra en % (90–120). */
export const getFontScale = (): number => Math.min(120, Math.max(90, Number(read('fontScale', '100')) || 100))

function apply(): void {
  const root = document.documentElement
  const m = getMode()
  const theme = m === 'system' ? (mq.matches ? 'light' : 'dark') : m
  root.dataset.theme = theme
  root.dataset.density = getDensity()
  const [dark, light] = ACCENTS[getAccent()]
  root.style.setProperty('--accent', theme === 'light' ? light : dark)
  root.style.setProperty('zoom', String(getFontScale() / 100))
}

export function setMode(m: ThemeMode): void {
  write('theme', m)
  apply()
}
export function setAccent(k: string): void {
  write('accent', k)
  apply()
}
export function setDensity(d: Density): void {
  write('density', d)
  apply()
}
export function setFontScale(n: number): void {
  write('fontScale', String(n))
  apply()
}

export const getName = (): string => read('userName', '')
export const setName = (n: string): void => write('userName', n)

/** Aplica la apariencia antes del primer pintado y la mantiene sincronizada entre ventanas. */
export function initTheme(): void {
  mq.addEventListener('change', apply)
  addEventListener('storage', apply)
  apply()
}
