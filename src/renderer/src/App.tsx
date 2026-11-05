import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { IpcChannels, Task } from '../../shared/types'
import { workFolder } from '../../shared/util'
import { AddEntryModal } from './components/AddEntryModal'
import { Board } from './components/Board'
import { ChatView } from './components/Chat'
import { DiffModal } from './components/DiffModal'
import { Groups } from './components/Groups'
import { History } from './components/History'
import { RedmineView } from './components/RedmineView'
import { Hours } from './components/Hours'
import { NewTabModal } from './components/NewTabModal'
import { SettingsView } from './components/SettingsView'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { ConvTabs, TaskTabs, type TaskMode } from './components/TabBar'
import { DesignView } from './components/DesignView'
import { GitView } from './components/GitView'
import { CommandPalette } from './components/CommandPalette'
import { TerminalDock, type TermRequest } from './components/TerminalDock'
import { Confetti } from './components/Confetti'
import { ConfirmDialog } from './components/ConfirmDialog'
import type { ConfirmRequest } from './components/ConfirmDialog'
import { HelpModal } from './components/HelpModal'
import { TaskModal } from './components/TaskModal'
import { TimerBar } from './components/TimerBar'
import { Today } from './components/Today'
import { Usage } from './components/Usage'
import { openConvs } from './conversations'
import { call, findTask, useDB } from './store'
import { UiContext, type Ui, type View } from './ui'

type Modal =
  | { kind: 'task'; task: Partial<Task> }
  | { kind: 'diff'; file: string; convId: string }
  | { kind: 'entry'; day: string }
  | { kind: 'newtab' }
  | { kind: 'palette' }
  | { kind: 'help' }
  | null

const TABS_KEY = 'shutoki.tabs'

interface Saved {
  tasks: string[] // pestañas de tarea abiertas
  sel: Record<string, string> // conversación visible por tarea
}

function loadSaved(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(TABS_KEY) ?? 'null') as Partial<Saved> | string[] | null
    if (Array.isArray(v)) return { tasks: [], sel: {} } // formato anterior (una pestaña por tarea): se descarta
    return { tasks: Array.isArray(v?.tasks) ? v.tasks.filter((x) => typeof x === 'string') : [], sel: v?.sel && typeof v.sel === 'object' ? v.sel : {} }
  } catch {
    return { tasks: [], sel: {} }
  }
}

export function App(): ReactNode {
  const db = useDB()
  const saved = useRef(loadSaved()).current
  const [view, setView] = useState<View>('today')
  const [panel, setPanel] = useState<View>('today') // última vista del panel (para volver desde una tarea)
  const [taskTabs, setTaskTabs] = useState<string[]>(saved.tasks)
  const [sel, setSel] = useState<Record<string, string>>(saved.sel)
  const [activeTask, setActiveTask] = useState<string | null>(null)
  const [seen, setSeen] = useState<Record<string, number>>({}) // mensajes vistos por conversación
  const [modes, setModes] = useState<Record<string, TaskMode>>({}) // Chat o Diseño por tarea
  const [modal, setModal] = useState<Modal>(null)
  const [toastState, setToastState] = useState<{ msg: string; err: boolean; action?: { label: string; run: () => void } } | null>(null)
  const [confetti, setConfetti] = useState(0)
  const [quickTick, setQuickTick] = useState(0)
  const [dockOpen, setDockOpen] = useState(() => localStorage.getItem('shutoki.dock') === '1') // panel de terminal integrada
  const [dockH, setDockH] = useState(() => Number(localStorage.getItem('shutoki.dockH')) || 280)
  const [termReq, setTermReq] = useState<TermRequest | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [confirmReq, setConfirmReq] = useState<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null)

  const confirm = useCallback(
    (message: string, opts?: { title?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> =>
      new Promise((resolve) => setConfirmReq({ message, ...opts, resolve })),
    []
  )
  const answerConfirm = useCallback((ok: boolean): void => {
    setConfirmReq((r) => {
      r?.resolve(ok)
      return null
    })
  }, [])

  const toast = useCallback((msg: string, err = false, action?: { label: string; run: () => void }): void => {
    setToastState({ msg, err, action })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastState(null), action ? 9000 : err ? 6000 : 2500)
  }, [])

  const run = useCallback(
    async <K extends keyof IpcChannels>(name: K, ...args: IpcChannels[K]['args']): Promise<IpcChannels[K]['ret'] | undefined> => {
      try {
        return await call(name, ...args)
      } catch (e) {
        toast((e as Error).message, true)
        return undefined
      }
    },
    [toast]
  )

  // ---------- pestañas ----------
  const tabs = taskTabs.filter((id) => findTask(db, id)) // solo tareas que siguen existiendo
  const active = view === 'chat' ? activeTask : null
  const convs = active ? openConvs(db, active) : []
  const activeConv = active ? (convs.find((c) => c.id === sel[active])?.id ?? convs[convs.length - 1]?.id ?? null) : null

  const mode: TaskMode = (active && modes[active]) || 'chat'

  const showConv = (taskId: string, convId: string): void => {
    setTaskTabs((t) => (t.includes(taskId) ? t : [...t, taskId]))
    setSel((s) => ({ ...s, [taskId]: convId }))
    setModes((m) => ({ ...m, [taskId]: 'chat' }))
    setActiveTask(taskId)
    setView('chat')
  }

  const showDesign = (taskId: string): void => {
    setTaskTabs((t) => (t.includes(taskId) ? t : [...t, taskId]))
    setModes((m) => ({ ...m, [taskId]: 'design' }))
    setActiveTask(taskId)
    setView('chat')
  }

  /** Abre la tarea: la conversación indicada, la última que tenía o una nueva. */
  const openChat = async (taskId: string, convId?: string): Promise<void> => {
    const existing = convId ?? openConvs(db, taskId).find((c) => c.id === sel[taskId])?.id ?? openConvs(db, taskId).pop()?.id
    const id = existing ?? (await run('chat:new', taskId))
    if (id) showConv(taskId, id)
  }

  const newConversation = async (taskId: string): Promise<void> => {
    const id = await run('chat:new', taskId)
    if (id) showConv(taskId, id)
  }

  const closeTaskTab = (taskId: string): void => {
    const rest = tabs.filter((x) => x !== taskId)
    setTaskTabs(rest)
    if (active !== taskId) return
    if (rest.length) setActiveTask(rest[Math.min(tabs.indexOf(taskId), rest.length - 1)])
    else {
      setActiveTask(null)
      setView(panel)
    }
  }

  const closeConv = async (convId: string): Promise<void> => {
    if (!active) return
    const rest = convs.filter((c) => c.id !== convId)
    await run('chat:close', convId)
    if (!rest.length) return closeTaskTab(active) // sin conversaciones abiertas, la tarea se cierra
    if (activeConv === convId) setSel((s) => ({ ...s, [active]: rest[rest.length - 1].id }))
  }

  const ui: Ui = {
    view,
    panel,
    activeTask: active,
    activeConv,
    quickTick,
    go: (v) => {
      if (v === 'chat') return
      setView(v)
      setPanel(v)
    },
    openChat: (taskId, convId) => void openChat(taskId, convId),
    newConversation: (taskId) => void newConversation(taskId),
    openNewTab: () => setModal({ kind: 'newtab' }),
    openTask: (t) => {
      if (!workFolder(t, db.groups)) {
        setModal({ kind: 'task', task: t })
        toast('Asigna una carpeta de proyecto, o un grupo de carpetas con permiso de escritura, para abrir Claude', true)
        return
      }
      if (db.settings.openMode === 'chat' || !db.settings.openMode) {
        void openChat(t.id)
        return
      }
      void run('claude:open', t.id)
      toast('Abriendo Claude en ' + workFolder(t, db.groups))
    },
    editTask: (t) => setModal({ kind: 'task', task: t }),
    showDiff: (file) => activeConv && setModal({ kind: 'diff', file, convId: activeConv }),
    addEntry: (day) => {
      if (!db.tasks.length) return toast('Crea una tarea primero', true)
      setModal({ kind: 'entry', day })
    },
    closeModal: () => setModal(null),
    toast,
    confirm,
    openTerminal: (taskId, sessionId) => {
      if (db.settings.terminalMode === 'external') {
        void run('terminal:open', taskId, sessionId)
        return
      }
      // terminal integrada: se muestra la tarea y su panel; el panel crea el shell (retomando la sesión si se pidió)
      void openChat(taskId).then(() => {
        setDockOpen(true)
        setTermReq((r) => ({ taskId, sessionId, nonce: (r?.nonce ?? 0) + 1 }))
      })
    },
    celebrate: () => setConfetti((n) => n + 1),
    openHelp: () => setModal({ kind: 'help' }),
    run
  }

  // atajo global (Ctrl+Alt+N) y avisos del proceso principal
  const gotoConvRef = useRef<(convId: string) => void>(() => {})
  gotoConvRef.current = (convId) => {
    const c = db.chats[convId]
    if (!c) return
    if (c.kind === 'design') return showDesign(c.taskId)
    if (c.closed) void run('chat:reopen', convId)
    showConv(c.taskId, convId)
  }
  useEffect(() => {
    const offQuick = window.api.onQuickAdd(() => {
      setView('today')
      setPanel('today')
      setQuickTick((n) => n + 1)
    })
    // 'chat:<id de conversación>' abre esa conversación (aviso de que Claude terminó); el resto son vistas del panel
    const offGoto = window.api.onGoto((v) => {
      if (v.startsWith('chat:')) return gotoConvRef.current(v.slice(5))
      if (v === 'daily') {
        // el aviso matutino abre Horas en la pestaña Daily
        try {
          localStorage.setItem('shutoki.hoursMode', 'daily')
        } catch {
          /* sin storage */
        }
        window.dispatchEvent(new Event('shutoki:daily'))
        setView('hours')
        setPanel('hours')
        return
      }
      setView(v as View)
      setPanel(v as View)
    })
    return () => {
      offQuick()
      offGoto()
    }
  }, [])

  // el atajo global de teclado necesita ver siempre la tarea activa y el aviso actuales
  const activeRef = useRef<string | null>(null)
  activeRef.current = active
  const toastRef = useRef(toast)
  toastRef.current = toast
  useEffect(() => {
    try {
      localStorage.setItem('shutoki.dock', dockOpen ? '1' : '0')
      localStorage.setItem('shutoki.dockH', String(Math.round(dockH)))
    } catch {
      /* sin storage */
    }
  }, [dockOpen, dockH])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setModal(null)
      // Ctrl+K: búsqueda global · Ctrl+/ : ayuda de atajos
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setModal((m) => (m?.kind === 'palette' ? null : { kind: 'palette' }))
      } else if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setModal({ kind: 'help' })
      } else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        // Ctrl+` : mostrar u ocultar la terminal de la tarea activa (como en VS Code)
        e.preventDefault()
        if (activeRef.current) setDockOpen((o) => !o)
        else toastRef.current('Abre una tarea para usar su terminal', true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // las pestañas sobreviven a un reinicio
  const savedKey = JSON.stringify({ tasks: tabs, sel })
  useEffect(() => {
    try {
      localStorage.setItem(TABS_KEY, savedKey)
    } catch {
      /* sin storage */
    }
  }, [savedKey])

  // indicador de mensajes nuevos que todavía no viste, por conversación
  const convIds = tabs.flatMap((t) => openConvs(db, t).map((c) => c.id))
  useEffect(() => {
    setSeen((s) => {
      let next = s
      for (const id of convIds) {
        const n = db.chats[id]?.messages.length ?? 0
        if ((id === activeConv || s[id] === undefined) && s[id] !== n) next = { ...next, [id]: n }
      }
      return next
    })
  }, [db, activeConv, convIds.join('|')])
  const unreadConvs = new Set(convIds.filter((id) => id !== activeConv && (db.chats[id]?.messages.length ?? 0) > (seen[id] ?? Infinity)))
  const unreadTasks = new Set(tabs.filter((t) => openConvs(db, t).some((c) => unreadConvs.has(c.id))))

  let content: ReactNode
  switch (view) {
    case 'board':
      content = <Board />
      break
    case 'hours':
      content = <Hours />
      break
    case 'usage':
      content = <Usage />
      break
    case 'history':
      content = <History />
      break
    case 'redmine':
      content = <RedmineView />
      break
    case 'groups':
      content = <Groups />
      break
    case 'settings':
      content = <SettingsView />
      break
    case 'chat':
      content =
        active && mode === 'design' ? <DesignView key={active} taskId={active} /> : active && mode === 'git' ? <GitView key={active} taskId={active} /> : activeConv ? <ChatView key={activeConv} convId={activeConv} /> : <Today />
      break
    default:
      content = <Today />
  }

  return (
    <UiContext.Provider value={ui}>
      <Sidebar />
      <main>
        <div className="topstack">
          {tabs.length > 0 && (
            <TaskTabs
              tasks={tabs}
              active={active}
              panel={panel}
              unread={unreadTasks}
              onPanel={() => setView(panel)}
              onSelect={(id) => void openChat(id)}
              onClose={closeTaskTab}
              onNew={ui.openNewTab}
            />
          )}
          {active && (
            <ConvTabs
              taskId={active}
              active={activeConv}
              mode={mode}
              onMode={(m) => setModes((s) => ({ ...s, [active]: m }))}
              unread={unreadConvs}
              onSelect={(id) => showConv(active, id)}
              onClose={(id) => void closeConv(id)}
              onNew={ui.openNewTab}
            />
          )}
          <TimerBar />
        </div>
        <div className="scroll">
          <section id="view">{content}</section>
        </div>
        {active && dockOpen && db.settings.terminalMode !== 'external' && (
          <TerminalDock taskId={active} request={termReq} height={dockH} onHeight={setDockH} onClose={() => setDockOpen(false)} />
        )}
        {active && <StatusBar taskId={active} onOpenGit={() => setModes((s) => ({ ...s, [active]: 'git' }))} />}
      </main>
      {modal && (
        <div className="modal">
          {modal.kind === 'task' && <TaskModal key={modal.task.id ?? 'new'} task={modal.task} />}
          {modal.kind === 'diff' && <DiffModal file={modal.file} convId={modal.convId} />}
          {modal.kind === 'entry' && <AddEntryModal day={modal.day} />}
          {modal.kind === 'newtab' && <NewTabModal onClose={() => setModal(null)} />}
          {modal.kind === 'palette' && <CommandPalette onClose={() => setModal(null)} />}
          {modal.kind === 'help' && <HelpModal />}
        </div>
      )}
      {confirmReq && <ConfirmDialog req={confirmReq} onAnswer={answerConfirm} />}
      {toastState && (
        <div className={`toast ${toastState.err ? 'err' : ''}`} role="status">
          <span className="toast-ico" aria-hidden>
            {toastState.err ? '!' : '✓'}
          </span>
          <span className="toast-msg">{toastState.msg}</span>
          {toastState.action && (
            <button
              className="toast-action"
              onClick={() => {
                toastState.action?.run()
                setToastState(null)
              }}
            >
              {toastState.action.label}
            </button>
          )}
        </div>
      )}
      {confetti > 0 && <Confetti key={confetti} onDone={() => setConfetti(0)} />}
    </UiContext.Provider>
  )
}
