import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { DesignStyle } from '../../../shared/types'
import { useUi } from '../ui'

const EJEMPLO = `Personalidad: sobria, técnica, cercana.
Colores: fondo #0f1115, superficie #171a21, texto #e8eaf0, acento #5fe3b4, error #ff6b6b.
Tipografía: Inter para texto, JetBrains Mono para datos.
Forma: radios de 10 px, bordes de 1 px, sombras suaves; densidad media.
Componentes: botones sólidos con acento para la acción principal; tablas con filas de 40 px.
Evitar: degradados llamativos, iconos recargados, lorem ipsum.`

/** Guía de estilo global del front: todos los mockups de la pestaña Diseño la reciben como instrucciones obligatorias. */
export function DesignStyleModal({ onClose }: { onClose: () => void }): ReactNode {
  const ui = useUi()
  const [st, setSt] = useState<DesignStyle | null>(null)
  const [brief, setBrief] = useState('')
  const [links, setLinks] = useState('')
  const [saved, setSaved] = useState(true)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void ui.run('design:style-get').then((s) => {
      if (!s) return
      setSt(s)
      setBrief(s.brief)
      setLinks(s.links.join('\n'))
    })
  }, [ui])

  const save = async (): Promise<void> => {
    const s = await ui.run('design:style-save', { brief, links: links.split('\n') })
    if (s) {
      setSt(s)
      setSaved(true)
    }
  }
  const add = async (files: FileList | File[]): Promise<void> => {
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue
      const s = await ui.run('design:style-add', f.name || 'referencia.png', new Uint8Array(await f.arrayBuffer()))
      if (s) setSt(s)
    }
  }

  return (
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dstyle" role="dialog" aria-label="Estilo de diseño" onPaste={(e) => void add(e.clipboardData.files)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void add(e.dataTransfer.files) }}>
        <div className="dstyle-h">
          <b>🎨 Estilo de diseño</b>
          <button className="icon" aria-label="Cerrar" onClick={onClose}>✕</button>
        </div>
        <p className="meta">Se aplica a todos los mockups de todas las tareas. Claude lo trata como regla obligatoria y lo vuelca en variables CSS.</p>

        <label>Guía de estilo</label>
        <textarea value={brief} placeholder={EJEMPLO} onChange={(e) => { setBrief(e.target.value); setSaved(false) }} spellCheck={false} />

        <label>Webs de referencia <small className="meta">(una por línea; Claude las consulta)</small></label>
        <textarea className="short" value={links} placeholder="https://linear.app&#10;https://stripe.com" onChange={(e) => { setLinks(e.target.value); setSaved(false) }} spellCheck={false} />

        <label>Imágenes de referencia <small className="meta">(capturas, logo, moodboard · pega, arrastra o elige)</small></label>
        <div className="dstyle-refs">
          {st?.refs.map((r) => (
            <span key={r.name} className="chip" title={r.path}>
              🖼 {r.name}
              <button aria-label={`Quitar ${r.name}`} onClick={() => void ui.run('design:style-remove', r.name).then((s) => s && setSt(s))}>✕</button>
            </span>
          ))}
          <button className="btn sm" onClick={() => file.current?.click()}>+ Añadir imagen</button>
          <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = '' }} />
        </div>

        <div className="dstyle-f">
          <span className="meta">{saved ? 'Guardado' : 'Cambios sin guardar'}</span>
          <button className="btn" onClick={onClose}>Cerrar</button>
          <button className="btn primary" disabled={saved} onClick={() => void save()}>Guardar estilo</button>
        </div>
      </div>
    </div>
  )
}
