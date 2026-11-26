import { useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { BG_BUILTIN, BG_MAX_IMAGES, addBgImageFile, getAppearance, getBgActive, getBgLib, removeBgImage, resetBgAdjust, resetChatAdjust, setBgActive, update, useAppearance, useBackgrounds } from '../theme'
import type { Appearance } from '../theme'
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
  const a = getAppearance()
  type NumKey = 'bgX' | 'bgY' | 'bgZoom' | 'bgDim' | 'bgBlur' | 'bgBright' | 'bgSat' | 'bgGlass' | 'glassBlur'
  const sl = (k: NumKey, label: string, min: number, max: number, step: number, unit: string): ReactNode => (
    <label>
      {label} · {a[k]}
      {unit}
      <input type="range" min={min} max={max} step={step} value={a[k]} aria-label={label} onChange={(e) => update({ [k]: Number(e.target.value) })} />
    </label>
  )

  const csl = (k: 'chatBg' | 'chatMsgs' | 'chatUser' | 'chatComp' | 'chatBlur', label: string, min: number, max: number, step: number, unit: string): ReactNode => (
    <label>
      {label} · {a[k]}
      {unit}
      <input type="range" min={min} max={max} step={step} value={a[k]} aria-label={label} onChange={(e) => update({ [k]: Number(e.target.value) })} />
    </label>
  )

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
            Ajuste de la imagen
            <select value={a.bgFit} onChange={(e) => update({ bgFit: e.target.value as Appearance['bgFit'] })}>
              <option value="cover">Rellenar</option>
              <option value="contain">Ajustar entera</option>
              <option value="tile">Mosaico</option>
            </select>
          </label>
          {sl('bgX', 'Posición horizontal', 0, 100, 1, '%')}
          {sl('bgY', 'Posición vertical', 0, 100, 1, '%')}
          {sl('bgZoom', 'Zoom', 100, 300, 5, '%')}
          {sl('bgDim', 'Opacidad de la imagen (menos = más visible)', 0, 95, 5, '% velo')}
          {sl('bgBlur', 'Desenfoque de la imagen', 0, 30, 1, ' px')}
          {sl('bgBright', 'Brillo', 40, 160, 5, '%')}
          {sl('bgSat', 'Saturación', 0, 200, 5, '%')}
          {sl('bgGlass', 'Opacidad de paneles', 20, 100, 5, '%')}
          {sl('glassBlur', 'Desenfoque de paneles', 0, 30, 1, ' px')}
          <button className="btn sm" onClick={resetBgAdjust}>
            Restablecer ajustes
          </button>
        </div>
      )}
      <div className="bgp-sl">
        <b className="bgp-sub">Chat</b>
        {csl('chatBg', 'Fondo del chat', 0, 100, 5, '%')}
        {csl('chatMsgs', 'Mensajes de la IA', 0, 100, 5, '%')}
        {csl('chatUser', 'Tus mensajes', 0, 100, 5, '%')}
        {csl('chatComp', 'Caja de escritura', 0, 100, 5, '%')}
        {csl('chatBlur', 'Desenfoque del fondo del chat', 0, 30, 1, ' px')}
        <small className="bgp-note">0 % = transparente (se ve el fondo); 100 % = opaco, como siempre.</small>
        <button className="btn sm" onClick={resetChatAdjust}>
          Restablecer el chat
        </button>
      </div>
      <small className="bgp-note">Tus imágenes se guardan solo en este equipo (hasta {BG_MAX_IMAGES}).</small>
    </div>
  )
}
