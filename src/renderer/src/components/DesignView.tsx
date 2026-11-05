import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Attachment, MockupFile } from '../../../shared/types'
import { designConv } from '../conversations'
import { findTask, useDB } from '../store'
import { useUi } from '../ui'
import { AttachmentList } from './Chat'
import { Markdown } from './Markdown'

type Device = 'desktop' | 'tablet' | 'mobile'
const WIDTH: Record<Device, number> = { desktop: 1280, tablet: 820, mobile: 390 }
const DEVICE_LABEL: Record<Device, string> = { desktop: '🖥 Escritorio', tablet: '▭ Tableta', mobile: '▯ Móvil' }

const IDEAS = ['Pantalla de inicio de sesión', 'Dashboard con métricas y una tabla', 'Formulario de alta con validaciones', 'Landing page para presentar el proyecto', 'Rediseña esta pantalla con la marca de https://']

/** Pestaña Diseño de una tarea: Claude genera mockups HTML y aquí se previsualizan, versionan y exportan. */
export function DesignView({ taskId }: { taskId: string }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const task = findTask(db, taskId)
  const conv = designConv(db, taskId)
  const running = !!conv?.chat.running
  const last = [...(conv?.chat.messages ?? [])].reverse().find((m) => m.role === 'assistant' || m.role === 'system')

  const [files, setFiles] = useState<MockupFile[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [device, setDevice] = useState<Device>('desktop')
  const [prompt, setPrompt] = useState('')
  const [iterate, setIterate] = useState(true)
  const [attached, setAttached] = useState<Attachment[]>([])
  const [dragging, setDragging] = useState(false)
  const newest = useRef(0)

  const refresh = useCallback(async () => {
    const list = await window.api.call('mockup:list', taskId)
    setFiles(list)
    const top = list[0]
    // un mockup nuevo (o actualizado) se muestra solo; si no, se conserva la selección
    if (top && top.mtime > newest.current) {
      if (newest.current) setSelected(top.name)
      newest.current = top.mtime
    }
    setSelected((cur) => (cur && list.some((f) => f.name === cur) ? cur : (list[0]?.name ?? null)))
  }, [taskId])

  useEffect(() => {
    newest.current = 0
    void refresh()
  }, [taskId, running, refresh])

  // mientras Claude trabaja, el mockup aparece en cuanto se guarda el archivo
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => void refresh(), 1500)
    return () => clearInterval(id)
  }, [running, refresh])

  // la conversación de Diseño se crea al primer uso (también al adjuntar, porque los adjuntos se guardan por conversación)
  const ensureConv = async (): Promise<string | undefined> => conv?.id ?? (await ui.run('chat:new', taskId, 'design'))

  const addBlobs = async (blobs: File[]): Promise<void> => {
    const id = await ensureConv()
    if (!id) return
    for (const f of blobs) {
      const a = await ui.run('attach:save', id, f.name || 'captura.png', new Uint8Array(await f.arrayBuffer()))
      if (a) setAttached((cur) => [...cur, a])
    }
  }

  const pickFiles = async (): Promise<void> => {
    const id = await ensureConv()
    if (!id) return
    const r = await ui.run('attach:pick', id)
    if (r?.length) setAttached((cur) => [...cur, ...r])
  }

  const send = async (): Promise<void> => {
    const text = prompt.trim()
    if ((!text && !attached.length) || running) return
    const sent = attached
    setPrompt('')
    setAttached([])
    const id = await ensureConv()
    if (!id) {
      setPrompt(text)
      return setAttached(sent)
    }
    const what = text || 'Usa las imágenes adjuntas como referencia (logo, colores y estilo).'
    const base = selected && iterate ? `Parte del mockup existente «${selected}» y crea una nueva versión con este cambio: ${what}` : what
    const r = await ui.run('chat:send', id, base, sent)
    if (r === undefined) {
      setPrompt(text)
      setAttached(sent)
    }
  }

  const exportAs = async (format: 'png' | 'pdf'): Promise<void> => {
    if (!selected) return
    const p = await ui.run('mockup:export', taskId, selected, format, WIDTH[device])
    if (p) ui.toast(`Exportado: ${p}`)
  }

  const remove = async (name: string): Promise<void> => {
    if (!(await ui.confirm(`Se eliminará el mockup «${name}».`, { title: "Eliminar mockup", confirmLabel: "Eliminar", danger: true }))) return
    await ui.run('mockup:delete', taskId, name)
    void refresh()
  }

  const current = files.find((f) => f.name === selected)
  const src = current ? `shutoki-mockup://m/${encodeURIComponent(taskId)}/${encodeURIComponent(current.name)}?v=${Math.round(current.mtime)}` : null

  return (
    <div className="design">
      <aside className="design-list">
        <div className="design-list-h">
          <b>Mockups</b>
          <button className="icon" title="Abrir la carpeta de mockups" onClick={() => ui.run('mockup:reveal', taskId)}>
            📂
          </button>
        </div>
        {files.length ? (
          files.map((f) => (
            <div key={f.name} className={`dfile ${selected === f.name ? 'on' : ''}`} onClick={() => setSelected(f.name)} title={f.name}>
              <span className="grow">
                <b>{f.name.replace(/\.html?$/i, '')}</b>
                <small>{new Date(f.mtime).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
              </span>
              <button
                className="icon"
                title="Eliminar"
                onClick={(e) => {
                  e.stopPropagation()
                  void remove(f.name)
                }}
              >
                ✕
              </button>
            </div>
          ))
        ) : (
          <div className="meta">Todavía no hay mockups. Describe uno abajo y Claude lo diseña.</div>
        )}
      </aside>

      <section className="design-main">
        <div className="design-bar">
          <div className="seg">
            {(Object.keys(WIDTH) as Device[]).map((d) => (
              <button key={d} className={device === d ? 'on' : ''} onClick={() => setDevice(d)}>
                {DEVICE_LABEL[d]}
              </button>
            ))}
          </div>
          <span className="grow meta">{task?.title}</span>
          <button className="btn sm" disabled={!selected} onClick={() => void exportAs('png')}>
            Exportar PNG
          </button>
          <button className="btn sm" disabled={!selected} onClick={() => void exportAs('pdf')}>
            Exportar PDF
          </button>
        </div>
        <div className="design-stage">
          {src ? (
            <div className="design-frame" style={{ width: device === 'desktop' ? '100%' : WIDTH[device] }}>
              <iframe key={src} title={current?.name} src={src} sandbox="allow-scripts" />
            </div>
          ) : (
            <div className="empty" style={{ margin: 'auto', maxWidth: 420 }}>
              {running ? 'Claude está diseñando…' : 'Aquí verás el mockup. Describe lo que necesitas en el cuadro de abajo.'}
            </div>
          )}
        </div>
        <div className="design-chat">
          {(running || last) && (
            <div className={`design-say ${last?.role === 'system' ? 'err' : ''}`}>
              {running ? (
                <span className="typing">
                  <i />
                  <i />
                  <i />
                  &nbsp;Claude está diseñando…
                </span>
              ) : (
                last && <Markdown text={last.text} />
              )}
            </div>
          )}
          {!files.length && !running && (
            <div className="suggest">
              {IDEAS.map((i) => (
                <button key={i} onClick={() => setPrompt(i)}>
                  {i}
                </button>
              ))}
            </div>
          )}
          {attached.length > 0 && (
            <div className="attach-bar">
              <AttachmentList items={attached} onRemove={(i) => setAttached((cur) => cur.filter((_, j) => j !== i))} />
            </div>
          )}
          <div
            className={`composer ${dragging ? 'drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              void addBlobs([...e.dataTransfer.files])
            }}
          >
            <button className="btn clip" title="Adjuntar logo, capturas o fotos de referencia (también puedes pegar o arrastrar)" disabled={running} onClick={() => void pickFiles()}>
              📎
            </button>
            <textarea
              rows={1}
              value={prompt}
              disabled={running}
              placeholder={selected && iterate ? `Qué cambiar de «${selected}»… (puedes adjuntar un logo o referencias)` : 'Describe el mockup que necesitas… (puedes adjuntar un logo o referencias, o pedirle que mire una web)'}
              onPaste={(e) => {
                const blobs = [...e.clipboardData.files]
                if (!blobs.length) return
                e.preventDefault()
                void addBlobs(blobs)
              }}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            <button className="btn primary" disabled={running || (!prompt.trim() && !attached.length)} onClick={() => void send()}>
              {running ? 'Diseñando…' : selected && iterate ? 'Nueva versión' : 'Crear mockup'}
            </button>
          </div>
          {selected && (
            <label className="design-iter">
              <input type="checkbox" checked={iterate} onChange={(e) => setIterate(e.target.checked)} /> Partir del mockup seleccionado (se guarda como versión nueva)
            </label>
          )}
        </div>
      </section>
    </div>
  )
}
