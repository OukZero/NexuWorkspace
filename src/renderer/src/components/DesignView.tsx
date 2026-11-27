import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Attachment, MockupFile } from '../../../shared/types'
import { designConv } from '../conversations'
import { findTask, useDB, useNow } from '../store'
import { useUi } from '../ui'
import { AttachmentList } from './Chat'
import { DesignStyleModal } from './DesignStyleModal'
import { G } from './glyphs'
import { IconStop } from './icons'
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
  const now = useNow(1000)
  const [styleOpen, setStyleOpen] = useState(false)
  const [since, setSince] = useState(0)
  useEffect(() => setSince(running ? Date.now() : 0), [running])
  const act = conv?.chat.activity ?? []
  const lastAct = act[act.length - 1]
  const pending = conv?.chat.pending ?? []
  const quiet = running && lastAct ? Math.floor((now - lastAct.ts) / 1000) : 0
  const mmss = (ms: number): string => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
  const cancel = (): void => {
    if (conv?.id) void ui.run('chat:cancel', conv.id)
  }
  const last = [...(conv?.chat.messages ?? [])].reverse().find((m) => m.role === 'assistant' || m.role === 'system')

  const [files, setFiles] = useState<MockupFile[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [device, setDevice] = useState<Device>('desktop')
  // 'fit' = reducir el mockup al ancho disponible (se renderiza a su ancho real y se escala); un número = zoom fijo
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [listOpen, setListOpen] = useState(true)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStageSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
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

  // espacio útil del visor (menos el relleno); el iframe mide el ancho real del dispositivo y se escala para que quepa entero
  const availW = Math.max(200, stageSize.w - 24)
  const availH = Math.max(200, stageSize.h - 24)
  const fitScale = Math.min(1, availW / WIDTH[device])
  const scale = zoom === 'fit' ? fitScale : zoom
  const frameH = Math.max(320, Math.round(availH / scale))
  const current = files.find((f) => f.name === selected)
  const src = current ? `shutoki-mockup://m/${encodeURIComponent(taskId)}/${encodeURIComponent(current.name)}?v=${Math.round(current.mtime)}` : null

  return (
    <div className="design">
      {styleOpen && <DesignStyleModal onClose={() => setStyleOpen(false)} />}
      <aside className="design-list" hidden={!listOpen}>
        <div className="design-list-h">
          <b>Mockups</b>
          <button className="icon" title="Estilo de diseño: guía, referencias e imágenes para todos los mockups" onClick={() => setStyleOpen(true)}>
            🎨
          </button>
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
          <button className="icon" title={listOpen ? 'Ocultar la lista de mockups' : 'Mostrar la lista de mockups'} aria-pressed={!listOpen} onClick={() => setListOpen((v) => !v)}>◧</button>
          <span className="grow meta">{task?.title}</span>
          <div className="seg" role="group" aria-label="Zoom">
            <button title="Reducir" onClick={() => setZoom(Math.max(0.25, +(scale - 0.1).toFixed(2)))}>−</button>
            <button className={zoom === 'fit' ? 'on' : ''} title="Ajustar al ancho disponible" onClick={() => setZoom('fit')}>{zoom === 'fit' ? `Ajustar · ${Math.round(scale * 100)}%` : `${Math.round(scale * 100)}%`}</button>
            <button title="Ampliar" onClick={() => setZoom(Math.min(2, +(scale + 0.1).toFixed(2)))}>+</button>
            <button className={zoom === 1 ? 'on' : ''} title="Tamaño real" onClick={() => setZoom(1)}>100%</button>
          </div>
          <button className="btn sm" disabled={!selected} onClick={() => void exportAs('png')}>
            Exportar PNG
          </button>
          <button className="btn sm" disabled={!selected} onClick={() => void exportAs('pdf')}>
            Exportar PDF
          </button>
        </div>
        <div className="design-stage" ref={stageRef}>
          {src ? (
            <div className="design-frame" style={{ width: WIDTH[device] * scale, height: frameH * scale }}>
              <iframe key={src} title={current?.name} src={src} sandbox="allow-scripts" style={{ width: WIDTH[device], height: frameH, transform: `scale(${scale})` }} />
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
                <div className="design-run">
                  <span className="typing">
                    <i />
                    <i />
                    <i />
                    &nbsp;{pending.length ? 'Esperando tu permiso…' : 'Claude está diseñando…'} {since > 0 && mmss(now - since)}
                  </span>
                  {lastAct && (
                    <small className="meta" title={lastAct.target}>
                      Última acción: {lastAct.label} {lastAct.target ? `· ${lastAct.target.slice(0, 60)}` : ''} · hace {quiet}s
                      {quiet > 90 && !pending.length ? ' — sin actividad, quizá esté trabado: cancela y reintenta' : ''}
                    </small>
                  )}
                  <button className="btn sm danger" onClick={cancel}>
                    <IconStop /> Cancelar
                  </button>
                </div>
              ) : (
                last && <Markdown text={last.text} />
              )}
            </div>
          )}
          {pending.map((p) => (
            <div key={p.id} className="perm">
              <div className="perm-title">
                Claude pide permiso · <b>{p.tool === 'Bash' ? 'ejecutar un comando' : p.tool}</b>
              </div>
              <pre className="perm-cmd">{p.target}</pre>
              <div className="foot">
                <button className="btn sm primary" onClick={() => void ui.run('chat:permit', conv!.id, p.id, 'allow')}>
                  Permitir
                </button>
                <button className="btn sm danger" onClick={() => void ui.run('chat:permit', conv!.id, p.id, 'deny')}>
                  Rechazar
                </button>
              </div>
            </div>
          ))}
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
            className={`composer cbox ${dragging ? 'drag' : ''}`}
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
            <div className="cfoot">
              <button className="ib clip" title="Adjuntar logo, capturas o fotos de referencia (también puedes pegar o arrastrar)" aria-label="Adjuntar" disabled={running} onClick={() => void pickFiles()}>
                <G n="files" size={16} />
              </button>
              {selected && (
                <label className="cfg-btn design-iter-chip" title="Se guarda como versión nueva del mockup seleccionado">
                  <input type="checkbox" checked={iterate} onChange={(e) => setIterate(e.target.checked)} /> Partir de «{selected}»
                </label>
              )}
              <span className="cfoot-sp" />
              <button className="btn primary send design-send"disabled={running || (!prompt.trim() && !attached.length)} onClick={() => void send()}>
                <G n="send" size={14} stroke={2.2} /> {running ? 'Diseñando…' : selected && iterate ? 'Nueva versión' : 'Crear mockup'}
              </button>
            </div>
          </div>
          <div className="composer-hint">
            <span>
              <kbd>↵</kbd> enviar
            </span>
            <span>
              <kbd>⇧ ↵</kbd> nueva línea
            </span>
            <span>
              <kbd>Ctrl V</kbd> pegar imagen
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
