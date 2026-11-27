// Apariencia de la app, compartida con la ventana flotante vía localStorage y respaldada en los datos (Ajustes).
// Todo vive en un solo objeto `Appearance`: tema (día/noche/estilos/colores propios), acento, tipografía, forma,
// movimiento, burbujas del chat, resaltado de código, tema por horario, menú lateral y color por proyecto.
import { useSyncExternalStore } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type Density = 'comfortable' | 'compact'
export type Radius = 'sharp' | 'soft' | 'round'
export type Bubbles = 'solid' | 'soft' | 'outline'
/** Estilos de dibujo de personajes y robots ('clasico' = el diseño original). */
export type CharStyle = 'clasico' | 'chibi' | 'plano' | 'pixel' | 'kawaii'
export const CHAR_STYLES: CharStyle[] = ['clasico', 'chibi', 'plano', 'pixel', 'kawaii']

/** Color de acento por perfil: [tema oscuro, tema claro]. */
export const ACCENTS: Record<string, [string, string]> = {
  indigo: ['#7c8cff', '#4f5fe0'],
  verde: ['#5ee0b0', '#12936a'],
  rosa: ['#ff7ab6', '#d6336c'],
  ambar: ['#ffb454', '#b86e00'],
  cian: ['#5ad1ff', '#0a7fa8'],
  violeta: ['#b794f6', '#7c3aed'],
  rojo: ['#ff7a7a', '#d62839'],
  lima: ['#b6e35a', '#5f8a00'],
  turquesa: ['#4fe3d0', '#0b8f83'],
  naranja: ['#ff9a5a', '#d4560a']
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
  /** Acento propio del estilo (se usa cuando el acento está en «Del tema»). */
  accent?: [string, string]
}

// ---------- utilidades de color ----------
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
export const isHex = (s: string): boolean => HEX.test(s)
function rgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
/** Luminosidad relativa 0..1 (para elegir texto claro u oscuro sobre un color). */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const rgba = (hex: string, a: number): string => {
  const [r, g, b] = rgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

interface Palette {
  bg: string
  panel: string
  panel2: string
  line: string
  text: string
  muted: string
  user: string
  code: string
  over: string
}

function mk(label: string, base: 'light' | 'dark', c: Palette, accent: string | [string, string]): Preset {
  const acc: [string, string] = typeof accent === 'string' ? [accent, accent] : accent
  const a = acc[base === 'dark' ? 0 : 1]
  return {
    label,
    base,
    swatch: [c.bg, c.panel2, a],
    accent: acc,
    vars: {
      '--bg': c.bg, '--panel': c.panel, '--panel2': c.panel2, '--line': c.line, '--text': c.text, '--muted': c.muted,
      '--user-bg': c.user, '--code-bg': c.code, '--over-bg': c.over, '--timer-grad': `linear-gradient(90deg, ${c.user}, ${c.over})`
    },
    deco: `radial-gradient(900px 500px at 90% -10%, ${rgba(a, base === 'dark' ? 0.16 : 0.14)}, transparent 70%)`
  }
}

export const PRESETS: Record<string, Preset> = {
  // predeterminado: paleta del rediseño (fondo oscuro, acento violeta, tarjetas sólidas)
  shutoki: mk(
    'Nexu',
    'dark',
    { bg: '#070b18', panel: '#0e1426', panel2: '#141c33', line: '#1f2a47', text: '#e8edff', muted: '#8d9bc4', user: '#1b2a55', code: '#050813', over: '#131b30' },
    ['#22d3ee', '#0e8fb0']
  ),
  // variante clara de Nexu: fondo azul hielo (no blanco) y acento cian profundo, del mismo degradado del icono
  nexoclaro: mk(
    'Nexu claro',
    'light',
    { bg: '#e8edfa', panel: '#f5f7ff', panel2: '#dbe4f8', line: '#c6d2ee', text: '#131a35', muted: '#55608a', user: '#d3e2ff', code: '#dfe7f8', over: '#edf1ff' },
    ['#22d3ee', '#0b7fa6']
  ),
  // paleta del mockup «nuevo diseño»: casi negro azulado, acento índigo claro, vivo menta y cálido ámbar
  obsidiana: mk(
    'Nexu Obsidiana',
    'dark',
    { bg: '#0a0b10', panel: '#11131b', panel2: '#181b26', line: '#262b3a', text: '#e8ebf4', muted: '#9aa1b4', user: '#1d2440', code: '#07080c', over: '#141722' },
    ['#8fa4ff', '#4a63d6']
  ),
  // paleta del dashboard «Sorvo»: negro carbón, tarjetas grafito y acento naranja cálido (ver styles/sorvo.css)
  sorvo: mk(
    'Sorvo',
    'dark',
    { bg: '#0d0e12', panel: '#16171d', panel2: '#1c1e26', line: '#2a2d38', text: '#f3f3f6', muted: '#8d919e', user: '#3a2418', code: '#08090c', over: '#14161d' },
    ['#ff8a3d', '#e8642a']
  ),
  // paleta «Aqua»: degradado turquesa, cristal blanco y azul marino (ver el final de styles/sorvo.css)
  aqua: mk(
    'Aqua',
    'light',
    { bg: '#bfe8f2', panel: '#eefaff', panel2: '#d6eff6', line: '#9fcddb', text: '#082030', muted: '#2f5266', user: '#cdeaf3', code: '#d9eef5', over: '#e3f4f9' },
    ['#14425e', '#14425e']
  ),
  // paleta «Rubí»: degradado carmesí con cristal rosado y acento rojo coral (ver styles/glass.css)
  rubi: mk(
    'Rubí',
    'light',
    { bg: '#c8323a', panel: '#fbeceb', panel2: '#f3d6d6', line: '#e7b9b9', text: '#2a0d10', muted: '#7a4045', user: '#f6d3d1', code: '#f4dfdf', over: '#f7e3e2' },
    ['#ff6a55', '#d9302a']
  ),
  // paleta «Lavanda»: fondo lavanda claro, barra marino y acento lima (ver styles/glass.css)
  lavanda: mk(
    'Lavanda',
    'light',
    { bg: '#e8e7f6', panel: '#ffffff', panel2: '#efeefa', line: '#d6d4ec', text: '#17143f', muted: '#5d5a8a', user: '#e0defa', code: '#ecebf8', over: '#f5f4fd' },
    ['#c8e63a', '#2a2680']
  ),
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
      '--text': '#2b2417', '--muted': '#74664b', '--user-bg': '#f0e0b8', '--code-bg': '#f1e8d5', '--over-bg': '#f6ecd2',
      '--timer-grad': 'linear-gradient(90deg, #f0e0b8, #d9ecd0)'
    },
    deco: 'radial-gradient(900px 500px at 90% -10%, rgba(255,190,90,.22), transparent 70%)'
  },
  // ----- oscuros populares -----
  dracula: mk('Dracula', 'dark', { bg: '#282a36', panel: '#2f3142', panel2: '#383a4e', line: '#44475a', text: '#f8f8f2', muted: '#9ba3c9', user: '#3d3f63', code: '#1e1f29', over: '#2c2e3e' }, '#bd93f9'),
  nord: mk('Nord', 'dark', { bg: '#2e3440', panel: '#3b4252', panel2: '#434c5e', line: '#4c566a', text: '#eceff4', muted: '#9aa5b8', user: '#40586f', code: '#272c36', over: '#353c4a' }, '#88c0d0'),
  tokyo: mk('Tokyo Night', 'dark', { bg: '#1a1b26', panel: '#1f2335', panel2: '#292e42', line: '#3b4261', text: '#c0caf5', muted: '#8089b3', user: '#2f3b6b', code: '#16161e', over: '#202336' }, '#7aa2f7'),
  gruvbox: mk('Gruvbox', 'dark', { bg: '#282828', panel: '#32302f', panel2: '#3c3836', line: '#504945', text: '#ebdbb2', muted: '#a89984', user: '#504a2a', code: '#1d2021', over: '#302d2b' }, '#fabd2f'),
  mocha: mk('Catppuccin Mocha', 'dark', { bg: '#1e1e2e', panel: '#262637', panel2: '#313244', line: '#45475a', text: '#cdd6f4', muted: '#a6adc8', user: '#3b3556', code: '#181825', over: '#292a3c' }, '#cba6f7'),
  monokai: mk('Monokai', 'dark', { bg: '#272822', panel: '#2f302a', panel2: '#3a3b33', line: '#49483e', text: '#f8f8f2', muted: '#9d9a85', user: '#3d4a24', code: '#1e1f1c', over: '#2d2e27' }, '#a6e22e'),
  githubdark: mk('GitHub Dark', 'dark', { bg: '#0d1117', panel: '#161b22', panel2: '#21262d', line: '#30363d', text: '#e6edf3', muted: '#8b949e', user: '#17304f', code: '#010409', over: '#12171e' }, '#58a6ff'),
  solardark: mk('Solarized Dark', 'dark', { bg: '#002b36', panel: '#073642', panel2: '#0d4452', line: '#1d5563', text: '#a3b1b1', muted: '#6f8a92', user: '#0f4f5c', code: '#00212b', over: '#04323d' }, '#2aa198'),
  rosepine: mk('Rosé Pine', 'dark', { bg: '#191724', panel: '#1f1d2e', panel2: '#26233a', line: '#403d52', text: '#e0def4', muted: '#908caa', user: '#3a2e4f', code: '#14121f', over: '#1d1b2b' }, '#ebbcba'),
  onedark: mk('One Dark', 'dark', { bg: '#282c34', panel: '#2c313a', panel2: '#353b45', line: '#3e4451', text: '#c3cad6', muted: '#7f8798', user: '#2d4466', code: '#21252b', over: '#2a2f38' }, '#61afef'),
  contrastedark: mk('Alto contraste (oscuro)', 'dark', { bg: '#000000', panel: '#0a0a0a', panel2: '#1a1a1a', line: '#6b6b6b', text: '#ffffff', muted: '#c8c8c8', user: '#0b3a66', code: '#000000', over: '#111111' }, '#4dd0ff'),
  // ----- claros populares -----
  githublight: mk('GitHub Light', 'light', { bg: '#f6f8fa', panel: '#ffffff', panel2: '#eaeef2', line: '#d0d7de', text: '#1f2328', muted: '#656d76', user: '#ddf4ff', code: '#f0f3f6', over: '#eef6ff' }, '#0969da'),
  solarlight: mk('Solarized Light', 'light', { bg: '#fdf6e3', panel: '#fefaf0', panel2: '#eee8d5', line: '#ddd6c1', text: '#586e75', muted: '#7c8f90', user: '#dbe9f0', code: '#eee8d5', over: '#f5eed9' }, '#268bd2'),
  latte: mk('Catppuccin Latte', 'light', { bg: '#eff1f5', panel: '#f7f8fb', panel2: '#e6e9ef', line: '#ccd0da', text: '#4c4f69', muted: '#6c6f85', user: '#e4d8fb', code: '#e6e9ef', over: '#e9ecf4' }, '#8839ef'),
  gruvlight: mk('Gruvbox Claro', 'light', { bg: '#fbf1c7', panel: '#f9f5d7', panel2: '#ebdbb2', line: '#d5c4a1', text: '#3c3836', muted: '#7c6f64', user: '#f2e5b5', code: '#f2e5bc', over: '#f5ebbf' }, '#b57614'),
  dawn: mk('Rosé Pine Dawn', 'light', { bg: '#faf4ed', panel: '#fffaf3', panel2: '#f2e9e1', line: '#dfdad9', text: '#575279', muted: '#797593', user: '#f0dfe3', code: '#f2e9e1', over: '#f6eee6' }, '#b4637a'),
  nieve: mk('Nord Claro', 'light', { bg: '#eceff4', panel: '#f5f7fa', panel2: '#e5e9f0', line: '#d8dee9', text: '#2e3440', muted: '#5e6a7e', user: '#d9e3ef', code: '#e5e9f0', over: '#e8ecf3' }, '#5e81ac'),
  contrastelight: mk('Alto contraste (claro)', 'light', { bg: '#ffffff', panel: '#ffffff', panel2: '#f0f0f0', line: '#1a1a1a', text: '#000000', muted: '#333333', user: '#cfe0ff', code: '#f0f0f0', over: '#f5f5f5' }, '#0040d0')
}
const PRESET_VARS = Object.keys(PRESETS.medianoche.vars)

// ---------- colores propios ----------
export interface CustomColors {
  bg: string
  panel: string
  text: string
  accent: string
}
export const DEFAULT_CUSTOM: CustomColors = { bg: '#1b1d27', panel: '#242736', text: '#e8eaf4', accent: '#7c8cff' }

/** Estilo armado a partir de 4 colores; el resto se deriva mezclándolos, así siempre queda coherente. */
function customPreset(c: CustomColors): Preset {
  const dark = luminance(c.bg) < 0.4
  return {
    label: 'Personalizado',
    base: dark ? 'dark' : 'light',
    swatch: [c.bg, c.panel, c.accent],
    accent: [c.accent, c.accent],
    vars: {
      '--bg': c.bg,
      '--panel': c.panel,
      '--text': c.text,
      '--panel2': 'color-mix(in srgb, var(--panel) 90%, var(--text))',
      '--line': 'color-mix(in srgb, var(--panel) 78%, var(--text))',
      '--muted': 'color-mix(in srgb, var(--text) 62%, var(--bg))',
      '--user-bg': 'color-mix(in srgb, var(--accent) 28%, var(--panel))',
      '--code-bg': dark ? 'color-mix(in srgb, var(--bg) 80%, black)' : 'color-mix(in srgb, var(--bg) 90%, var(--text))',
      '--over-bg': 'color-mix(in srgb, var(--panel) 92%, var(--accent))',
      '--timer-grad': 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 28%, var(--panel)), color-mix(in srgb, var(--panel) 92%, var(--accent)))'
    },
    deco: `radial-gradient(900px 500px at 90% -10%, ${rgba(c.accent, 0.15)}, transparent 70%)`
  }
}

// ---------- resaltado de código ----------
export const SYNTAX: Record<string, { label: string; vars: Record<string, string> }> = {
  github: { label: 'GitHub', vars: { kw: '#ff7b72', str: '#a5d6ff', num: '#79c0ff', com: '#8b949e', fn: '#d2a8ff', type: '#ffa657', tag: '#7ee787', attr: '#79c0ff' } },
  monokai: { label: 'Monokai', vars: { kw: '#f92672', str: '#e6db74', num: '#ae81ff', com: '#88846f', fn: '#a6e22e', type: '#66d9ef', tag: '#f92672', attr: '#a6e22e' } },
  dracula: { label: 'Dracula', vars: { kw: '#ff79c6', str: '#f1fa8c', num: '#bd93f9', com: '#6272a4', fn: '#50fa7b', type: '#8be9fd', tag: '#ff79c6', attr: '#50fa7b' } },
  solarized: { label: 'Solarized', vars: { kw: '#859900', str: '#2aa198', num: '#d33682', com: '#93a1a1', fn: '#268bd2', type: '#b58900', tag: '#268bd2', attr: '#93a1a1' } },
  nord: { label: 'Nord', vars: { kw: '#81a1c1', str: '#a3be8c', num: '#b48ead', com: '#7b88a1', fn: '#88c0d0', type: '#8fbcbb', tag: '#81a1c1', attr: '#8fbcbb' } },
  tokyo: { label: 'Tokyo Night', vars: { kw: '#bb9af7', str: '#9ece6a', num: '#ff9e64', com: '#6b7399', fn: '#7aa2f7', type: '#2ac3de', tag: '#f7768e', attr: '#e0af68' } }
}
const SYN_KEYS = ['kw', 'str', 'num', 'com', 'fn', 'type', 'tag', 'attr']

// ---------- tipografía ----------
export const UI_FONTS = ['Segoe UI', 'Calibri', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Georgia', 'Cambria', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Atkinson Hyperlegible']
export const CODE_FONTS = ['Cascadia Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Source Code Pro', 'Courier New', 'Lucida Console']

const UI_STACK = '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif'
const CODE_STACK = 'Consolas, "Cascadia Code", monospace'

let fontCache: Record<string, boolean> = {}
/** ¿Está instalada esa fuente? Se compara el ancho del texto con el de una fuente genérica de respaldo. */
export function fontInstalled(name: string): boolean {
  if (name in fontCache) return fontCache[name]
  const ctx = document.createElement('canvas').getContext('2d')
  let found = false
  if (ctx) {
    const sample = 'mmmmmmmmmmlliWWW0123456789'
    for (const base of ['monospace', 'serif', 'sans-serif']) {
      ctx.font = `72px ${base}`
      const w0 = ctx.measureText(sample).width
      ctx.font = `72px "${name}", ${base}`
      if (ctx.measureText(sample).width !== w0) {
        found = true
        break
      }
    }
  }
  return (fontCache[name] = found)
}

// ---------- estado ----------
export interface AutoTheme {
  on: boolean
  lightFrom: string
  darkFrom: string
  /** Estilo de día y de noche ('' = clásico). */
  light: string
  dark: string
}

/** Todo lo que define el aspecto (sin la imagen de fondo, que pesa demasiado). */
export interface Look {
  mode: ThemeMode
  preset: string
  custom: CustomColors
  accent: string
  uiFont: string
  codeFont: string
  lineHeight: number
  radius: Radius
  shadow: 0 | 1 | 2
  bubbles: Bubbles
  syntax: string
}

export interface SavedTheme {
  id: string
  name: string
  look: Look
}

export interface Appearance extends Look {
  density: Density
  fontScale: number
  motion: boolean
  confetti: boolean
  auto: AutoTheme
  /** Estilos que usa el botón día / noche ('' = clásico del modo). */
  dayPreset: string
  nightPreset: string
  nav: { order: string[]; hidden: string[]; pinned: string[] }
  /** Color por proyecto ('p:Nombre') o cliente ('c:Nombre'). */
  colors: Record<string, string>
  bgDim: number
  bgGlass: number
  /** Posición (%), zoom (%), ajuste, desenfoque (px), saturación y brillo (%) de la imagen de fondo. */
  bgX: number
  bgY: number
  bgZoom: number
  bgFit: 'cover' | 'contain' | 'tile'
  bgBlur: number
  bgSat: number
  bgBright: number
  /** Desenfoque del vidrio de los paneles (px). */
  glassBlur: number
  /** Opacidad (%) de las capas del chat: fondo del panel, mensajes de la IA, burbuja propia y caja de escritura; y desenfoque (px) del fondo. */
  chatBg: number
  chatMsgs: number
  chatUser: number
  chatComp: number
  chatBlur: number
  /** Fondo animado sobre el fondo normal. */
  liveBg: 'off' | 'aurora' | 'particulas'
  /** Temas de temporada según el calendario de Chile; seasonForce fuerza uno para previsualizarlo. */
  seasons: boolean
  seasonForce: string
  /** Sonidos sutiles de la interfaz. */
  sounds: boolean
  soundVol: number
  /** Voz (blip) del acompañante al hablar; independiente del resto de sonidos. */
  companionSound: boolean
  /** Personaje acompañante siempre visible: agente elegido ('' = el primero) y esquina. */
  companion: boolean
  companionAgent: string
  companionCorner: 'br' | 'bl'
  /** Estilo de dibujo de personajes y robots. */
  charStyle: CharStyle
  /** Menú lateral: a la izquierda (normal) o en una barra a la derecha que se esconde. */
  dock: 'left' | 'right'
  /** Chat compacto dentro de la barra escondida (alternativa a la ventana flotante). */
  dockChat: boolean
  /** Última posición del acompañante si se arrastró (px desde arriba-izquierda). */
  companionPos: { x: number; y: number } | null
  saved: SavedTheme[]
}

const DEFAULT_LOOK: Look = {
  mode: 'system', preset: 'shutoki', custom: DEFAULT_CUSTOM, accent: 'auto', uiFont: '', codeFont: '', lineHeight: 145,
  radius: 'soft', shadow: 1, bubbles: 'solid', syntax: 'auto'
}
/** Secciones fijas en la barra superior por defecto; el resto va en el botón «+». */
export const DEFAULT_PINNED = ['today', 'board', 'chat', 'hours', 'notes', 'meetings']

export const DEFAULT_APPEARANCE: Appearance = {
  ...DEFAULT_LOOK,
  density: 'comfortable', fontScale: 100, motion: true, confetti: true,
  auto: { on: false, lightFrom: '07:00', darkFrom: '19:00', light: 'papel', dark: 'medianoche' },
  dayPreset: 'nexoclaro', nightPreset: 'shutoki',
  nav: { order: [], hidden: [], pinned: DEFAULT_PINNED }, colors: {}, bgDim: 80, bgGlass: 78,
  bgX: 50, bgY: 50, bgZoom: 100, bgFit: 'cover', bgBlur: 0, bgSat: 100, bgBright: 100, glassBlur: 12,
  chatBg: 100, chatMsgs: 100, chatUser: 100, chatComp: 100, chatBlur: 0, saved: [],
  liveBg: 'off', seasons: true, seasonForce: '', sounds: true, soundVol: 40, companionSound: true, companion: true, companionAgent: '', companionCorner: 'br', charStyle: 'clasico', dock: 'left', dockChat: true, companionPos: null
}

const KEY = 'shutoki.appearance'
const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sin storage */
  }
}

const num = (v: unknown, min: number, max: number, d: number): number => (typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : d)
const str = (v: unknown, d: string, max = 60): string => (typeof v === 'string' ? v.slice(0, max) : d)
const hex = (v: unknown, d: string): string => (typeof v === 'string' && isHex(v) ? v : d)
const time = (v: unknown, d: string): string => (typeof v === 'string' && /^\d\d:\d\d$/.test(v) ? v : d)
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d)
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 60) : [])
const fontName = (v: unknown): string => (typeof v === 'string' ? v.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 40) : '')

function sanitizeLook(r: Record<string, unknown>, d: Look): Look {
  const c = (r.custom ?? {}) as Record<string, unknown>
  return {
    mode: oneOf(r.mode, ['light', 'dark', 'system'], d.mode),
    preset: typeof r.preset === 'string' && (r.preset === '' || r.preset === 'custom' || r.preset in PRESETS) ? r.preset : d.preset,
    custom: { bg: hex(c.bg, d.custom.bg), panel: hex(c.panel, d.custom.panel), text: hex(c.text, d.custom.text), accent: hex(c.accent, d.custom.accent) },
    accent: typeof r.accent === 'string' && (r.accent === 'auto' || r.accent in ACCENTS || isHex(r.accent)) ? r.accent : d.accent,
    uiFont: fontName(r.uiFont),
    codeFont: fontName(r.codeFont),
    lineHeight: num(r.lineHeight, 125, 180, d.lineHeight),
    radius: oneOf(r.radius, ['sharp', 'soft', 'round'], d.radius),
    shadow: num(r.shadow, 0, 2, d.shadow) as 0 | 1 | 2,
    bubbles: oneOf(r.bubbles, ['solid', 'soft', 'outline'], d.bubbles),
    syntax: typeof r.syntax === 'string' && (r.syntax === 'auto' || r.syntax in SYNTAX) ? r.syntax : d.syntax
  }
}

/** Valida cualquier JSON (de disco, de la base de datos o importado) y lo completa con los valores por defecto. */
export function sanitize(raw: unknown): Appearance {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_APPEARANCE
  const a = (r.auto ?? {}) as Record<string, unknown>
  const nav = (r.nav ?? {}) as Record<string, unknown>
  const colors: Record<string, string> = {}
  for (const [k, v] of Object.entries((r.colors ?? {}) as Record<string, unknown>)) if (/^[pc]:/.test(k) && typeof v === 'string' && isHex(v)) colors[k.slice(0, 80)] = v
  const presetOrEmpty = (v: unknown, def: string): string => (typeof v === 'string' && (v === '' || v in PRESETS) ? v : def)
  return {
    ...sanitizeLook(r, d),
    density: r.density === 'compact' ? 'compact' : 'comfortable',
    fontScale: num(r.fontScale, 90, 120, d.fontScale),
    motion: r.motion !== false,
    confetti: r.confetti !== false,
    auto: { on: a.on === true, lightFrom: time(a.lightFrom, d.auto.lightFrom), darkFrom: time(a.darkFrom, d.auto.darkFrom), light: presetOrEmpty(a.light, d.auto.light), dark: presetOrEmpty(a.dark, d.auto.dark) },
    dayPreset: presetOrEmpty(r.dayPreset, d.dayPreset),
    nightPreset: presetOrEmpty(r.nightPreset, d.nightPreset),
    nav: { order: strs(nav.order), hidden: strs(nav.hidden), pinned: Array.isArray(nav.pinned) ? strs(nav.pinned) : DEFAULT_PINNED },
    colors,
    bgDim: num(r.bgDim, 0, 95, d.bgDim),
    bgGlass: num(r.bgGlass, 20, 100, d.bgGlass),
    bgX: num(r.bgX, 0, 100, d.bgX),
    bgY: num(r.bgY, 0, 100, d.bgY),
    bgZoom: num(r.bgZoom, 100, 300, d.bgZoom),
    bgFit: oneOf(r.bgFit, ['cover', 'contain', 'tile'], d.bgFit),
    bgBlur: num(r.bgBlur, 0, 30, d.bgBlur),
    bgSat: num(r.bgSat, 0, 200, d.bgSat),
    bgBright: num(r.bgBright, 40, 160, d.bgBright),
    glassBlur: num(r.glassBlur, 0, 30, d.glassBlur),
    chatBg: num(r.chatBg, 0, 100, d.chatBg),
    chatMsgs: num(r.chatMsgs, 0, 100, d.chatMsgs),
    chatUser: num(r.chatUser, 0, 100, d.chatUser),
    chatComp: num(r.chatComp, 0, 100, d.chatComp),
    chatBlur: num(r.chatBlur, 0, 30, d.chatBlur),
    liveBg: r.liveBg === 'aurora' || r.liveBg === 'particulas' ? r.liveBg : 'off',
    seasons: r.seasons !== false,
    seasonForce: str(r.seasonForce, '', 30),
    sounds: r.sounds !== false,
    soundVol: num(r.soundVol, 0, 100, d.soundVol),
    companionSound: r.companionSound !== false,
    companion: r.companion !== false,
    companionAgent: str(r.companionAgent, '', 60),
    companionCorner: r.companionCorner === 'bl' ? 'bl' : 'br',
    charStyle: CHAR_STYLES.includes(r.charStyle as CharStyle) ? (r.charStyle as CharStyle) : 'clasico',
    dock: r.dock === 'right' ? 'right' : 'left',
    dockChat: r.dockChat !== false,
    companionPos: ((p) => (p && typeof p.x === 'number' && typeof p.y === 'number' ? { x: Math.round(p.x), y: Math.round(p.y) } : null))(r.companionPos as { x?: unknown; y?: unknown } | null),
    saved: Array.isArray(r.saved)
      ? r.saved
          .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
          .slice(0, 30)
          .map((s) => ({ id: str(s.id, String(Math.random()), 30), name: str(s.name, 'Tema', 40) || 'Tema', look: sanitizeLook((s.look ?? {}) as Record<string, unknown>, DEFAULT_LOOK) }))
      : []
  }
}

/** Primera carga: lee el formato nuevo o, si no existe, migra las claves sueltas de versiones anteriores. */
function load(): Appearance {
  const raw = read(KEY)
  if (raw) {
    try {
      return sanitize(JSON.parse(raw))
    } catch {
      /* ilegible: se parte de cero */
    }
  }
  return sanitize({
    mode: read('theme') ?? undefined,
    preset: read('preset') ?? undefined,
    accent: read('accent') ?? undefined,
    density: read('density') ?? undefined,
    fontScale: Number(read('fontScale')) || undefined,
    bgDim: Number(read('bgDim')) || undefined,
    bgGlass: Number(read('bgGlass')) || undefined
  })
}

let A: Appearance = DEFAULT_APPEARANCE
let focus = false
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((l) => l())
const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export const getAppearance = (): Appearance => A
export const useAppearance = (): Appearance => useSyncExternalStore(subscribe, () => A)
export const useFocusMode = (): boolean => useSyncExternalStore(subscribe, () => focus)

// ---------- fondos ----------
/** Fondo integrado: tres resplandores de color (r,g,b) sobre el color base del estilo. */
export interface BuiltinBg {
  id: string
  label: string
  /** Tres colores «r,g,b» para las luces de arriba a la derecha, abajo a la izquierda y abajo al centro. */
  rgb: [string, string, string]
}
export const BG_BUILTIN: BuiltinBg[] = [
  { id: 'aurora', label: 'Aurora', rgb: ['118,102,255', '45,212,191', '236,72,153'] },
  { id: 'amanecer', label: 'Amanecer', rgb: ['255,138,76', '255,92,138', '255,200,87'] },
  { id: 'oceano', label: 'Océano', rgb: ['56,148,255', '30,215,215', '110,90,255'] },
  { id: 'bosque', label: 'Bosque', rgb: ['60,200,130', '150,210,70', '30,170,170'] },
  { id: 'ciruela', label: 'Ciruela', rgb: ['190,90,255', '255,95,170', '90,100,255'] },
  { id: 'ceniza', label: 'Ceniza', rgb: ['150,160,185', '110,120,145', '170,175,195'] },
  { id: 'plano', label: 'Sin adorno', rgb: ['0,0,0', '0,0,0', '0,0,0'] }
]

/** Imagen propia guardada en el equipo (data URL): van en localStorage, no en los datos de la app. */
export interface BgImage {
  id: string
  name: string
  url: string
}
export const BG_MAX_IMAGES = 8

function readLib(): BgImage[] {
  try {
    const lib = JSON.parse(read('bgLib') ?? '[]') as BgImage[]
    const out = Array.isArray(lib) ? lib.filter((x) => x && typeof x.id === 'string' && typeof x.url === 'string') : []
    // migración: el fondo único de versiones anteriores pasa a la biblioteca
    const old = read('bgImage')
    if (old) {
      if (!out.some((x) => x.url === old)) {
        out.push({ id: 'old', name: 'Mi fondo', url: old })
        write('bgLib', JSON.stringify(out))
        if (!read('bgActive')) write('bgActive', 'img:old')
      }
      try {
        localStorage.removeItem('bgImage')
      } catch {
        /* sin storage */
      }
    }
    return out
  } catch {
    return []
  }
}
let bgLib: BgImage[] | null = null
let bgVer = 0
/** Cambia cuando se elige, agrega o quita un fondo (para repintar la galería). */
export const useBackgrounds = (): number => useSyncExternalStore(subscribe, () => bgVer)
export const getBgLib = (): BgImage[] => (bgLib ??= readLib())
/** Fondo activo: 'aurora' (por defecto), el id de uno integrado o «img:<id>» de una imagen propia. */
export const getBgActive = (): string => {
  const a = read('bgActive') || 'aurora'
  if (a.startsWith('img:')) return getBgLib().some((x) => 'img:' + x.id === a) ? a : 'aurora'
  return BG_BUILTIN.some((b) => b.id === a) ? a : 'aurora'
}
/** Imagen de fondo activa (data URL) o ''. */
export const getBgImage = (): string => {
  const a = getBgActive()
  return a.startsWith('img:') ? (getBgLib().find((x) => 'img:' + x.id === a)?.url ?? '') : ''
}

// ---------- aplicar al documento ----------
const mq = matchMedia('(prefers-color-scheme: light)')
const minutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Estilo que corresponde ahora: el elegido o, con el horario activado, el de día / noche. */
function effectivePreset(): { key: string; mode: ThemeMode } {
  if (!A.auto.on) return { key: A.preset, mode: A.mode }
  const now = new Date().getHours() * 60 + new Date().getMinutes()
  const l = minutes(A.auto.lightFrom)
  const d = minutes(A.auto.darkFrom)
  const day = l <= d ? now >= l && now < d : now >= l || now < d
  const key = day ? A.auto.light : A.auto.dark
  return { key, mode: day ? 'light' : 'dark' }
}

export function presetFor(key: string): Preset | undefined {
  return key === 'custom' ? customPreset(A.custom) : PRESETS[key]
}

function apply(): void {
  const root = document.documentElement
  const { key, mode } = effectivePreset()
  const p = presetFor(key)
  const theme = p ? p.base : mode === 'system' ? (mq.matches ? 'light' : 'dark') : mode
  root.dataset.theme = theme
  root.dataset.preset = key // permite estilos propios del tema Nexu (degradado de marca, nodos)
  root.dataset.density = A.density
  root.dataset.bubbles = A.bubbles
  if (!A.motion) root.dataset.motion = 'off'
  else delete root.dataset.motion
  if (A.dock === 'right') root.dataset.dock = 'right'
  else delete root.dataset.dock
  const allVars = new Set([...PRESET_VARS, ...Object.keys(customPreset(A.custom).vars)])
  for (const k of allVars) {
    if (p && k in p.vars) root.style.setProperty(k, p.vars[k])
    else root.style.removeProperty(k)
  }
  root.style.setProperty('--bg-deco', 'none')

  // capas del chat: solo se activan si alguna se aleja del valor por defecto (así el aspecto de siempre queda intacto)
  const chatAdj = A.chatBg !== 100 || A.chatMsgs !== 100 || A.chatUser !== 100 || A.chatComp !== 100 || A.chatBlur !== 0
  if (chatAdj) {
    root.dataset.chatAdj = ''
    root.style.setProperty('--chat-bg', `${A.chatBg}%`)
    root.style.setProperty('--chat-msgs', `${A.chatMsgs}%`)
    root.style.setProperty('--chat-user', `${A.chatUser}%`)
    root.style.setProperty('--chat-comp', `${A.chatComp}%`)
    root.style.setProperty('--chat-blur', A.chatBlur > 0 ? `blur(${A.chatBlur}px)` : 'none')
  } else {
    delete root.dataset.chatAdj
    for (const k of ['--chat-bg', '--chat-msgs', '--chat-user', '--chat-comp', '--chat-blur']) root.style.removeProperty(k)
  }

  const img = getBgImage()
  const active = getBgActive()
  const builtin = BG_BUILTIN.find((b) => b.id === active) ?? BG_BUILTIN[0]
  const alpha = theme === 'light' ? [0.16, 0.14, 0.09] : [0.2, 0.12, 0.1]
  builtin.rgb.forEach((c, i) => root.style.setProperty('--g' + (i + 1), builtin.id === 'plano' ? 'transparent' : 'rgba(' + c + ',' + alpha[i] + ')'))
  root.dataset.bgKind = img ? 'image' : builtin.id
  if (img) {
    root.dataset.bg = 'image'
    root.style.setProperty('--bg-image', `url("${img}")`)
    root.style.setProperty('--bg-dim', `${A.bgDim}%`)
    root.style.setProperty('--glass', `${A.bgGlass}%`)
    // la imagen vive en body::before (para poder desenfocarla y moverla); aquí solo sus parámetros
    root.style.setProperty('--bg-pos', `${A.bgX}% ${A.bgY}%`)
    root.dataset.bgFit = A.bgFit
    root.style.setProperty('--bg-filter', `blur(${A.bgBlur}px) saturate(${A.bgSat}%) brightness(${A.bgBright}%)`)
    // el zoom escala la capa desde el punto elegido; el extra por desenfoque evita bordes claros
    root.style.setProperty('--bg-scale', String((A.bgZoom / 100) * (A.bgBlur > 0 ? 1 + A.bgBlur / 120 : 1)))
    root.style.setProperty('--bg-origin', `${A.bgX}% ${A.bgY}%`)
    root.style.setProperty('--glass-blur', `${A.glassBlur}px`)
  } else {
    delete root.dataset.bg
    for (const k of ['--bg-pos', '--bg-origin', '--bg-filter', '--bg-scale', '--glass-blur']) root.style.removeProperty(k)
    root.style.removeProperty('--bg-image')
    root.style.removeProperty('--bg-dim')
    root.style.removeProperty('--glass')
  }

  // acento: propio (#hex), de la lista, o el del estilo
  let accent: string
  if (isHex(A.accent)) accent = A.accent
  else if (A.accent in ACCENTS) accent = ACCENTS[A.accent][theme === 'light' ? 1 : 0]
  else accent = (p?.accent ?? ACCENTS.indigo)[theme === 'light' ? 1 : 0]
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--on-accent', luminance(accent) > 0.4 ? '#0b0d14' : '#ffffff')

  // tipografía
  const ui = A.uiFont ? `"${A.uiFont}", ${UI_STACK}` : UI_STACK
  const code = A.codeFont ? `"${A.codeFont}", ${CODE_STACK}` : CODE_STACK
  root.style.setProperty('--font-ui', ui)
  root.style.setProperty('--font-code', code)
  root.style.setProperty('--lh', String(A.lineHeight / 100))

  // forma
  root.style.setProperty('--rs', A.radius === 'sharp' ? '0' : A.radius === 'round' ? '1.7' : '1')
  if (A.shadow === 1) root.style.removeProperty('--shadow')
  else root.style.setProperty('--shadow', A.shadow === 0 ? 'none' : '0 14px 40px rgba(0,0,0,.55)')

  // resaltado de código
  const syn = SYNTAX[A.syntax]
  for (const k of SYN_KEYS) {
    if (syn) root.style.setProperty(`--syn-${k}`, syn.vars[k])
    else root.style.removeProperty(`--syn-${k}`)
  }

  if (focus) root.dataset.focus = '1'
  else delete root.dataset.focus
  root.style.setProperty('zoom', String(A.fontScale / 100))
  // los popovers de Radix calculan su posición en píxeles de pantalla; el zoom de la raíz la multiplicaba y se abrían desplazados
  root.style.setProperty('--zoom', String(A.fontScale / 100))
}

let syncTimer: ReturnType<typeof setTimeout> | undefined
/** Guarda también en los datos de la app (entra en las copias de seguridad) sin saturar con cada movimiento de un control. */
function queueSync(): void {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    try {
      void window.api?.call('settings:save', { appearance: A as unknown as Record<string, unknown> }).catch(() => undefined)
    } catch {
      /* ventana sin API */
    }
  }, 700)
}

/** Cambia la apariencia: se aplica al instante, se recuerda y se respalda. */
export function update(patch: Partial<Appearance>): void {
  A = { ...A, ...patch }
  write(KEY, JSON.stringify(A))
  apply()
  emit()
  queueSync()
}

/** Reemplaza todo el aspecto por uno guardado o importado (sin tocar menú, colores por proyecto ni horario). */
export function applyLook(look: Look): void {
  update({ ...look })
}

export const currentLook = (): Look => {
  const { mode, preset, custom, accent, uiFont, codeFont, lineHeight, radius, shadow, bubbles, syntax } = A
  return { mode, preset, custom, accent, uiFont, codeFont, lineHeight, radius, shadow, bubbles, syntax }
}

/** Si esta máquina no tiene preferencias guardadas (instalación nueva, datos importados) usa las de los datos de la app. */
export function hydrate(fromDb: unknown): void {
  if (read(KEY) || !fromDb) return
  A = sanitize(fromDb)
  write(KEY, JSON.stringify(A))
  apply()
  emit()
}

export const getFocus = (): boolean => focus

export function setFocusMode(on: boolean): void {
  focus = on
  apply()
  emit()
}

// ---------- API de siempre (la usan Sidebar y la paleta de comandos) ----------
export const getMode = (): ThemeMode => A.mode
export const getAccent = (): string => A.accent
export const getDensity = (): Density => A.density
export const getFontScale = (): number => A.fontScale
export const getPreset = (): string => A.preset
export const getBgDim = (): number => A.bgDim
export const getBgGlass = (): number => A.bgGlass
export const setMode = (m: ThemeMode): void => update({ mode: m })
/** Botón día / noche: pasa al estilo claro u oscuro que el usuario eligió como predeterminado (y desactiva el horario, que lo pisaría). */
export function toggleDayNight(): void {
  const toLight = document.documentElement.dataset.theme !== 'light'
  update({ auto: { ...A.auto, on: false }, mode: toLight ? 'light' : 'dark', preset: toLight ? A.dayPreset : A.nightPreset })
}
export const setAccent = (k: string): void => update({ accent: k })
export const setDensity = (d: Density): void => update({ density: d })
export const setFontScale = (n: number): void => update({ fontScale: n })
export const setPreset = (k: string): void => update({ preset: k })
export const setBgDim = (n: number): void => update({ bgDim: n })
export const setBgGlass = (n: number): void => update({ bgGlass: n })
export const resetChatAdjust = (): void => update({ chatBg: 100, chatMsgs: 100, chatUser: 100, chatComp: 100, chatBlur: 0 })
export const resetBgAdjust =(): void => update({ bgX: 50, bgY: 50, bgZoom: 100, bgFit: 'cover', bgBlur: 0, bgSat: 100, bgBright: 100, bgDim: 80, bgGlass: 78, glassBlur: 12 })
/** Elige el fondo: 'aurora' u otro integrado, o «img:<id>» de una imagen propia. */
export function setBgActive(id: string): void {
  write('bgActive', id)
  bgVer++
  apply()
  emit()
}
export function clearBgImage(): void {
  setBgActive('aurora')
}
/** Tamaño hasta el que el original se guarda tal cual (sin recomprimir). Más grande, se reduce; el límite es el de localStorage. */
const BG_RAW_MAX = 1_000_000
/** Agrega una imagen propia a la biblioteca y la deja activa. Lanza si no cabe o ya hay demasiadas. */
export async function addBgImageFile(file: File): Promise<void> {
  const lib = getBgLib()
  if (lib.length >= BG_MAX_IMAGES) throw new Error('Ya tienes ' + BG_MAX_IMAGES + ' fondos propios: quita alguno para agregar otro.')
  let url: string
  if (file.size <= BG_RAW_MAX && file.type.startsWith('image/')) {
    // el archivo original, sin pérdida de calidad
    url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(new Error('No se pudo leer la imagen'))
      r.readAsDataURL(file)
    })
  } else {
    // imagen grande: se reduce a 2560 px con calidad alta para que quepa
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale)
    c.height = Math.round(bmp.height * scale)
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
    url = c.toDataURL('image/jpeg', 0.92)
  }
  const item: BgImage = { id: Math.random().toString(36).slice(2, 9), name: file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Mi fondo', url }
  const next = [...lib, item]
  try {
    localStorage.setItem('bgLib', JSON.stringify(next))
  } catch {
    throw new Error('La imagen no cabe en el almacenamiento local: prueba con una más pequeña o quita otros fondos.')
  }
  bgLib = next
  bgVer++
  setBgActive('img:' + item.id)
}
export function removeBgImage(id: string): void {
  const next = getBgLib().filter((x) => x.id !== id)
  write('bgLib', JSON.stringify(next))
  bgLib = next
  if (read('bgActive') === 'img:' + id) write('bgActive', 'aurora')
  bgVer++
  apply()
  emit()
}
/** Compatibilidad con el nombre anterior. */
export const setBgImageFile = addBgImageFile

export const getName = (): string => read('userName') ?? ''
export const setName = (n: string): void => write('userName', n)

// ---------- color por proyecto, menú y confeti ----------
/** Color de la tarea: el de su proyecto o, si no tiene, el de su cliente. */
export function taskColor(t: { project?: string; client?: string }): string | undefined {
  return (t.project && A.colors['p:' + t.project]) || (t.client && A.colors['c:' + t.client]) || undefined
}
export const confettiEnabled = (): boolean => A.confetti && A.motion

/** Ordena y filtra los elementos de un grupo del menú según la configuración. */
export function navOrder<T extends { id: string }>(items: T[], includeHidden = false): T[] {
  const order = A.nav.order
  const rank = (id: string): number => {
    const i = order.indexOf(id)
    return i < 0 ? 1000 + items.findIndex((x) => x.id === id) : i
  }
  return [...items].filter((x) => includeHidden || !A.nav.hidden.includes(x.id)).sort((a, b) => rank(a.id) - rank(b.id))
}

/** Aplica la apariencia antes del primer pintado y la mantiene sincronizada entre ventanas. */
export function initTheme(): void {
  A = load()
  mq.addEventListener('change', apply)
  addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === 'bgImage' || e.key === null) {
      A = load()
      apply()
      emit()
    }
  })
  // el tema por horario cambia solo al llegar la hora
  setInterval(() => {
    if (A.auto.on) apply()
  }, 60_000)
  apply()
}

/** Interpreta un tema exportado/importado: solo toma los campos del aspecto, ignorando todo lo demás. */
export const parseLook = (raw: unknown): Look => sanitizeLook((raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>, DEFAULT_LOOK)
