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

/** Estilos completos (paleta + fondo decorativo). 'clasico' usa solo el tema día/noche. */
export interface Preset {
  label: string
  base: 'light' | 'dark'
  /** Colores de muestra para el selector: [fondo, panel, acento]. */
  swatch: [string, string, string]
  vars: Record<string, string>
  /** Fondo decorativo (CSS background-image) cuando no hay imagen propia. */
  deco: string
}

export const PRESETS: Record<string, Preset> = {
  medianoche: {
    label: 'Medianoche',
    base: 'dark',
    swatch: ['#0a0f1f', '#18234a', '#5a8cff'],
    vars: {
      '--bg': '#0a0f1f', '--panel': '#111a33', '--panel2': '#18234a', '--line': '#26335f',
      '--text': '#e4e9ff', '--muted': '#8a96c4', '--user-bg': '#26357a', '--code-bg': '#070b17', '--over-bg': '#131c3a',
      '--timer-grad': 'linear-gradient(90deg, #1b2a66, #143a5c)'
    },
    deco: 'radial-gradient(900px 500px at 90% -10%, rgba(90,140,255,.22), transparent 70%), radial-gradient(700px 500px at -10% 110%, rgba(120,90,255,.16), transparent 70%)'
  },
  bosque: {
    label: 'Bosque',
    base: 'dark',
    swatch: ['#0c1410', '#1a2b22', '#5ee0b0'],
    vars: {
      '--bg': '#0c1410', '--panel': '#131f19', '--panel2': '#1a2b22', '--line': '#243a2f',
      '--text': '#e4f0ea', '--muted': '#84a394', '--user-bg': '#1f4a38', '--code-bg': '#09100d', '--over-bg': '#14221b',
      '--timer-grad': 'linear-gradient(90deg, #1d4a3a, #2a4a2a)'
    },
    deco: 'radial-gradient(900px 500px at 90% -10%, rgba(94,224,176,.16), transparent 70%), radial-gradient(700px 500px at -10% 110%, rgba(150,220,90,.10), transparent 70%)'
  },
  atardecer: {
    label: 'Atardecer',
    base: 'dark',
    swatch: ['#160f1c', '#2a1f38', '#ff7ab6'],
    vars: {
      '--bg': '#160f1c', '--panel': '#20172a', '--panel2': '#2a1f38', '--line': '#3a2c4d',
      '--text': '#f1e8f7', '--muted': '#a591b8', '--user-bg': '#4a2a6e', '--code-bg': '#100a15', '--over-bg': '#261b32',
      '--timer-grad': 'linear-gradient(90deg, #4a2a6e, #6e3a4a)'
    },
    deco: 'radial-gradient(900px 500px at 90% -10%, rgba(255,122,182,.20), transparent 70%), radial-gradient(700px 500px at -10% 110%, rgba(255,180,84,.12), transparent 70%)'
  },
  papel: {
    label: 'Papel',
    base: 'light',
    swatch: ['#f6f0e4', '#efe6d3', '#b86e00'],
    vars: {
      '--bg': '#f6f0e4', '--panel': '#fffaf0', '--panel2': '#efe6d3', '--line': '#e0d4bb',
      '--text': '#2b2417', '--muted': '#7a6c52', '--user-bg': '#f0e0b8', '--code-bg': '#f1e8d5', '--over-bg': '#f6ecd2',
      '--timer-grad': 'linear-gradient(90deg, #f0e0b8, #d9ecd0)'
    },
    deco: 'radial-gradient(900px 500px at 90% -10%, rgba(255,190,90,.22), transparent 70%)'
  }
}
const PRESET_VARS = Object.keys(PRESETS.medianoche.vars)

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

/** Estilo elegido ('' = clásico, solo día/noche). */
export const getPreset = (): string => (read('preset', '') in PRESETS ? read('preset', '') : '')
/** Imagen de fondo propia (data URL) o ''. */
export const getBgImage = (): string => read('bgImage', '')
/** Cuánto se atenúa la imagen con el color de fondo, en % (40–95). */
export const getBgDim = (): number => Math.min(95, Math.max(40, Number(read('bgDim', '80')) || 80))

/** Opacidad de los paneles sobre la imagen, en % (40 = muy transparentes, 100 = opacos). */
export const getBgGlass = (): number => Math.min(100, Math.max(40, Number(read('bgGlass', '78')) || 78))

function apply(): void {
  const root = document.documentElement
  const m = getMode()
  const p = PRESETS[getPreset()] as Preset | undefined
  const theme = p ? p.base : m === 'system' ? (mq.matches ? 'light' : 'dark') : m
  root.dataset.theme = theme
  root.dataset.density = getDensity()
  for (const k of PRESET_VARS) {
    if (p) root.style.setProperty(k, p.vars[k])
    else root.style.removeProperty(k)
  }
  root.style.setProperty('--bg-deco', p?.deco ?? 'none')
  const img = getBgImage()
  if (img) {
    root.dataset.bg = 'image'
    root.style.setProperty('--bg-image', `url("${img}")`)
    root.style.setProperty('--bg-dim', `${getBgDim()}%`)
    root.style.setProperty('--glass', `${getBgGlass()}%`)
  } else {
    delete root.dataset.bg
    root.style.removeProperty('--bg-image')
    root.style.removeProperty('--bg-dim')
    root.style.removeProperty('--glass')
  }
  const [dark, light] = ACCENTS[getAccent()]
  root.style.setProperty('--accent', theme === 'light' ? light : dark)
  root.style.setProperty('zoom', String(getFontScale() / 100))
}

export function setPreset(k: string): void {
  write('preset', k)
  apply()
}
export function setBgDim(n: number): void {
  write('bgDim', String(n))
  apply()
}
export function setBgGlass(n: number): void {
  write('bgGlass', String(n))
  apply()
}
export function clearBgImage(): void {
  try {
    localStorage.removeItem('bgImage')
  } catch {
    /* sin storage */
  }
  apply()
}
/** Reduce la imagen (máx. 1920 px, JPEG) para que quepa en localStorage y la guarda como fondo. */
export async function setBgImageFile(file: File): Promise<void> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
  const url = c.toDataURL('image/jpeg', 0.82)
  localStorage.setItem('bgImage', url) // lanza si no cabe: lo captura quien llama
  apply()
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
