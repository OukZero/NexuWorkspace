import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DEFAULT_APPEARANCE, DEFAULT_CUSTOM, ACCENTS, CODE_FONTS, PRESETS, SYNTAX, UI_FONTS, applyLook, currentLook, fontInstalled, isHex, parseLook, presetFor, update, useAppearance } from '../theme'
import type { Appearance, Bubbles, Density, Preset, Radius, ThemeMode } from '../theme'
import { useDB } from '../store'
import { useUi } from '../ui'
import { NAV_GROUPS } from '../navDefs'
import { LIMITS, applyPreset, deletePreset, savePreset, savedLayouts, setLayout, useLayout } from '../layout'
import { Select } from './Select'
import { BackgroundPicker } from './BackgroundPicker'
import { playSfx } from '../sounds'
import { CharStylePicker, CompanionAgentSelect, MyCharacterEditor } from './Companion'
import { SEASONS } from '../seasons'

// ---------- utilidades ----------
const hexToRgb = (h: string): [number, number, number] => {
  const s = h.replace('#', '')
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)]
}
const mixHex = (a: string, b: string, t: number): string => {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  const m = (x: number, y: number): string => Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
  return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`
}
/** Cualquier color CSS (rgb(), color-mix()…) como #rrggbb, usando el propio navegador para resolverlo. */
function toHex(css: string, fallback: string): string {
  if (isHex(css)) return css.length === 4 ? '#' + css.slice(1).split('').map((c) => c + c).join('') : css
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return fallback
  ctx.fillStyle = '#000000'
  ctx.fillStyle = css
  return isHex(ctx.fillStyle) ? ctx.fillStyle : fallback
}

function colorsOf(p: Preset): { bg: string; panel: string; panel2: string; text: string; accent: string } {
  const v = p.vars
  const bg = toHex(v['--bg'], '#000000')
  const panel = toHex(v['--panel'], bg)
  const text = toHex(v['--text'], '#ffffff')
  return { bg, panel, panel2: isHex(v['--panel2']) ? v['--panel2'] : mixHex(panel, text, 0.1), text, accent: p.swatch[2] }
}

/** Miniatura de un estilo: menú lateral, filas y botón, con sus colores reales. */
function Mock({ p }: { p: Preset }): ReactNode {
  const c = colorsOf(p)
  return (
    <div className="ap-mock" style={{ background: c.bg }}>
      <div className="s" style={{ background: c.panel }}>
        <i style={{ background: c.accent, width: '80%' }} />
        <i style={{ background: c.text }} />
        <i style={{ background: c.text, width: '70%' }} />
      </div>
      <div className="m">
        <div className="r" style={{ background: c.panel }}>
          <b style={{ background: c.accent }} />
          <i style={{ background: c.text }} />
        </div>
        <div className="r" style={{ background: c.panel2 }}>
          <b style={{ background: c.text, opacity: 0.4 }} />
          <i style={{ background: c.text }} />
        </div>
        <div className="btn-mock" style={{ background: c.accent }} />
      </div>
    </div>
  )
}

function Card({ label, sub, on, onClick, children }: { label: string; sub?: string; on: boolean; onClick: () => void; children: ReactNode }): ReactNode {
  return (
    <button className={`ap-card ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={on} title={label}>
      {children}
      <div className="ap-name">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
    </button>
  )
}

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }): ReactNode {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={String(k)} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  )
}

// Mismos trazos de línea que las tarjetas de Ajustes (SettingsView), para que todas las pestañas se vean iguales.
const SEC_ICONS: Record<string, string> = {
  tema: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s0-2.5 1.5-2.5H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z',
  acento: 'M12 3a9 9 0 1 0 0 18 2 2 0 0 0 0-4 2 2 0 0 1 0-4h2a4 4 0 0 0 0-8zM7.5 11h.01M9 7h.01M14 7h.01',
  fondo: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5',
  temas: 'M6 4h9l3 3v13H6zM15 4v3h3M9 12h6M9 16h6',
  tipo: 'M5 6V4h14v2M12 4v16M9 20h6',
  forma: 'M5 5h14v14H5zM9 5v4M5 9h4',
  chat: 'M4 5h16v11H8l-4 4z',
  cambio: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',
  disp: 'M4 5h7v6H4zM13 5h7v6h-7zM4 13h16v6H4z',
  menu: 'M4 6h16M4 12h16M4 18h10',
  proyecto: 'M3 12l9-9h8v8l-9 9zM16 8h.01'
}

/** Sección de Apariencia con el aspecto de una tarjeta de Ajustes: icono, título y subtítulo. */
function Sec({ icon, title, sub, children }: { icon: string; title: string; sub?: string; children: ReactNode }): ReactNode {
  return (
    <section className="set-card">
      <header className="set-card-h">
        <span className="set-card-i">
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={SEC_ICONS[icon]} />
          </svg>
        </span>
        <div className="grow">
          <h3>{title}</h3>
          {sub && <div className="set-card-sub">{sub}</div>}
        </div>
      </header>
      <div className="set-card-b ap-sec">{children}</div>
    </section>
  )
}

const MODES: Array<[ThemeMode, string]> = [
  ['light', '☀ Día'],
  ['dark', '☾ Noche'],
  ['system', '⌂ Auto']
]

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tema'

/** Pantalla «Apariencia»: todo se aplica al instante y se guarda solo (también en las copias de seguridad). */
export function AppearanceSettings(): ReactNode {
  const a = useAppearance()
  const db = useDB()
  const ui = useUi()
  const fileRef = useRef<HTMLInputElement>(null)
  const [saveName, setSaveName] = useState('')
  const [pasted, setPasted] = useState('')

  const uiFonts = useMemo(() => UI_FONTS.filter(fontInstalled), [])
  const codeFonts = useMemo(() => CODE_FONTS.filter(fontInstalled), [])

  const dark = Object.entries(PRESETS).filter(([, p]) => p.base === 'dark')
  const light = Object.entries(PRESETS).filter(([, p]) => p.base === 'light')
  const names = (key: 'project' | 'client'): string[] => [...new Set(db.tasks.map((t) => t[key]).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'es'))
  const setColor = (k: string, v: string | null): void => {
    const colors = { ...a.colors }
    if (v) colors[k] = v
    else delete colors[k]
    update({ colors })
  }

  // «Personalizar este tema»: los 4 colores base del estilo actual pasan al editor
  const customize = (): void => {
    const p = presetFor(a.preset) ?? presetFor('')
    const css = getComputedStyle(document.documentElement)
    const get = (n: string, d: string): string => toHex(css.getPropertyValue(n).trim() || d, d)
    const c = p && a.preset !== '' ? colorsOf(p) : { bg: get('--bg', DEFAULT_CUSTOM.bg), panel: get('--panel', DEFAULT_CUSTOM.panel), text: get('--text', DEFAULT_CUSTOM.text), accent: get('--accent', DEFAULT_CUSTOM.accent) }
    update({ preset: 'custom', custom: { bg: c.bg, panel: c.panel, text: c.text, accent: get('--accent', c.accent) } })
  }
  const setCustom = (k: keyof Appearance['custom'], v: string): void => update({ preset: 'custom', custom: { ...a.custom, [k]: v } })

  const saveTheme = (): void => {
    const name = saveName.trim()
    if (!name) return ui.toast('Ponle un nombre al tema', true)
    update({ saved: [...a.saved.filter((s) => s.name !== name), { id: Date.now().toString(36), name, look: currentLook() }] })
    setSaveName('')
    ui.toast(`Tema «${name}» guardado`)
  }

  const exportTheme = (): void => download(`shutoki-tema-${slug(saveName || (a.preset in PRESETS ? PRESETS[a.preset].label : 'personalizado'))}.json`, JSON.stringify({ shutoki: 'theme', version: 1, look: currentLook() }, null, 2))
  const importText = (text: string): void => {
    try {
      const o = JSON.parse(text) as { shutoki?: string; look?: unknown }
      if (o.shutoki !== 'theme' || !o.look) throw new Error('no es un tema')
      applyLook(parseLook(o.look))
      ui.toast('Tema importado y aplicado')
      setPasted('')
    } catch {
      ui.toast('Ese texto no es un tema de Nexu válido', true)
    }
  }

  const reset = async (): Promise<void> => {
    if (!(await ui.confirm('Se restablecen colores, tipografía, forma, menú y colores por proyecto. Tus temas guardados se conservan.', { title: 'Restablecer apariencia', confirmLabel: 'Restablecer', danger: true }))) return
    update({ ...DEFAULT_APPEARANCE, saved: a.saved })
  }

  const fontOptions = (list: string[], def: string): Array<{ value: string; label: string }> => [{ value: '', label: def }, ...list.map((f) => ({ value: f, label: f }))]
  const navMove = (id: string, group: string[], d: -1 | 1): void => {
    const base = ordered(group)
    const i = base.indexOf(id)
    const j = i + d
    if (j < 0 || j >= base.length) return
    ;[base[i], base[j]] = [base[j], base[i]]
    update({ nav: { ...a.nav, order: [...a.nav.order.filter((x) => !group.includes(x)), ...base] } })
  }
  const ordered = (group: string[]): string[] => [...group].sort((x, y) => (a.nav.order.indexOf(x) < 0 ? 1000 + group.indexOf(x) : a.nav.order.indexOf(x)) - (a.nav.order.indexOf(y) < 0 ? 1000 + group.indexOf(y) : a.nav.order.indexOf(y)))
  const togglePin = (id: string): void => update({ nav: { ...a.nav, pinned: a.nav.pinned.includes(id) ? a.nav.pinned.filter((x) => x !== id) : [...a.nav.pinned, id] } })
  const toggleNav = (id: string): void => update({ nav: { ...a.nav, hidden: a.nav.hidden.includes(id) ? a.nav.hidden.filter((x) => x !== id) : [...a.nav.hidden, id] } })

  const accentSwatch = (key: string): string => (key in ACCENTS ? ACCENTS[key][0] : '')
  const presetOptions = (extra?: string): Array<{ value: string; label: string; group?: string }> => [
    { value: '', label: extra ?? 'Clásico (día / noche)' },
    ...dark.map(([k, p]) => ({ value: k, label: p.label, group: 'Oscuros' })),
    ...light.map(([k, p]) => ({ value: k, label: p.label, group: 'Claros' }))
  ]

  return (
    <div className="ap">
      {/* ---------------- tema ---------------- */}
      <Sec icon="tema" title="Tema" sub="Modo y estilo de colores">
      <div className="ap-row">
        <Seg<ThemeMode> label="Modo" value={a.mode} options={MODES} onChange={(m) => update({ mode: m })} />
        <span className="meta">{a.preset === '' ? 'El modo vale para el estilo Clásico.' : 'Con un estilo elegido, el modo lo define el estilo.'}</span>
        <span className="grow" />
        <button className="btn sm" onClick={() => { const k = Object.keys(PRESETS); update({ preset: k[Math.floor(Math.random() * k.length)] }) }}>
          🎲 Al azar
        </button>
      </div>
      <div className="ap-group">Clásico y oscuros</div>
      <div className="ap-gallery">
        <Card label="Clásico" sub="día / noche" on={a.preset === ''} onClick={() => update({ preset: '' })}>
          <div className="ap-mock" style={{ background: 'linear-gradient(90deg, #0f1115 50%, #f4f5f9 50%)' }}>
            <div className="m" style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
              <div className="btn-mock" style={{ background: '#7c8cff', width: '40%' }} />
            </div>
          </div>
        </Card>
        {dark.map(([k, p]) => (
          <Card key={k} label={p.label} on={a.preset === k} onClick={() => update({ preset: k })}>
            <Mock p={p} />
          </Card>
        ))}
      </div>
      <div className="ap-group">Claros</div>
      <div className="ap-gallery">
        {light.map(([k, p]) => (
          <Card key={k} label={p.label} on={a.preset === k} onClick={() => update({ preset: k })}>
            <Mock p={p} />
          </Card>
        ))}
        <Card label="Personalizado" sub="tus colores" on={a.preset === 'custom'} onClick={() => update({ preset: 'custom' })}>
          <Mock p={presetFor('custom') as Preset} />
        </Card>
      </div>
      </Sec>

      {/* ---------------- fondo ---------------- */}
      <Sec icon="fondo" title="Fondo" sub="Integrado o tus imágenes; los paneles se vuelven translúcidos">
        <BackgroundPicker />
      </Sec>

      {/* ---------------- acento y colores ---------------- */}
      <Sec icon="acento" title="Acento y colores" sub="Color de botones y resaltados">
      <div className="ap-group">Acento</div>
      <div className="ap-swatches">
        <button className={`ap-sw auto ${a.accent === 'auto' ? 'on' : ''}`} title="Del tema: cada estilo trae el suyo" aria-label="Acento del tema" onClick={() => update({ accent: 'auto' })} />
        {Object.keys(ACCENTS).map((k) => (
          <button key={k} className={`ap-sw ${a.accent === k ? 'on' : ''}`} style={{ background: accentSwatch(k) }} title={k} aria-label={`Acento ${k}`} onClick={() => update({ accent: k })} />
        ))}
        <input type="color" aria-label="Acento a medida" title="Elegir otro color" value={isHex(a.accent) ? a.accent : '#7c8cff'} onChange={(e) => update({ accent: e.target.value })} style={{ width: 34, height: 30, padding: 2 }} />
        {isHex(a.accent) && <span className="meta">{a.accent}</span>}
      </div>

      {/* ---------------- colores propios ---------------- */}
      <div className="ap-group">Colores propios</div>
      <div className="meta">Elige cuatro colores y el resto (bordes, texto atenuado, burbujas) se calcula solo para que combine.</div>
      <div className="ap-row">
        {(
          [
            ['bg', 'Fondo'],
            ['panel', 'Paneles'],
            ['text', 'Texto'],
            ['accent', 'Acento']
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="ap-row" style={{ gap: 6, margin: 0 }}>
            <input type="color" value={a.custom[k]} onChange={(e) => setCustom(k, e.target.value)} aria-label={l} />
            {l}
          </label>
        ))}
        <button className="btn sm" onClick={customize} title="Copia los colores del estilo actual al editor">
          Partir del tema actual
        </button>
      </div>

      </Sec>

      {/* ---------------- mis temas ---------------- */}
      <Sec icon="temas" title="Mis temas" sub="Guarda, exporta e importa tu aspecto">
      <div className="ap-row">
        <input style={{ width: 200 }} placeholder="Nombre del tema" value={saveName} maxLength={40} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveTheme()} aria-label="Nombre del tema" />
        <button className="btn sm" onClick={saveTheme}>
          Guardar el aspecto actual
        </button>
        <button className="btn sm" onClick={exportTheme}>
          Exportar (.json)
        </button>
        <button className="btn sm" onClick={() => fileRef.current?.click()}>
          Importar…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void f.text().then(importText)
          }}
        />
      </div>
      {a.saved.length > 0 && (
        <div className="ap-saved">
          {a.saved.map((s) => (
            <span key={s.id} className="chip">
              <button onClick={() => applyLook(s.look)} title="Aplicar este tema" style={{ color: 'var(--text)' }}>
                {s.name}
              </button>
              <button onClick={() => update({ saved: a.saved.filter((x) => x.id !== s.id) })} title="Borrar" aria-label={`Borrar ${s.name}`}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="ap-row">
        <input style={{ flex: 1, minWidth: 220 }} placeholder="…o pega aquí el texto de un tema" value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="Pegar un tema" />
        <button className="btn sm" disabled={!pasted.trim()} onClick={() => importText(pasted)}>
          Aplicar
        </button>
      </div>

      </Sec>

      {/* ---------------- tipografía ---------------- */}
      <Sec icon="tipo" title="Tipografía" sub="Letras, tamaño e interlineado">
      <div className="ap-row">
        <label>Letra de la interfaz</label>
        <Select ariaLabel="Letra de la interfaz" value={a.uiFont} creatable searchable onChange={(v) => update({ uiFont: v.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 40) })} options={fontOptions(uiFonts, 'Predeterminada (Segoe UI)')} />
      </div>
      <div className="ap-row">
        <label>Letra del código</label>
        <Select ariaLabel="Letra del código" value={a.codeFont} creatable searchable onChange={(v) => update({ codeFont: v.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 40) })} options={fontOptions(codeFonts, 'Predeterminada (Consolas)')} />
      </div>
      <div className="meta">Solo aparecen las letras instaladas en este equipo; si escribes otra, se usa si existe.</div>
      <div className="ap-row">
        <label>Tamaño · {a.fontScale}%</label>
        <input type="range" min={90} max={120} step={5} value={a.fontScale} aria-label="Tamaño de letra" onChange={(e) => update({ fontScale: Number(e.target.value) })} />
      </div>
      <div className="ap-row">
        <label>Interlineado · {(a.lineHeight / 100).toFixed(2)}</label>
        <input type="range" min={125} max={180} step={5} value={a.lineHeight} aria-label="Interlineado" onChange={(e) => update({ lineHeight: Number(e.target.value) })} />
      </div>

      </Sec>

      {/* ---------------- forma ---------------- */}
      <Sec icon="forma" title="Forma y movimiento" sub="Esquinas, sombras, densidad y animaciones">
      <div className="ap-row">
        <label>Esquinas</label>
        <Seg<Radius> label="Esquinas" value={a.radius} onChange={(radius) => update({ radius })} options={[['sharp', 'Rectas'], ['soft', 'Suaves'], ['round', 'Redondas']]} />
      </div>
      <div className="ap-row">
        <label>Sombras</label>
        <Seg<number> label="Sombras" value={a.shadow} onChange={(shadow) => update({ shadow: shadow as 0 | 1 | 2 })} options={[[0, 'Ninguna'], [1, 'Normales'], [2, 'Marcadas']]} />
      </div>
      <div className="ap-row">
        <label>Densidad</label>
        <Seg<Density> label="Densidad" value={a.density} onChange={(density) => update({ density })} options={[['comfortable', 'Cómoda'], ['compact', 'Compacta']]} />
      </div>
      <label className="tpl-check">
        <input type="checkbox" style={{ width: 'auto' }} checked={a.motion} onChange={(e) => update({ motion: e.target.checked })} />
        Animaciones y transiciones (desactívalas si te cansan o para mayor rendimiento)
      </label>
      <label className="tpl-check">
        <input type="checkbox" style={{ width: 'auto' }} checked={a.confetti} disabled={!a.motion} onChange={(e) => update({ confetti: e.target.checked })} />
        Confeti al completar una tarea
      </label>
      <label className="tpl-check">
        <input type="checkbox" style={{ width: 'auto' }} checked={a.sounds} onChange={(e) => update({ sounds: e.target.checked })} />
        Sonidos suaves (iniciar o detener el timer, completar tareas)
      </label>
      <label className="tpl-check">
        <input type="checkbox" style={{ width: 'auto' }} checked={a.companionSound} onChange={(e) => update({ companionSound: e.target.checked })} />
        Sonido del acompañante (el “blip” cuando habla o le haces clic)
      </label>
      {a.sounds && (
        <div className="ap-row">
          <label>Volumen</label>
          <input type="range" min={0} max={100} value={a.soundVol} onChange={(e) => update({ soundVol: Number(e.target.value) })} />
          <button type="button" className="btn" onClick={() => playSfx('done')}>Probar sonido</button>
        </div>
      )}
      <div className="ap-row">
        <label>Fondo animado</label>
        <Seg<Appearance['liveBg']> label="Fondo animado" value={a.liveBg} onChange={(liveBg) => update({ liveBg })} options={[['off', 'Ninguno'], ['aurora', 'Aurora'], ['particulas', 'Partículas']]} />
      </div>
      <label className="tpl-check">
        <input type="checkbox" style={{ width: 'auto' }} checked={a.seasons} onChange={(e) => update({ seasons: e.target.checked })} />
        Eventos del calendario de Chile (Navidad, Año Nuevo, Pascua, Fiestas Patrias…)
      </label>
      <div className="ap-row">
        <label>Previsualizar evento</label>
        <select value={a.seasonForce} onChange={(e) => update({ seasonForce: e.target.value })}>
          <option value="">Según la fecha de hoy</option>
          {SEASONS.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
        </select>
      </div>
      <label className="tpl-check">
        <input type="checkbox" style={{ width: 'auto' }} checked={a.companion} onChange={(e) => update({ companion: e.target.checked })} />
        Personaje acompañante siempre visible
      </label>
      {a.companion && (
        <>
          <div className="ap-row">
            <label>Personaje</label>
            <CompanionAgentSelect value={a.companionAgent} onChange={(companionAgent) => update({ companionAgent })} />
          </div>
          <div className="ap-row">
            <label>Esquina</label>
            <Seg<Appearance['companionCorner']> label="Esquina" value={a.companionCorner} onChange={(companionCorner) => update({ companionCorner })} options={[['br', 'Derecha'], ['bl', 'Izquierda']]} />
          </div>
          <div className="ap-row">
            <label>Posición</label>
            <span className="meta">Arrástralo con el mouse; doble clic lo devuelve a la esquina.</span>
            {a.companionPos && <button className="btn" onClick={() => update({ companionPos: null })}>Volver a la esquina</button>}
          </div>
        </>
      )}
      <div className="ap-row">
        <label>Menú lateral</label>
        <Seg<Appearance['dock']> label="Menú lateral" value={a.dock} onChange={(dock) => update({ dock })} options={[['left', 'Fijo a la izquierda'], ['right', 'Barra derecha que se esconde']]} />
      </div>
      <div className="ap-row">
        <label>Al minimizar</label>
        <Seg<'barra' | 'flotante'>
          label="Al minimizar"
          value={db.settings.miniEnabled !== false && db.settings.miniFormat === 'edge' ? 'barra' : 'flotante'}
          onChange={(v) => void window.api.call('settings:save', v === 'barra' ? { miniEnabled: true, miniFormat: 'edge' } : { miniEnabled: true, miniFormat: 'full' }).catch(() => undefined)}
          options={[['barra', 'Barra oculta a la derecha (con chat IA)'], ['flotante', 'Ventana flotante']]}
        />
      </div>

      </Sec>

      {/* ---------------- mi personaje ---------------- */}
      <Sec icon="menu" title="Mi personaje" sub="Tu avatar: aparece en el Equipo y puede ser tu acompañante; teclea cuando escribes">
        <div className="ap-row">
          <label>Estilo de dibujo</label>
          <CharStylePicker />
        </div>
        <MyCharacterEditor />
      </Sec>

      {/* ---------------- chat y código ---------------- */}
      <Sec icon="chat" title="Chat y código" sub="Burbujas y colores del código">
      <div className="ap-row">
        <label>Burbujas del chat</label>
        <Seg<Bubbles> label="Burbujas" value={a.bubbles} onChange={(bubbles) => update({ bubbles })} options={[['solid', 'Rellenas'], ['soft', 'Suaves'], ['outline', 'Con borde']]} />
      </div>
      <div className="ap-row">
        <label>Colores del código</label>
        <Select ariaLabel="Colores del código" value={a.syntax} onChange={(syntax) => update({ syntax })} options={[{ value: 'auto', label: 'Del tema' }, ...Object.entries(SYNTAX).map(([k, s]) => ({ value: k, label: s.label }))]} />
      </div>
      <div className="ap-preview">
        <div className="msg user" style={{ maxWidth: 'none', marginBottom: 6 }}>
          ¿Puedes revisar esta función?
        </div>
        <pre>
          <span className="c">{'// valida un RUT chileno'}</span>
          {'\n'}
          <span className="k">export function</span> <span className="f">validarRut</span>(rut: <span className="k">string</span>) {'{'}
          {'\n  '}
          <span className="k">return</span> rut.length &gt; <span className="n">7</span> &amp;&amp; <span className="s">/^\d+-[\dkK]$/</span>.test(rut)
          {'\n}'}
        </pre>
      </div>

      </Sec>

      {/* ---------------- cambio de tema ---------------- */}
      <Sec icon="cambio" title="Cambio de tema" sub="Botón día / noche y cambio según la hora">
      <div className="ap-group">Botón día / noche</div>
      <div className="ap-row">
        <label>Tema claro</label>
        <Select ariaLabel="Tema claro predeterminado" value={a.dayPreset} onChange={(dayPreset) => update({ dayPreset })} options={[{ value: '', label: 'Clásico (claro)' }, ...light.map(([k, p]) => ({ value: k, label: p.label }))]} />
      </div>
      <div className="ap-row">
        <label>Tema oscuro</label>
        <Select ariaLabel="Tema oscuro predeterminado" value={a.nightPreset} onChange={(nightPreset) => update({ nightPreset })} options={[{ value: '', label: 'Clásico (oscuro)' }, ...dark.map(([k, p]) => ({ value: k, label: p.label }))]} />
      </div>
      <p className="meta">El botón de la barra lateral y la paleta de comandos alternan entre estos dos estilos.</p>

      <div className="ap-group">Según la hora</div>
      <label className="tpl-check">
        <input type="checkbox" style={{ width: 'auto' }} checked={a.auto.on} onChange={(e) => update({ auto: { ...a.auto, on: e.target.checked } })} />
        Cambiar solo entre un estilo de día y uno de noche
      </label>
      {a.auto.on && (
        <>
          <div className="ap-row">
            <label>De día desde</label>
            <input type="time" style={{ width: 120 }} value={a.auto.lightFrom} onChange={(e) => update({ auto: { ...a.auto, lightFrom: e.target.value || '07:00' } })} />
            <Select ariaLabel="Estilo de día" value={a.auto.light} onChange={(light) => update({ auto: { ...a.auto, light } })} options={presetOptions('Clásico (claro)')} />
          </div>
          <div className="ap-row">
            <label>De noche desde</label>
            <input type="time" style={{ width: 120 }} value={a.auto.darkFrom} onChange={(e) => update({ auto: { ...a.auto, darkFrom: e.target.value || '19:00' } })} />
            <Select ariaLabel="Estilo de noche" value={a.auto.dark} onChange={(dark) => update({ auto: { ...a.auto, dark } })} options={presetOptions('Clásico (oscuro)')} />
          </div>
        </>
      )}

      </Sec>

      {/* ---------------- disposiciones ---------------- */}
      <Sec icon="disp" title="Disposiciones" sub="Ventanas guardadas: panel, tamaños y modo foco">
      <div className="meta">Guarda cómo tienes la ventana (panel lateral, anchos, terminal y modo foco) y vuelve a ella con un clic o con Ctrl+K. Los bordes de los paneles se arrastran con el mouse.</div>
      <Layouts />
      </Sec>

      {/* ---------------- menú ---------------- */}
      <Sec icon="menu" title="Menú superior" sub="Qué se fija arriba y en qué orden">
      <div className="meta">Fija en la barra superior lo más importante; el resto queda en el botón «+». También puedes ordenar u ocultar secciones (siguen disponibles con Ctrl+K).</div>
      <div className="ap-nav">
        {NAV_GROUPS.map((g) => {
          const ids = g.items.map(([v]) => v as string)
          const label = (id: string): string => g.items.find(([v]) => v === id)?.[2] ?? id
          const icon = (id: string): string => g.items.find(([v]) => v === id)?.[1] ?? ''
          return (
            <div key={g.title}>
              <div className="ap-nav-g">{g.title}</div>
              {ordered(ids).map((id) => (
                <div key={id} className={`ap-nav-i ${a.nav.hidden.includes(id) ? 'off' : ''}`}>
                  <span aria-hidden>{icon(id)}</span>
                  <span className="grow">{label(id)}</span>
                  <button className="icon" title="Subir" aria-label={`Subir ${label(id)}`} onClick={() => navMove(id, ids, -1)}>
                    ↑
                  </button>
                  <button className="icon" title="Bajar" aria-label={`Bajar ${label(id)}`} onClick={() => navMove(id, ids, 1)}>
                    ↓
                  </button>
                  <button className="icon" title={a.nav.pinned.includes(id) ? 'Quitar de la barra' : 'Fijar en la barra'} aria-label={`${a.nav.pinned.includes(id) ? 'Desfijar' : 'Fijar'} ${label(id)}`} aria-pressed={a.nav.pinned.includes(id)} onClick={() => togglePin(id)}>
                    {a.nav.pinned.includes(id) ? '📌' : '＋'}
                  </button>
                  <button className="icon" title={a.nav.hidden.includes(id) ? 'Mostrar' : 'Ocultar'} aria-label={`${a.nav.hidden.includes(id) ? 'Mostrar' : 'Ocultar'} ${label(id)}`} onClick={() => toggleNav(id)}>
                    {a.nav.hidden.includes(id) ? '🚫' : '👁'}
                  </button>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      </Sec>

      {/* ---------------- color por proyecto ---------------- */}
      <Sec icon="proyecto" title="Color por proyecto y cliente" sub="Franja de color en tareas, tablero y pestañas">
      <div className="meta">Se ve como una franja de color en las tareas, el tablero y las pestañas. El del proyecto manda sobre el del cliente.</div>
      {names('project').length + names('client').length === 0 && <div className="meta">Aún no hay tareas con proyecto o cliente.</div>}
      <div className="ap-colors">
        {(['project', 'client'] as const).flatMap((kind) =>
          names(kind).map((n) => {
            const k = (kind === 'project' ? 'p:' : 'c:') + n
            return (
              <div key={k} style={{ display: 'contents' }}>
                <span>
                  {n} <small className="meta">{kind === 'project' ? 'proyecto' : 'cliente'}</small>
                </span>
                <input type="color" value={a.colors[k] ?? '#7c8cff'} aria-label={`Color de ${n}`} onChange={(e) => setColor(k, e.target.value)} style={{ width: 38, height: 28, padding: 2, opacity: a.colors[k] ? 1 : 0.4 }} />
                <button className="icon" disabled={!a.colors[k]} title="Quitar el color" aria-label={`Quitar el color de ${n}`} onClick={() => setColor(k, null)}>
                  ✕
                </button>
              </div>
            )
          })
        )}
      </div>

      </Sec>

      <div className="foot" style={{ marginTop: 18 }}>
        <span className="meta">Los cambios se aplican y se guardan solos.</span>
        <span className="sp" />
        <button className="btn sm danger" onClick={() => void reset()}>
          Restablecer apariencia
        </button>
      </div>
    </div>
  )
}


/** Disposiciones de la ventana: aplicar, guardar la actual con nombre y borrar. */
function Layouts(): ReactNode {
  useDB() // repinta al guardar o borrar
  const lay = useLayout()
  const [name, setName] = useState('')
  const list = savedLayouts()
  return (
    <div className="ap-layouts">
      <div className="ap-layout-list">
        {list.map((p) => (
          <div key={p.id} className="ap-layout">
            <button className="btn sm" onClick={() => applyPreset(p)} title={`Panel lateral ${p.sideOpen ? 'abierto' : 'cerrado'} · terminal ${p.dockOpen ? 'abierta' : 'cerrada'}${p.focus ? ' · modo foco' : ''}`}>
              ▦ {p.name}
            </button>
            <button className="x" title="Eliminar esta disposición" aria-label={`Eliminar ${p.name}`} onClick={() => void deletePreset(p.id)}>
              ✕
            </button>
          </div>
        ))}
        {!list.length && <span className="meta">No hay disposiciones guardadas.</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        <input style={{ width: 220 }} placeholder="Nombre (ej.: Trabajo profundo)" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn sm primary"
          disabled={!name.trim()}
          onClick={() => {
            void savePreset(name)
            setName('')
          }}
        >
          Guardar la actual
        </button>
      </div>
      <div className="ap-sliders">
        <label>
          Ancho del panel del chat: {lay.sideW}px
          <input type="range" min={LIMITS.sideW[0]} max={LIMITS.sideW[1]} value={lay.sideW} onChange={(e) => setLayout({ sideW: Number(e.target.value) })} />
        </label>
        <label>
          Ancho del menú: {lay.sidebarW}px
          <input type="range" min={LIMITS.sidebarW[0]} max={LIMITS.sidebarW[1]} value={lay.sidebarW} onChange={(e) => setLayout({ sidebarW: Number(e.target.value) })} />
        </label>
        <button className="btn sm" onClick={() => setLayout({ sideW: 320, sidebarW: 200, dockH: 280 })}>
          Tamaños originales
        </button>
      </div>
    </div>
  )
}
