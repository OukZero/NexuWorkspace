import { useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, FormEvent, MouseEvent, ReactNode, RefObject, WheelEvent } from 'react'
import type { Attachment } from '../../../shared/types'
import { convLabel } from '../conversations'
import { call, findTask, useDB } from '../store'

const KEY = 'shutoki.dockConv'
const DRAFT = 'shutoki.dockDraft.'

interface Draft { text: string; files: Attachment[] }
// el borrador (texto y adjuntos) vive en localStorage por conversación: sobrevive a minimizar, cerrar la barra o reiniciar
const loadDraft = (id: string | undefined): Draft => {
  if (!id) return { text: '', files: [] }
  try { return { text: '', files: [], ...(JSON.parse(localStorage.getItem(DRAFT + id) ?? '{}') as Partial<Draft>) } } catch { return { text: '', files: [] } }
}
const saveDraft = (id: string | undefined, d: Draft): void => {
  if (!id) return
  try {
    if (!d.text && !d.files.length) localStorage.removeItem(DRAFT + id)
    else localStorage.setItem(DRAFT + id, JSON.stringify(d))
  } catch { /* sin storage */ }
}

/** Al acercar el mouse a un extremo de la fila, esta se desplaza sola en esa dirección; la rueda también la mueve en horizontal. */
function useEdgeScroll(): { ref: RefObject<HTMLDivElement | null>; onMouseMove: (e: MouseEvent) => void; onMouseLeave: () => void; onWheel: (e: WheelEvent) => void } {
  const ref = useRef<HTMLDivElement>(null)
  const speed = useRef(0)
  const raf = useRef(0)
  const tick = (): void => {
    if (!speed.current || !ref.current) { raf.current = 0; return }
    ref.current.scrollLeft += speed.current
    raf.current = requestAnimationFrame(tick)
  }
  const stop = (): void => { speed.current = 0 }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  return {
    ref,
    onMouseMove: (e) => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const ZONE = 48
      const l = e.clientX - r.left
      const rt = r.right - e.clientX
      // más cerca del extremo = más rápido
      speed.current = l < ZONE ? -Math.ceil((1 - l / ZONE) * 9) : rt < ZONE ? Math.ceil((1 - rt / ZONE) * 9) : 0
      if (speed.current && !raf.current) raf.current = requestAnimationFrame(tick)
    },
    onMouseLeave: stop,
    onWheel: (e) => { if (ref.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) ref.current.scrollLeft += e.deltaY }
  }
}

/** Chat AI en formato compacto para la barra derecha: elegir conversación, ver lo último y mandar un mensaje sin abrir la vista completa. */
export function DockChat({ big }: { big?: boolean }): ReactNode {
  const db = useDB()
  const [sel, setSel] = useState(() => {
    try { return localStorage.getItem(KEY) ?? '' } catch { return '' }
  })
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [err, setErr] = useState('')
  const log = useRef<HTMLDivElement>(null)
  const tasksRow = useEdgeScroll()
  const convsRow = useEdgeScroll()

  const lastTs = (id: string): number => {
    const m = db.chats[id].messages
    return m.length ? m[m.length - 1].ts : db.chats[id].createdAt
  }
  const convs = Object.entries(db.chats)
    .filter(([, c]) => !c.closed && !c.kind && db.tasks.some((t) => t.id === c.taskId && t.status !== 'done'))
    .sort((a, b) => lastTs(b[0]) - lastTs(a[0]))
    .slice(0, 40)
  const id = db.chats[sel] && convs.some(([k]) => k === sel) ? sel : convs[0]?.[0]
  const chat = id ? db.chats[id] : undefined
  const task = chat ? findTask(db, chat.taskId) : undefined
  const msgs = (chat?.messages ?? []).filter((m) => m.role !== 'system').slice(-6)

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [id, chat?.messages.length, chat?.running])

  // al cambiar de conversación se recupera su borrador
  useEffect(() => {
    const d = loadDraft(id)
    setText(d.text)
    setFiles(d.files)
    setErr('')
  }, [id])

  const edit = (t: string, f: Attachment[]): void => {
    setText(t)
    setFiles(f)
    saveDraft(id, { text: t, files: f })
  }
  const pick = (v: string): void => {
    setSel(v)
    try { localStorage.setItem(KEY, v) } catch { /* sin storage */ }
  }
  const attach = async (): Promise<void> => {
    if (!id) return
    try {
      const r = await call('attach:pick', id)
      if (r.length) edit(text, [...files, ...r])
    } catch (x) {
      setErr((x as Error).message)
    }
  }
  // pegar o soltar imágenes y documentos
  const addBlobs = async (blobs: File[]): Promise<void> => {
    if (!id || !blobs.length) return
    try {
      const added: Attachment[] = []
      for (const f of blobs) added.push(await call('attach:save', id, f.name || 'captura.png', new Uint8Array(await f.arrayBuffer())))
      edit(text, [...files, ...added])
    } catch (x) {
      setErr((x as Error).message)
    }
  }
  const onPaste = (e: ClipboardEvent<HTMLInputElement>): void => {
    const blobs = [...e.clipboardData.files]
    if (!blobs.length) return
    e.preventDefault()
    void addBlobs(blobs)
  }
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!id) return
    if (chat?.running) {
      call('chat:cancel', id).catch((x: Error) => setErr(x.message))
      return
    }
    const msg = text.trim()
    if (!msg && !files.length) return
    const sent = files
    edit('', [])
    setErr('')
    try {
      await call('chat:send', id, msg || 'Mira los archivos adjuntos.', sent)
    } catch (x) {
      edit(msg, sent) // si falla el envío no se pierde lo escrito
      setErr((x as Error).message)
    }
  }

  if (!convs.length) return <div className="dkc dkc-empty">Aún no hay conversaciones. Abre una desde Chat AI.</div>
  return (
    <div className={`dkc${big ? ' big' : ''}`}>
      {/* tareas como píldoras; al elegir una se abre su conversación más reciente */}
      <div className="dkc-tasks" role="tablist" aria-label="Tareas" ref={tasksRow.ref} onMouseMove={tasksRow.onMouseMove} onMouseLeave={tasksRow.onMouseLeave} onWheel={tasksRow.onWheel}>
        {[...new Set(convs.map(([, c]) => c.taskId))].map((tid) => {
          const first = convs.find(([, c]) => c.taskId === tid)
          const busy = convs.some(([, c]) => c.taskId === tid && c.running)
          return (
            <button key={tid} type="button" role="tab" className={`dkc-task${tid === chat?.taskId ? ' on' : ''}`} title={findTask(db, tid)?.title} onClick={() => first && pick(first[0])}>
              {busy && <i className="dkc-live" />}{findTask(db, tid)?.title ?? 'Tarea'}
            </button>
          )
        })}
      </div>
      <div className="dkc-convs" role="tablist" aria-label="Conversaciones" ref={convsRow.ref} onMouseMove={convsRow.onMouseMove} onMouseLeave={convsRow.onMouseLeave} onWheel={convsRow.onWheel}>
        {convs.filter(([, c]) => c.taskId === chat?.taskId).map(([k, c]) => (
          <button key={k} type="button" role="tab" className={`dkc-conv${k === id ? ' on' : ''}`} onClick={() => pick(k)}>
            {c.running && <i className="dkc-live" />}{convLabel(c)}
          </button>
        ))}
      </div>
      <div className="dkc-log" ref={log}>
        {!msgs.length && <div className="dkc-empty">Escribe el primer mensaje de esta conversación.</div>}
        {msgs.map((m, i) => (
          <div key={`${id}-${m.ts}-${i}`} className={`dkc-row ${m.role}`}>
            <span className="dkc-av">{m.role === 'user' ? 'Tú' : 'IA'}</span>
            <div className={`dkc-m ${m.role}`}>
              {m.attachments?.length ? <div className="dkc-att">{m.attachments.map((a, k) => <span key={k}>{a.image ? '🖼' : '📄'} {a.name}</span>)}</div> : null}
              {m.text.length > 400 ? m.text.slice(0, 400) + '…' : m.text}
            </div>
          </div>
        ))}
        {chat?.running && (
          <div className="dkc-row assistant">
            <span className="dkc-av">IA</span>
            <div className="dkc-m assistant dkc-typing"><i /><i /><i /></div>
          </div>
        )}
      </div>
      {err && <div className="dkc-err">{err}</div>}
      {files.length > 0 && (
        <div className="dkc-files">
          {files.map((f, i) => (
            <span key={f.path + i} className="dkc-file" title={f.name}>
              {f.image ? '🖼' : '📄'} <span>{f.name}</span>
              <button type="button" aria-label="Quitar adjunto" onClick={() => edit(text, files.filter((_, j) => j !== i))}>✕</button>
            </span>
          ))}
        </div>
      )}
      <form onSubmit={(e) => void submit(e)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void addBlobs([...e.dataTransfer.files]) }}>
        <button type="button" className="dkc-clip" title="Adjuntar imágenes o documentos" aria-label="Adjuntar" onClick={() => void attach()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" /></svg>
        </button>
        <input value={text} onChange={(e) => edit(e.target.value, files)} onPaste={onPaste} placeholder={task ? `Mensaje a «${task.title}»…` : 'Mensaje…'} aria-label="Mensaje" />
        <button className={`dkc-send${chat?.running ? ' stop' : ''}`} type="submit" aria-label={chat?.running ? 'Detener' : 'Enviar'}>
          {chat?.running
            ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
        </button>
      </form>
    </div>
  )
}
