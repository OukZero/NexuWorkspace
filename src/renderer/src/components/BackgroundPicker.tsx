import { useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { BG_BUILTIN, BG_MAX_IMAGES, addBgImageFile, getBgActive, getBgDim, getBgGlass, getBgLib, removeBgImage, setBgActive, setBgDim, setBgGlass, useAppearance, useBackgrounds } from '../theme'
import { useUi } from '../ui'
import { G } from './glyphs'

const swatch = (rgb: [string, string, string]): string =>
  `radial-gradient(70% 60% at 85% 0%, rgba(${rgb[0]},.85), transparent 70%), radial-gradient(60% 55% at 0% 100%, rgba(${rgb[1]},.75), transparent 70%), radial-gradient(50% 50% at 60% 110%, rgba(${rgb[2]},.6), transparent 70%), #0b0c12`

/** Galería de fondos: degradados integrados y las imágenes que agregues (se guardan solo en este equipo). */
export function BackgroundPicker(): ReactNode {
  const ui = useUi()
  useAppearance() // repinta al cambiar los controles de atenuación
  useBackgrounds() // y al elegir, agregar o quitar un fondo
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const active = getBgActive()
  const lib = getBgLib()
  const isImage = active.startsWith('img:')

  const add = async (f: File | undefined): Promise<void> => {
    if (!f) return
    setBusy(true)
    try {
      await addBgImageFile(f)
    } catch (e) {
      ui.toast((e as Error).message || 'No se pudo usar esa imagen', true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bgp">
      <div className="bgp-grid" role="radiogroup" aria-label="Fondo de la aplicación">
        {BG_BUILTIN.map((b) => (
          <button key={b.id} role="radio" aria-checked={active === b.id} className={`bgp-t ${active === b.id ? 'on' : ''}`} style={{ background: b.id === 'plano' ? 'var(--bg)' : swatch(b.rgb) } as CSSProperties} title={b.label} aria-label={`Fondo ${b.label}`} onClick={() => setBgActive(b.id)}>
            <span>{b.label}</span>
          </button>
        ))}
        {lib.map((im) => (
          <div key={im.id} className={`bgp-t img ${active === 'img:' + im.id ? 'on' : ''}`} style={{ backgroundImage: `url("${im.url}")` }}>
            <button role="radio" aria-checked={active === 'img:' + im.id} className="bgp-pick" title={im.name} aria-label={`Fondo ${im.name}`} onClick={() => setBgActive('img:' + im.id)}>
              <span>{im.name}</span>
            </button>
            <button className="bgp-x" title="Quitar este fondo" aria-label={`Quitar el fondo ${im.name}`} onClick={() => removeBgImage(im.id)}>
              <G n="x" size={12} stroke={2.4} />
            </button>
          </div>
        ))}
        {lib.length < BG_MAX_IMAGES && (
          <button className="bgp-t add" disabled={busy} title="Agregar una imagen como fondo (JPG, PNG, WebP…)" aria-label="Agregar una imagen de fondo" onClick={() => file.current?.click()}>
            <G n="plus" size={18} />
            <span>{busy ? 'Subiendo…' : 'Agregar'}</span>
          </button>
        )}
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          void add(f)
        }}
      />
      {isImage && (
        <div className="bgp-sl">
          <label>
            Atenuar fondo · {getBgDim()}%
            <input type="range" min={40} max={95} step={5} value={getBgDim()} aria-label="Atenuar fondo" onChange={(e) => setBgDim(Number(e.target.value))} />
          </label>
          <label>
            Opacidad de paneles · {getBgGlass()}%
            <input type="range" min={40} max={100} step={5} value={getBgGlass()} aria-label="Opacidad de paneles" onChange={(e) => setBgGlass(Number(e.target.value))} />
          </label>
        </div>
      )}
      <small className="bgp-note">Tus imágenes se guardan solo en este equipo (hasta {BG_MAX_IMAGES}).</small>
    </div>
  )
}
