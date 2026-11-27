import { useEffect, useState } from 'react'
import type { ModelStatus, Settings } from '../../../shared/types'
import { useUi } from '../ui'

/** Ajustes de reuniones sobre almacenamiento: modelo de voz, carpeta de guardado (con opción de mover lo existente) y retención del audio. */
export function MeetingsStorageSettings({ s, set }: { s: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void }): React.JSX.Element {
  const ui = useUi()
  const [model, setModel] = useState<ModelStatus | null>(null)

  const refresh = (): Promise<ModelStatus | void> => window.api.call('meetings:modelStatus').then((m) => (setModel(m), m)).catch(() => {})
  useEffect(() => {
    void refresh()
  }, [])
  // mientras se descarga se consulta cada segundo; al terminar se para solo
  useEffect(() => {
    if (!model?.downloading) return
    const t = setInterval(() => void refresh(), 1000)
    return () => clearInterval(t)
  }, [model?.downloading])

  const download = (): void => {
    void ui.run('meetings:downloadModel').then(() => refresh())
    setModel({ present: false, downloading: true, percent: 0 }) // respuesta inmediata; el sondeo lo corrige
  }

  const move = async (): Promise<void> => {
    const dest = await ui.run('folder:pick')
    if (!dest) return
    if (!(await ui.confirm(`Se moverán las reuniones existentes (audio, datos y .md) a:\n${dest}`, { title: 'Mover reuniones', confirmLabel: 'Mover' }))) return
    const n = await ui.run('meetings:moveTo', dest)
    if (n === undefined) return
    set('meetingsDir', dest)
    ui.toast(n ? `${n} reunión(es) movida(s).` : 'Carpeta cambiada (no había reuniones que mover).')
  }

  return (
    <>
      <div style={{ gridColumn: '1 / -1' }}>
        <label>Modelo de voz por defecto (ggml-small, ~465 MB)</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {model?.present ? (
            <span className="meta">Descargado: ya funciona sin conexión.</span>
          ) : model?.downloading ? (
            <>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--ln)', overflow: 'hidden' }}>
                <div style={{ width: `${model.percent}%`, height: '100%', background: 'var(--accent)', transition: 'width .3s' }} />
              </div>
              <span className="meta">{model.percent}%</span>
            </>
          ) : (
            <button className="btn sm" onClick={download}>
              Descargar ahora
            </button>
          )}
        </div>
        {model?.error && !model.downloading && !model.present && <div className="meta" style={{ color: 'var(--danger, #e5484d)' }}>{model.error}</div>}
      </div>
      <div style={{ gridColumn: '1 / -1' }}>
        <label>Carpeta de grabaciones y transcripciones</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <input style={{ flex: 1, minWidth: 0 }} value={s.meetingsDir} placeholder="Por defecto: la carpeta de datos de la app" onChange={(e) => set('meetingsDir', e.target.value)} />
          <button className="btn sm" onClick={() => void ui.run('folder:pick').then((p) => p && set('meetingsDir', p))}>
            Elegir…
          </button>
          <button className="btn sm" onClick={() => void move()}>
            Mover reuniones…
          </button>
        </div>
        <div className="meta">«Elegir» solo cambia dónde se guardan las nuevas (al guardar los ajustes). «Mover» traslada también las existentes, de inmediato. Cada reunión deja un .md (resumen y transcripción) y un .txt (solo texto).</div>
      </div>
      <div>
        <label>Borrar el audio conservado tras (días, 0 = nunca)</label>
        <input type="number" min={0} value={s.meetingAudioDays} disabled={!s.meetingKeepAudio} onChange={(e) => set('meetingAudioDays', Number(e.target.value) || 0)} />
        <div className="meta">Solo aplica con «Conservar el audio». El texto y el .md no se borran.</div>
      </div>
    </>
  )
}
