import { useEffect, useRef } from 'react'
import type { PointerEvent as RPointerEvent, ReactNode } from 'react'
import { closedConvs, convLabel, openConvs } from '../conversations'
import { toggleFullscreen, useFullscreen } from '../fullscreen'
import { activeEntry, findTask, useDB } from '../store'
import { getFocus, setFocusMode, useFocusMode } from '../theme'
import { workFolder } from '../../../shared/util'
import { useUi } from '../ui'
import { isWorkTask } from '../utils'
import { KIND_LABEL, LAYOUTS, MAX_PANES, NEEDS_TASK, applyLayout, closePane, layoutIdOf, panesOf, resetWorkspace, setFocus, setPane, setSizes, splitPane, useWorkspace } from '../workspace'
import type { PaneKind, WNode } from '../workspace'
import { Board } from './Board'
import { ChatView } from './Chat'
import { FilesView } from './FilesView'
import { GitView } from './GitView'
import { G, type GlyphName } from './glyphs'
import { Hours } from './Hours'
import { MusicView } from './MusicView'
import { NotesView } from './NotesView'
import { WebPane } from './WebPane'
import { dropSlots } from './webHost'
import { WhatsAppView } from './WhatsAppView'
import { Panel } from './Panel'
import { Select } from './Select'
import { TerminalDock } from './TerminalDock'
import { Today } from './Today'

const KIND_ICON: Record<PaneKind, GlyphName> = { empty: 'plus', chat: 'chat', git: 'git', files: 'code', terminal: 'terminal', panel: 'panelhome', tasks: 'today', board: 'board', hours: 'hours', notes: 'list', music: 'music', whatsapp: 'send', web: 'popout' }
const PICKABLE: PaneKind[] = ['chat', 'git', 'files', 'terminal', 'panel', 'tasks', 'board', 'hours', 'notes', 'music', 'whatsapp', 'web']
const KIND_HINT: Record<PaneKind, string> = {
  empty: '',
  chat: 'Conversar con la IA sobre una tarea',
  git: 'Cambios, commit, ramas e historial',
  files: 'Explorar y leer el código',
  terminal: 'Terminal en la carpeta de la tarea',
  panel: 'Resumen del día',
  tasks: 'Lista y captura rápida',
  board: 'Tareas por estado',
  hours: 'Registro y línea del día',
  notes: 'Tus notas en Markdown',
  music: 'Reproductor y búsqueda de Spotify',
  whatsapp: 'WhatsApp Web (solo en un panel)',
  web: 'Cualquier sitio: Outlook, Teams, GitHub, Jira…'
}

/** Dibujito de cada distribución (botón del selector). */
function LayoutGlyph({ id }: { id: string }): ReactNode {
  const r = (x: number, y: number, w: number, h: number): ReactNode => <rect key={`${x}${y}${w}${h}`} x={x} y={y} width={w} height={h} rx="1.6" />
  const shapes: Record<string, ReactNode[]> = {
    solo: [r(2, 2, 16, 12)],
    cols2: [r(2, 2, 7.2, 12), r(10.8, 2, 7.2, 12)],
    rows2: [r(2, 2, 16, 5.2), r(2, 8.8, 16, 5.2)],
    cols3: [r(2, 2, 4.4, 12), r(7.8, 2, 4.4, 12), r(13.6, 2, 4.4, 12)],
    main2: [r(2, 2, 9.4, 12), r(13, 2, 5, 5.2), r(13, 8.8, 5, 5.2)],
    grid4: [r(2, 2, 7.2, 5.2), r(10.8, 2, 7.2, 5.2), r(2, 8.8, 7.2, 5.2), r(10.8, 8.8, 7.2, 5.2)]
  }
  return (
    <svg className="g" viewBox="0 0 20 16" width="20" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      {shapes[id]}
    </svg>
  )
}

/** Tarea que usa un panel sin tarea fija: la del timer, la que está en curso o la primera de hoy. */
function useAutoTask(): string {
  const db = useDB()
  const t = activeEntry(db)?.taskId ?? db.tasks.find((x) => isWorkTask(x) && x.status === 'doing')?.id ?? db.tasks.find((x) => isWorkTask(x) && x.status === 'today')?.id ?? db.tasks.find((x) => isWorkTask(x) && x.status !== 'done')?.id
  return t ?? ''
}

function Gutter({ dir, onStart, onDrag }: { dir: 'row' | 'col'; onStart: () => void; onDrag: (deltaPx: number) => void }): ReactNode {
  const start = useRef(0)
  const down = (e: RPointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    start.current = dir === 'row' ? e.clientX : e.clientY
    onStart()
  }
  const move = (e: RPointerEvent<HTMLDivElement>): void => {
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) onDrag((dir === 'row' ? e.clientX : e.clientY) - start.current)
  }
  return <div className={`wsx-gut ${dir === 'row' ? 'h' : 'v'}`} role="separator" aria-orientation={dir === 'row' ? 'vertical' : 'horizontal'} aria-label="Arrastra para cambiar el tamaño" onPointerDown={down} onPointerMove={move} />
}

function SplitView({ node }: { node: Extract<WNode, { t: 'split' }> }): ReactNode {
  const box = useRef<HTMLDivElement>(null)
  const base = useRef<number[]>([])
  const resize = (i: number, deltaPx: number): void => {
    const el = box.current
    if (!el || !base.current.length) return
    const total = node.dir === 'row' ? el.clientWidth : el.clientHeight
    const d = (deltaPx / Math.max(1, total)) * 100
    const min = 12
    const s = [...base.current]
    const pair = s[i] + s[i + 1]
    s[i] = Math.min(pair - min, Math.max(min, base.current[i] + d))
    s[i + 1] = pair - s[i]
    setSizes(node.id, s)
  }
  return (
    <div ref={box} className={`wsx-split ${node.dir === 'row' ? 'h' : 'v'}`}>
      {node.kids.map((k, i) => (
        <div key={k.id} className="wsx-cell" style={{ flex: `${node.sizes[i]} 1 0` }}>
          <NodeView node={k} />
          {i < node.kids.length - 1 && <Gutter dir={node.dir} onStart={() => (base.current = [...node.sizes])} onDrag={(d) => resize(i, d)} />}
        </div>
      ))}
    </div>
  )
}

function NodeView({ node }: { node: WNode }): ReactNode {
  return node.t === 'pane' ? <PaneView node={node} /> : <SplitView node={node} />
}

function PanePicker({ onPick, taken }: { onPick: (k: PaneKind) => void; taken: boolean }): ReactNode {
  return (
    <div className="wsp-pick">
      <b>¿Qué quieres ver aquí?</b>
      <div className="wsp-grid">
        {PICKABLE.map((k) => (
          <button key={k} className="wsp-opt" disabled={k === 'whatsapp' && taken} onClick={() => onPick(k)}>
            <G n={KIND_ICON[k]} size={20} />
            <span>{KIND_LABEL[k]}</span>
            <small>{KIND_HINT[k]}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

function PaneView({ node }: { node: Extract<WNode, { t: 'pane' }> }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const ws = useWorkspace()
  const auto = useAutoTask()
  const { c, id } = node
  const needs = NEEDS_TASK.includes(c.kind)
  const taskId = needs ? (c.taskId && findTask(db, c.taskId) ? c.taskId : auto) : ''
  const task = findTask(db, taskId)
  const count = panesOf(ws.root).length
  const wspOwner = panesOf(ws.root).find((p) => p.c.kind === 'whatsapp')?.id
  const convs = c.kind === 'chat' && taskId ? openConvs(db, taskId) : []
  const conv = convs.find((x) => x.id === c.convId)?.id ?? convs[convs.length - 1]?.id ?? ''
  const hiddenConvs = c.kind === 'chat' && taskId ? closedConvs(db, taskId).length : 0

  const tasks = db.tasks.filter((t) => isWorkTask(t) && (t.status !== 'done' || t.id === c.taskId)).sort((a, b) => Number(b.status === 'doing') - Number(a.status === 'doing'))

  const newConv = async (): Promise<void> => {
    const nid = await ui.run('chat:new', taskId)
    if (nid) setPane(id, { convId: nid })
  }

  let body: ReactNode
  if (c.kind === 'empty') body = <PanePicker taken={!!wspOwner} onPick={(k) => setPane(id, { kind: k })} />
  else if (needs && !task) body = <div className="wsp-note">Crea o elige una tarea para usar este panel.</div>
  else if (task && (c.kind === 'terminal' || c.kind === 'git' || c.kind === 'files') && !workFolder(task, db.groups)) body = <div className="wsp-note">Esta tarea no tiene carpeta asignada. Asígnale una carpeta para usar este panel.</div>
  else if (c.kind === 'chat') {
    body = conv ? (
      <ChatView key={conv} convId={conv} embedded />
    ) : (
      <div className="wsp-note">
        Esta tarea aún no tiene conversaciones.
        <button className="btn primary" onClick={() => void newConv()}>
          Nueva conversación
        </button>
      </div>
    )
  } else if (c.kind === 'git') body = <GitView key={taskId} taskId={taskId} />
  else if (c.kind === 'files') body = <FilesView key={taskId} taskId={taskId} request={null} />
  else if (c.kind === 'terminal') body = <TerminalDock key={taskId} taskId={taskId} request={null} embedded />
  else if (c.kind === 'panel') body = <Panel compact />
  else if (c.kind === 'tasks') body = <Today />
  else if (c.kind === 'board') body = <Board />
  else if (c.kind === 'notes') body = <NotesView />
  else if (c.kind === 'music') body = <MusicView />
  else if (c.kind === 'whatsapp') body = wspOwner === id ? <WhatsAppView /> : <div className="wsp-note">WhatsApp ya está abierto en otro panel: solo puede mostrarse en uno a la vez.</div>
  else if (c.kind === 'web') body = <WebPane key={id} paneId={`p-${id}`} url={c.url} onUrl={(u) => setPane(id, { url: u })} />
  else body = <Hours />

  return (
    <section className={`wsp ${ws.focus === id ? 'focus' : ''}`} onPointerDownCapture={() => setFocus(id)} aria-label={`Panel ${KIND_LABEL[c.kind]}`}>
      <header className="wsp-h">
        <span className="wsp-ic" aria-hidden>
          <G n={KIND_ICON[c.kind]} size={15} />
        </span>
        <Select className="wsp-sel" ariaLabel="Qué muestra este panel" value={c.kind} onChange={(v) => setPane(id, { kind: v as PaneKind })} options={[...(c.kind === 'empty' ? [{ value: 'empty', label: 'Elegir…' }] : []), ...PICKABLE.map((k) => ({ value: k, label: KIND_LABEL[k], disabled: k === 'whatsapp' && !!wspOwner && wspOwner !== id }))]} />
        {needs && (
          <Select
            className="wsp-sel task"
            ariaLabel="Tarea de este panel"
            value={c.taskId && findTask(db, c.taskId) ? c.taskId : ''}
            onChange={(v) => setPane(id, { taskId: v || undefined, convId: undefined })}
            searchable
            menuMinWidth={260}
            options={[{ value: '', label: `Activa${findTask(db, auto) ? ' · ' + findTask(db, auto)!.title : ''}` }, ...tasks.map((t) => ({ value: t.id, label: t.title }))]}
          />
        )}
        {c.kind === 'chat' && conv && (
          <Select className="wsp-sel conv" ariaLabel="Conversación" value={conv} onChange={(v) => setPane(id, { convId: v })} options={convs.map((x) => ({ value: x.id, label: convLabel(x.chat) }))} menuMinWidth={240} />
        )}
        {c.kind === 'chat' && taskId && (
          <button className="mini" title={`Nueva conversación${hiddenConvs ? ` (hay ${hiddenConvs} cerrada${hiddenConvs > 1 ? 's' : ''})` : ''}`} aria-label="Nueva conversación" onClick={() => void newConv()}>
            <G n="plus" size={15} />
          </button>
        )}
        <span className="grow" />
        {needs && task && (
          <button className="mini wsp-detail" title="Ver el detalle de la tarea" aria-label="Ver el detalle de la tarea" onClick={() => ui.viewTask(task.id)}>
            <G n="info" size={15} />
            <span>Ver tarea</span>
          </button>
        )}
        <button className="mini" title="Dividir a la derecha" aria-label="Dividir a la derecha" disabled={count >= MAX_PANES} onClick={() => splitPane(id, 'row')}>
          <G n="splitright" size={15} />
        </button>
        <button className="mini" title="Dividir hacia abajo" aria-label="Dividir hacia abajo" disabled={count >= MAX_PANES} onClick={() => splitPane(id, 'col')}>
          <G n="splitdown" size={15} />
        </button>
        <button className="mini" title="Cerrar este panel" aria-label="Cerrar este panel" onClick={() => closePane(id)}>
          <G n="x" size={15} />
        </button>
      </header>
      <div className={`wsp-b k-${c.kind}`}>{body}</div>
    </section>
  )
}

/** Espacio de trabajo: paneles que se dividen y redimensionan para ver varias cosas a la vez, con pantalla completa. */
export function Workspace(): ReactNode {
  const ws = useWorkspace()
  const full = useFullscreen()
  const focusMode = useFocusMode()
  const cur = layoutIdOf(ws.root)
  const n = panesOf(ws.root).length
  const webIds = panesOf(ws.root).filter((p) => p.c.kind === 'web').map((p) => p.id).join(',')

  // las páginas de paneles Web que ya no existen (cerrados o cambiados de tipo) se liberan
  useEffect(() => {
    dropSlots('p-', webIds ? webIds.split(',').map((x) => `p-${x}`) : [])
  }, [webIds])

  return (
    <div className="wsx">
      <div className="wsx-bar">
        <div className="lay" role="group" aria-label="Distribución de los paneles">
          {LAYOUTS.map((l) => (
            <button key={l.id} className={cur === l.id ? 'on' : ''} title={l.label} aria-label={l.label} aria-pressed={cur === l.id} onClick={() => applyLayout(l.id)}>
              <LayoutGlyph id={l.id} />
            </button>
          ))}
        </div>
        <span className="meta wsx-hint">
          {n} {n === 1 ? 'panel' : 'paneles'} · divide cada panel con los botones de su cabecera y arrastra las líneas para ajustar
        </span>
        <span className="grow" />
        <button className={`btn sm ${focusMode ? 'on' : ''}`} title="Ocultar el menú y las pestañas para ganar espacio (Ctrl+Mayús+F)" aria-pressed={focusMode} onClick={() => setFocusMode(!getFocus())}>
          <G n="panel" size={14} /> Modo foco
        </button>
        <button className="btn sm" title="Volver a la distribución inicial" onClick={resetWorkspace}>
          <G n="reset" size={14} /> Restablecer
        </button>
        <button className="btn sm p" title="Pantalla completa (F11)" aria-pressed={full} onClick={() => void toggleFullscreen()}>
          <G n={full ? 'shrink' : 'expand'} size={14} /> {full ? 'Salir de pantalla completa' : 'Pantalla completa'}
        </button>
      </div>
      <div className="wsx-root">
        <NodeView node={ws.root} />
      </div>
    </div>
  )
}
