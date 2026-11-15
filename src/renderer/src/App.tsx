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
import { TopNav } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { ConvTabs, TaskTabs, type TaskMode } from './components/TabBar'
import { G } from './components/glyphs'
import { TaskHead } from './components/TaskHead'
import { DesignView } from './components/DesignView'
import { GitView } from './components/GitView'
import { FilesView, type FileRequest } from './components/FilesView'
import { CommandPalette } from './components/CommandPalette'
import { Assistant } from './components/Assistant'
import { TerminalDock, type TermRequest } from './components/TerminalDock'
import { Confetti } from './components/Confetti'
import { confettiEnabled, getFocus, getName, setFocusMode, useFocusMode } from './theme'
import { getLayout, setLayout, useLayout } from './layout'
import { ConfirmDialog } from './components/ConfirmDialog'
import { TaskInfoModal } from './components/TaskInfoModal'
import type { ConfirmRequest } from './components/ConfirmDialog'
import { HelpModal } from './components/HelpModal'
import { TaskModal } from './components/TaskModal'
import { MusicView } from './components/MusicView'
import { WhatsAppView } from './components/WhatsAppView'
import { NotesView } from './components/NotesView'
import { MeetingsView } from './components/MeetingsView'
import { WebView } from './components/WebView'
import { addTab } from './webTabs'
import { WebHost } from './components/webHost'
import { PANEL_LABEL } from './components/TabBar'
import { Panel } from './components/Panel'
import { ConvPane } from './components/ConvPane'
import { Workspace } from './components/Workspace'
import { toggleFullscreen, useFullscreen } from './fullscreen'
import { Usage } from './components/Usage'
import { Dashboard } from './components/Dashboard'
import { openConvs } from './conversations'
import { activeEntry, call, findTask, peek, useDB } from './store'
import { UiContext, type Ui, type View } from './ui'

type Modal =
  | { kind: 'task'; task: Partial<Task> }
  | { kind: 'taskinfo'; taskId: string }
  | { kind: 'diff'; file: string; convId: string }
  | { kind: 'entry'; day: string }
  | { kind: 'newtab' }
  | { kind: 'palette' }
  | { kind: 'assistant' }
  | { kind: 'help' }
  | null

const TABS_KEY = 'shutoki.tabs'

// ventana suelta: ?pop=<tarea>&conv=<conversación> (una tarea sacada de la ventana principal)
const POP = new URLSearchParams(location.search)
const popTask = POP.get('pop')
const popConv = POP.get('conv')

interface Saved {
  tasks: string[] // pestañas de tarea abiertas
  sel: Record<string, string> // conversación visible por tarea
}

function loadSaved(): Saved {
  if (popTask) return { tasks: [popTask], sel: popConv ? { [popTask]: popConv } : {} }
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
  const focus = useFocusMode()
  const saved = useRef(loadSaved()).current
  const [view, setView] = useState<View>(popTask ? 'chat' : 'today')
  const [panel, setPanel] = useState<View>('today') // última vista del panel (para volver desde una tarea)
  const [taskTabs, setTaskTabs] = useState<string[]>(saved.tasks)
  const [sel, setSel] = useState<Record<string, string>>(saved.sel)
  const [activeTask, setActiveTask] = useState<string | null>(popTask)
  const [seen, setSeen] = useState<Record<string, number>>({}) // mensajes vistos por conversación
  const [modes, setModes] = useState<Record<string, TaskMode>>({}) // Chat o Diseño por tarea
  const [modal, setModal] = useState<Modal>(null)
  const [fileReq, setFileReq] = useState<FileRequest | null>(null)
  const [toastState, setToastState] = useState<{ msg: string; err: boolean; action?: { label: string; run: () => void } } | null>(null)
  const [confetti, setConfetti] = useState(0)
  const [quickTick, setQuickTick] = useState(0)
  const fullscreen = useFullscreen()
  const lay = useLayout() // terminal integrada y anchos de paneles (se guardan como disposición)
  const dockOpen = lay.dockOpen
  const dockH = lay.dockH
  const setDockOpen = (v: boolean | ((o: boolean) => boolean)): void => setLayout({ dockOpen: typeof v === 'function' ? v(getLayout().dockOpen) : v })
  const setDockH = (h: number): void => setLayout({ dockH: h })
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
    if (popTask) return window.close() // en una ventana suelta, cerrar la tarea cierra la ventana
    if (rest.length) setActiveTask(rest[Math.min(tabs.indexOf(taskId), rest.length - 1)])
    else {
      setActiveTask(null)
      setView(panel)
    }
  }

  const moveTab = (from: string, to: string): void =>
    setTaskTabs((t) => {
      const a = t.indexOf(from)
      const b = t.indexOf(to)
      if (a < 0 || b < 0) return t
      const next = t.filter((x) => x !== from)
      next.splice(b, 0, from)
      return next
    })

  /** Saca la tarea a su propia ventana y la quita de las pestañas de esta. */
  const popOut = async (taskId: string, atCursor = false): Promise<void> => {
    try {
      await call('window:popout', taskId, sel[taskId] ?? openConvs(db, taskId).pop()?.id, atCursor)
    } catch (e) {
      return toast((e as Error).message, true)
    }
    closeTaskTab(taskId)
  }

  const closeConv = async (convId: string): Promise<void> => {
    if (!active) return
    const rest = convs.filter((c) => c.id !== convId)
    await run('chat:close', convId)
    if (!rest.length) return closeTaskTab(active) // sin conversaciones abiertas, la tarea se cierra
    if (activeConv === convId) setSel((s) => ({ ...s, [active]: rest[rest.length - 1].id }))
  }

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
  const liveChats = Object.values(db.chats).filter((c) => !c.closed && findTask(db, c.taskId))
  const chatAlerts = { waiting: liveChats.filter((c) => c.pending?.length).length, unread: unreadConvs.size, running: liveChats.filter((c) => c.running).length }
  const unreadTasks = new Set(tabs.filter((t) => openConvs(db, t).some((c) => unreadConvs.has(c.id))))

  /** «Chats» del menú: vuelve a la última conversación en la que estabas (o a la más reciente de todas). */
  const goChats = (): void => {
    if (activeTask && findTask(db, activeTask)) {
      if (!openConvs(db, activeTask).length) return void openChat(activeTask)
      setTaskTabs((t) => (t.includes(activeTask) ? t : [...t, activeTask]))
      setView('chat')
      return
    }
    const last = (c: (typeof db.chats)[string]): number => c.messages[c.messages.length - 1]?.ts || c.createdAt
    const recent = Object.entries(db.chats)
      .filter(([, c]) => !c.closed && findTask(db, c.taskId))
      .sort((a, b) => last(b[1]) - last(a[1]))[0]
    if (recent) return void openChat(recent[1].taskId, recent[0])
    // sin conversaciones abiertas, «Chats» lleva al Historial (donde se reabren las cerradas)
    setView('history')
    setPanel('history')
  }

  // ---------- historial de navegación («Volver») ----------
  // Cada cambio de vista, tarea, modo o conversación guarda el lugar anterior; así cualquier pantalla abierta desde otra permite regresar.
  const here = { view, task: active, mode, conv: activeConv }
  const hereKey = `${here.view}|${here.task}|${here.mode}|${here.conv}`
  const navHist = useRef<(typeof here)[]>([])
  const lastHere = useRef(here)
  const restoring = useRef(false)
  const [canBack, setCanBack] = useState(false)
  useEffect(() => {
    const prev = lastHere.current
    lastHere.current = here
    if (restoring.current) {
      restoring.current = false
      return
    }
    const pk = `${prev.view}|${prev.task}|${prev.mode}|${prev.conv}`
    if (pk === hereKey) return
    navHist.current = [...navHist.current.slice(-49), prev]
    setCanBack(true)
  }, [hereKey])

  const goBack = (): void => {
    if (modal) return setModal(null) // un diálogo abierto se cierra primero
    while (navHist.current.length) {
      const p = navHist.current.pop()!
      const k = `${p.view}|${p.task}|${p.mode}|${p.conv}`
      if (p.view === 'chat' && p.task && !findTask(db, p.task)) continue // la tarea ya no existe
      if (k === hereKey) continue
      restoring.current = true
      setView(p.view)
      if (p.view !== 'chat') setPanel(p.view)
      if (p.view === 'chat' && p.task) {
        const t = p.task
        setTaskTabs((x) => (x.includes(t) ? x : [...x, t]))
        setActiveTask(t)
        setModes((m) => ({ ...m, [t]: p.mode }))
        if (p.conv && db.chats[p.conv] && !db.chats[p.conv].closed) setSel((s) => ({ ...s, [t]: p.conv! }))
      }
      break
    }
    setCanBack(navHist.current.length > 0)
  }
  const goBackRef = useRef(goBack)
  goBackRef.current = goBack
  useEffect(() => {
    // Alt+← y el botón «atrás» del ratón
    const key = (e: KeyboardEvent): void => {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        goBackRef.current()
      }
    }
    const mouse = (e: MouseEvent): void => {
      if (e.button === 3) {
        e.preventDefault()
        goBackRef.current()
      }
    }
    document.addEventListener('keydown', key)
    document.addEventListener('mouseup', mouse)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('mouseup', mouse)
    }
  }, [])

  const ui: Ui = {
    view,
    panel,
    activeTask: active,
    activeConv,
    quickTick,
    chatAlerts,
    activeMode: mode,
    openMode: (taskId, m) => {
      if (m === 'chat') return void openChat(taskId)
      setTaskTabs((t) => (t.includes(taskId) ? t : [...t, taskId]))
      setModes((s) => ({ ...s, [taskId]: m }))
      setActiveTask(taskId)
      setView('chat')
    },
    go: (v) => {
      if (v === 'chat') return goChats()
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
    viewTask: (taskId) => setModal({ kind: 'taskinfo', taskId }),
    openFile: (path) => {
      if (!active) return
      setModes((m) => ({ ...m, [active]: 'files' }))
      setFileReq((r) => ({ taskId: active, path, nonce: (r?.nonce ?? 0) + 1 }))
    },
    showDiff: (file) => activeConv && setModal({ kind: 'diff', file, convId: activeConv }),
    addEntry: (day) => {
      if (!db.tasks.length) return toast('Crea una tarea primero', true)
      setModal({ kind: 'entry', day })
    },
    closeModal: () => setModal(null),
    goto: (target) => gotoRef.current(target),
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
    openGit: (taskId) => {
      setTaskTabs((t) => (t.includes(taskId) ? t : [...t, taskId]))
      setModes((m) => ({ ...m, [taskId]: 'git' }))
      setActiveTask(taskId)
      setView('chat')
    },
    celebrate: () => confettiEnabled() && setConfetti((n) => n + 1),
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
  // destino de un aviso: 'chat:<id de conversación>' abre esa conversación; el resto son vistas del panel
  const gotoRef = useRef<(v: string) => void>(() => {})
  gotoRef.current = (v) => {
    if (v.startsWith('chat:')) return gotoConvRef.current(v.slice(5))
    if (v.startsWith('web:')) {
      // el asistente pide abrir una dirección: pestaña nueva en la vista Web
      addTab(v.slice(4))
      setView('web')
      setPanel('web')
      return
    }
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
  }
  useEffect(() => {
    const offQuick = window.api.onQuickAdd(() => {
      setView('today')
      setPanel('today')
      setQuickTick((n) => n + 1)
    })
    // 'chat:<id de conversación>' abre esa conversación (aviso de que Claude terminó); el resto son vistas del panel
    const offGoto = window.api.onGoto((v) => gotoRef.current(v))
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
  const tabsRef = useRef<string[]>([])
  tabsRef.current = tabs
  const openChatRef = useRef<(taskId: string) => void>(() => {})
  openChatRef.current = (id) => void openChat(id)
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
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setModal((m) => (m?.kind === 'assistant' ? null : { kind: 'assistant' }))
      } else if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setModal({ kind: 'help' })
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        // Ctrl+Mayús+F : modo foco (sin menú, pestañas ni barra de estado)
        e.preventDefault()
        setFocusMode(!getFocus())
      } else if (e.key === 'F11') {
        e.preventDefault()
        void toggleFullscreen()
      } else if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 't') {
        // Ctrl+Alt+T : iniciar / pausar / reanudar el timer (de la tarea abierta si no hay ninguno en marcha)
        e.preventDefault()
        const d = peek()
        const fail = (err: Error): void => toastRef.current(err.message, true)
        if (d && activeEntry(d)) void call('timer:pause').catch(fail)
        else if (d?.paused) void call('timer:resume').catch(fail)
        else if (activeRef.current) void call('timer:start', activeRef.current).catch(fail)
        else toastRef.current('Abre una tarea para iniciar su timer', true)
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'PageDown' || e.key === 'PageUp')) {
        // Ctrl+AvPág / Ctrl+RePág : pestaña de tarea siguiente / anterior
        const list = tabsRef.current
        if (!list.length) return
        e.preventDefault()
        const i = activeRef.current ? list.indexOf(activeRef.current) : -1
        const step = e.key === 'PageDown' ? 1 : -1
        openChatRef.current(list[(i + step + list.length) % list.length])
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
    if (popTask) return // las pestañas guardadas son las de la ventana principal
    try {
      localStorage.setItem(TABS_KEY, savedKey)
    } catch {
      /* sin storage */
    }
  }, [savedKey])


  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'
  const myName = getName().trim().split(/\s+/)[0]
  const openTasks = db.tasks.filter((t) => !t.archived && (!t.recurrence || t.recurrence.type === 'none') && (t.status === 'today' || t.status === 'doing')).length
  const activeTaskObj = findTask(db, active)
  const SUBS: Record<string, string> = {
    board: 'Arrastra las tarjetas entre columnas',
    workspace: 'Divide la pantalla en paneles según lo que necesites ver',
    hours: 'Revisa el día, corrige y exporta para imputar',
    history: 'Todas tus conversaciones, abiertas y cerradas',
    redmine: 'Horas imputadas y pendientes',
    usage: 'Consumo de la IA y límites de tu plan',
    dashboard: 'Horas, tareas, foco y consumo de un vistazo',
    whatsapp: 'WhatsApp Web dentro de la app',
    web: 'Pestañas integradas para webs de trabajo',
    notes: 'Se guardan como archivos Markdown en tu equipo',
    meetings: 'Graba la voz, transcribe en tu equipo y obtén el resumen',
    music: 'Spotify: reproduce, pausa y cambia de pista sin salir de la app',
    groups: 'Conjuntos de carpetas a los que la IA puede acceder',
    settings: 'Preferencias de la aplicación'
  }
  const heading =
    view === 'chat' && activeTaskObj
      ? { title: mode === 'design' ? 'Diseño' : mode === 'git' ? 'Git' : mode === 'files' ? 'Archivos' : 'Chat IA', sub: `Tarea: ${activeTaskObj.title}${activeTaskObj.project ? ' · ' + activeTaskObj.project : ''}` }
      : view === 'today'
        ? { title: 'Inicio', sub: `${hello}${myName ? ', ' + myName : ''} · ${new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}` }
        : view === 'chat'
        ? { title: `${hello}${myName ? ', ' + myName : ''}`, sub: `${new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })} · ${openTasks} ${openTasks === 1 ? 'tarea activa' : 'tareas activas'}` }
        : { title: PANEL_LABEL[view] ?? 'Panel', sub: SUBS[view] ?? '' }

  let content: ReactNode
  switch (view) {
    case 'board':
      content = <Board />
      break
    case 'workspace':
      content = <Workspace />
      break
    case 'hours':
      content = <Hours />
      break
    case 'dashboard':
      content = <Dashboard />
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
    case 'music':
      content = <MusicView />
      break
    case 'notes':
      content = <NotesView />
      break
    case 'meetings':
      content = <MeetingsView />
      break
    case 'web':
      content = <WebView />
      break
    case 'whatsapp':
      content = <WhatsAppView />
      break
    case 'groups':
      content = <Groups />
      break
    case 'settings':
      content = <SettingsView />
      break
    case 'chat':
      content =
        active && mode === 'design' ? <DesignView key={active} taskId={active} /> : active && mode === 'files' ? <FilesView key={active} taskId={active} request={fileReq} /> : active && mode === 'git' ? <GitView key={active} taskId={active} /> : activeConv ? (
          <div className={`wb${popTask ? ' solo' : ''}`}>
            {!popTask && active && <ConvPane taskId={active} active={activeConv} unread={unreadConvs} onSelect={(id) => showConv(active, id)} onClose={(id) => void closeConv(id)} onNew={() => void newConversation(active)} onMore={ui.openNewTab} />}
            <ChatView key={activeConv} convId={activeConv} />
          </div>
        ) : (
          <Panel />
        )
      break
    default:
      content = <Panel />
  }

  return (
    <UiContext.Provider value={ui}>
      <main>
        <div className="topstack">
          {!popTask && <TopNav onSearch={() => setModal({ kind: 'palette' })} fullscreen={fullscreen} onFullscreen={() => void toggleFullscreen()} />}
          {!popTask && (
            <header className="topbar">
              <button className="tb-back" title="Volver atrás (Alt+←)" aria-label="Volver atrás" disabled={!canBack && !modal} onClick={goBack}>
                <G n="chevron" size={16} />
              </button>
              <div className="tb-title">
                <h1>{heading.title}</h1>
                <small>{heading.sub}</small>
              </div>
            </header>
          )}
          {(!popTask && view === 'chat' && (tabs.length > 0 || active)) || (popTask && active) ? (
            <div className="subbar">
              {!popTask && tabs.length > 0 && (
                <TaskTabs
                  tasks={tabs}
                  active={active}
                  panel={panel}
                  unread={unreadTasks}
                  onPanel={() => setView(panel)}
                  onSelect={(id) => void openChat(id)}
                  onClose={closeTaskTab}
                  onNew={ui.openNewTab}
                  onMove={moveTab}
                  onPop={(id, atCursor) => void popOut(id, atCursor)}
                />
              )}
              <span className="subbar-sp" />
              {active && (
                <ConvTabs
                  taskId={active}
                  active={activeConv}
                  mode={mode}
                  listMode={!popTask}
                  noModes={!popTask}
                  onMode={(m) => setModes((s) => ({ ...s, [active]: m }))}
                  unread={unreadConvs}
                  onSelect={(id) => showConv(active, id)}
                  onClose={(id) => void closeConv(id)}
                  onNew={ui.openNewTab}
                  docked={!!popTask}
                  onPop={() => {
                    if (!popTask) return void popOut(active)
                    void run('window:dock', active, activeConv ?? undefined)
                  }}
                />
              )}
            </div>
          ) : null}
          {!popTask && active && view === 'chat' && <TaskHead taskId={active} mode={mode} onMode={(m) => setModes((s) => ({ ...s, [active]: m }))} />}
        </div>
        <div className="scroll">
          <section id="view">{content}</section>
          <WebHost />
        </div>
        {!popTask && active && dockOpen && db.settings.terminalMode !== 'external' && (
          <TerminalDock taskId={active} request={termReq} height={dockH} onHeight={setDockH} onClose={() => setDockOpen(false)} />
        )}
        {active && <StatusBar taskId={active} onOpenGit={() => setModes((s) => ({ ...s, [active]: 'git' }))} />}
      </main>
      {modal && (
        <div className="modal">
          {modal.kind === 'taskinfo' && <TaskInfoModal key={modal.taskId} taskId={modal.taskId} />}
          {modal.kind === 'task' && <TaskModal key={modal.task.id ?? 'new'} task={modal.task} />}
          {modal.kind === 'diff' && <DiffModal file={modal.file} convId={modal.convId} />}
          {modal.kind === 'entry' && <AddEntryModal day={modal.day} />}
          {modal.kind === 'newtab' && <NewTabModal onClose={() => setModal(null)} />}
          {modal.kind === 'palette' && <CommandPalette onClose={() => setModal(null)} />}
          {modal.kind === 'assistant' && <Assistant onClose={() => setModal(null)} />}
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
      {focus && (
        <button className="focus-exit" title="Salir del modo foco (Ctrl+Mayús+F)" onClick={() => setFocusMode(false)}>
          ✕ Salir del modo foco
        </button>
      )}
      {confetti > 0 && <Confetti key={confetti} onDone={() => setConfetti(0)} />}
    </UiContext.Provider>
  )
}
