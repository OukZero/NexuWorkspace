// Contrato compartido entre main, preload y renderer.

export type Status = 'next' | 'today' | 'doing' | 'done'
export type Priority = 'high' | 'med' | 'low'
export type RecurrenceType = 'none' | 'daily' | 'weekdays' | 'weekly'

export interface Recurrence {
  type: RecurrenceType
  days?: number[] // 0 = domingo
}

export interface TaskLogItem {
  ts: number
  entryId: string
  text: string
  mode: 'ai' | 'local'
}

export interface Task {
  id: string
  title: string
  description: string
  project: string
  client: string
  folder: string
  priority: Priority
  estimateMin: number
  status: Status
  recurrence: Recurrence
  createdAt: number
  doneAt: number | null
  archived?: boolean
  lastGenerated?: string
  fromTemplate?: string
  carried?: number
  workDone?: string
  log?: TaskLogItem[]
  groupIds?: string[]
  notes?: string
  tags?: string[]
  subtasks?: Subtask[]
  /** Proyecto de Redmine donde se imputan las horas de esta tarea (texto tal como aparece en el selector «Project»). */
  rmProject?: string
  /** Tarea de Redmine («#523277 - Estimaciones», o solo el número). */
  rmIssue?: string
  /** Actividad de Redmine; vacío = la de Ajustes. */
  rmActivity?: string
}

export interface Entry {
  id: string
  taskId: string
  start: number
  end: number | null
  note: string
  /** Momento en que se imputó en Redmine (evita duplicados). */
  rmSent?: number
}

/** Horas de un día agrupadas como se imputan en Redmine: una línea por proyecto + tarea + actividad. */
export interface RedmineLine {
  key: string
  project: string
  issue: string
  activity: string
  hours: number
  comment: string
  entryIds: string[]
}

/** Un día en Redmine: horas imputadas y horas laborables que le corresponden. */
export interface RedmineDay {
  day: string
  spent: number
  max: number
}

export type NotificationKind = 'daily' | 'reminder' | 'done' | 'attention' | 'permission' | 'idle'

export interface AppNotification {
  id: string
  ts: number
  kind: NotificationKind
  title: string
  body: string
  /** A dónde lleva al hacer click: una vista (p. ej. «hours», «daily») o «chat:<conversación>». */
  goto?: string
  read: boolean
}

/** Carpeta que se puede explorar en el visor de archivos de una tarea. */
export interface FileRoot {
  name: string
  path: string
}

export interface FileEntry {
  name: string
  dir: boolean
}

export interface FileContent {
  text: string
  size: number
  binary: boolean
  /** El archivo es más grande que el límite del visor y solo se muestra el principio. */
  truncated: boolean
}

export interface RedmineResult {
  sent: number
  failed: Array<{ key: string; error: string }>
  needLogin?: boolean
  /** Avisos, p. ej. horas recortadas por el tope diario. */
  notes?: string[]
}

export interface Hunk {
  old: string | null
  new: string
}

export type ActivityKind = 'edit' | 'read' | 'run' | 'search' | 'other'

export interface Activity {
  id: string
  ts: number
  tool: string
  status: 'running' | 'ok' | 'error'
  kind: ActivityKind
  label: string
  target: string
  hunks?: Hunk[]
  detail?: string
}

/** Archivo o foto adjunto a un mensaje; vive copiado en la carpeta de datos de la app. */
export interface Attachment {
  name: string
  path: string
  image: boolean
  mime: string
  size: number
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  text: string
  ts: number
  action?: 'login'
  attachments?: Attachment[]
}

/** Consumo de la sesión de Claude de un chat (acumulado desde que se creó o se reinició). */
export interface ChatUsage {
  contextTokens: number // tamaño del contexto en el último turno (entrada + caché)
  contextWindow: number // ventana del modelo
  model?: string
  turns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreateTokens: number
  costUsd: number // a precio de lista; con suscripción no se cobra aparte
  /** Copilot: solicitudes premium consumidas por esta conversación. */
  premiumRequests?: number
  durationMs: number
  updatedAt: number
}

/** Con qué se ejecuta una conversación: Claude Code o el CLI de GitHub Copilot. */
export type Provider = 'claude' | 'copilot'

/** Solicitud de permiso de Claude Code para usar una herramienta (p. ej. ejecutar un comando). */
export interface PermissionRequest {
  id: string
  tool: string
  /** Comando o archivo/URL que se quiere usar, recortado. */
  target: string
  /** Descripción que da Claude de lo que hará (si la hay). */
  description?: string
  /** Para comandos: la regla que «Permitir siempre» agregaría a Ajustes (ej. «git checkout»). */
  rule?: string
  ts: number
}

export type PermissionChoice = 'allow' | 'always' | 'deny'

/** Cómo se tratan los comandos de shell que no están en la lista permitida. */
export type CommandPolicy = 'ask' | 'all' | 'list'

/** Una conversación con Claude. Una tarea puede tener varias, cada una con su propio contexto. */
export interface Chat {
  /** Proveedor de la conversación (por defecto Claude). No se puede cambiar una vez iniciada la sesión. */
  provider?: Provider
  /** Modelo elegido ('' o ausente = el predeterminado del proveedor). */
  model?: string
  /** 'design' = conversación de la pestaña Diseño (no aparece entre las conversaciones normales). */
  kind?: 'design'
  taskId: string
  createdAt: number
  title?: string
  closed?: boolean // pestaña cerrada: se conserva y puede reabrirse
  sessionId: string | null
  messages: ChatMessage[]
  activity: Activity[]
  running: boolean
  /** Herramientas que Claude quiere usar y esperan tu aprobación (solo mientras responde). */
  pending?: PermissionRequest[]
  gotResult?: boolean
  cancelled?: boolean
  summarizedCount?: number
  usage?: ChatUsage
  compactions?: number
}

/** Un turno de Claude, para el panel de consumo. */
export interface UsageRecord {
  ts: number
  taskId: string
  model: string
  input: number
  output: number
  cacheRead: number
  cacheCreate: number
  costUsd: number
  /** Ausente = Claude (registros anteriores a Copilot). */
  provider?: Provider
  /** Copilot: solicitudes premium de este turno. */
  premium?: number
}

export interface LimitWindow {
  utilization: number // 0..1
  resetsAt: number // epoch en segundos
  status?: string
}

/** Límites del plan, tal como los informa Claude Code en cada respuesta. */
export interface RateLimits {
  fiveHour?: LimitWindow
  sevenDay?: LimitWindow
  updatedAt: number
}

export type FolderAccess = 'write' | 'read'

export interface GroupFolder {
  path: string
  access: FolderAccess
}

/** Conjunto de carpetas a las que Claude puede acceder además de la carpeta de la tarea. */
export interface FolderGroup {
  id: string
  name: string
  folders: GroupFolder[]
}

/** Un archivo con cambios en un repositorio (`git status --porcelain`). */
export interface GitFile {
  path: string
  orig?: string // ruta anterior en un renombrado
  index: string // estado en el área de preparación (X)
  work: string // estado en el directorio de trabajo (Y)
  staged: boolean
  unstaged: boolean
  untracked: boolean
  conflicted: boolean
}

export interface GitStatus {
  root: string
  branch: string
  upstream?: string
  ahead: number
  behind: number
  files: GitFile[]
}

export interface GitCommit {
  hash: string
  short: string
  subject: string
  author: string
  date: number
}

export interface GitBranches {
  current: string
  local: string[]
  remote: string[]
}

/** Repositorio candidato de una tarea: su carpeta y las de sus grupos. */
export interface GitRepo {
  dir: string
  name: string
  isRepo: boolean
}

export interface UndoPayload {
  tasks?: Task[]
  entries?: Entry[]
  chats?: Record<string, Chat>
}

/** Mockup HTML generado por Claude en la pestaña Diseño. */
export interface MockupFile {
  name: string
  mtime: number
  size: number
}

export interface Subtask {
  id: string
  text: string
  done: boolean
}

/** Terminal que se abre desde la app: 'auto' = Windows Terminal si está instalado, si no PowerShell. */
export type TerminalKind = 'auto' | 'wt' | 'powershell' | 'cmd'

/** 'integrated' = panel de terminal dentro de la app (como VS Code); 'external' = ventana aparte. */
export type TerminalMode = 'integrated' | 'external'

export type OpenMode = 'chat' | 'desktop' | 'terminal'
export type SummaryMode = 'ai' | 'local' | 'off'

export interface Settings {
  openMode: OpenMode
  openModeChat?: boolean
  summaryMode: SummaryMode
  claudeCmd: string
  /** Comando del CLI de GitHub Copilot. */
  copilotCmd: string
  /** Modelos de Copilot que se ofrecen en el selector, uno por línea. */
  copilotModels: string
  /** Comandos de shell que Claude y Copilot pueden ejecutar sin preguntar, uno por línea (ej. «git status», «npm run»). */
  allowedCommands: string
  /** ask = pregunta por los comandos fuera de la lista · all = permite todos (salvo los bloqueados) · list = solo la lista. */
  commandPolicy: CommandPolicy
  /** Solicitudes premium mensuales de tu plan de Copilot (0 = sin definir), para estimar cuántas quedan. */
  copilotQuota: number
  targetHours: number
  reminderTime: string
  idleMinutes: number
  promptTemplate: string
  gitAuthor?: string
  /** Compactación automática de Claude Code a partir de N tokens (0 = la decide Claude Code). */
  autocompactTokens: number
  /** Umbrales de contexto para las recomendaciones (en tokens). */
  contextWarnTokens: number
  contextCriticalTokens: number
  /** Aviso de escritorio cuando Claude termina y la app no está en primer plano. */
  notifyOnDone: boolean
  terminal: TerminalKind
  terminalMode: TerminalMode
  /** Al cerrar la ventana la app sigue en la bandeja (el timer no se detiene). */
  closeToTray: boolean
  launchAtLogin: boolean
  /** Aviso matutino con el daily listo (hora HH:MM; vacío = sin aviso). */
  dailyTime: string
  /** Dirección base de Redmine (para imputar horas desde la app). */
  redmineUrl: string
  /** Actividad por defecto al imputar (texto de la lista «Activity»). */
  redmineActivity: string
  /** Proyectos de Redmine y sus tareas, leídos del formulario «Log time». */
  redmineCatalog?: RedmineCatalog
  /** Bot de Telegram: token de BotFather, activado, chat vinculado y si los avisos llevan detalle (tarea / comando). */
  telegramToken?: string
  telegramOn?: boolean
  telegramChat?: number
  telegramDetails?: boolean
  /** Conversación a la que van los mensajes escritos en Telegram. */
  telegramConv?: string
}

export interface TelegramStatus {
  running: boolean
  linked: boolean
  bot?: string
  error?: string
}

/** Proyecto de Redmine (por nombre) con su id y las tareas conocidas. */
export type RedmineCatalog = Record<string, { id: string; issues: Array<{ id: string; label: string }> }>

export interface DB {
  tasks: Task[]
  entries: Entry[]
  settings: Settings
  lastReminderDay: string
  paused: string | null
  chats: Record<string, Chat>
  groups: FolderGroup[]
  usage: UsageRecord[]
  /** Comandos / disponibles, informados por Claude Code en cada respuesta. */
  commands?: string[]
  limits?: RateLimits
  heartbeat?: number
  lastDailyDay?: string
  /** Centro de notificaciones: lo que la app avisó (también lo que no llegó a mostrarse como aviso del sistema). */
  notifications?: AppNotification[]
}

/** Tarea nueva o parcial: sin id se crea una nueva. */
export type TaskInput = Partial<Task>
export type EntryPatch = Partial<Entry> & { id: string }

export interface IpcChannels {
  state: { args: []; ret: DB }
  'task:save': { args: [TaskInput]; ret: void }
  'task:delete': { args: [string]; ret: void }
  'task:prompt': { args: [string]; ret: string }
  'timer:start': { args: [string]; ret: void }
  'timer:stop': { args: []; ret: void }
  'timer:pause': { args: []; ret: void }
  'timer:resume': { args: []; ret: void }
  'win:restore': { args: []; ret: void }
  'claude:login': { args: []; ret: void }
  'claude:open': { args: [string]; ret: void }
  'vscode:open': { args: [string]; ret: void }
  'chat:send': { args: [string, string, Attachment[]?]; ret: true }
  'attach:pick': { args: [string]; ret: Attachment[] } // convId -> archivos elegidos y copiados
  'attach:save': { args: [string, string, Uint8Array]; ret: Attachment } // convId, nombre, bytes (pegar / arrastrar)
  'attach:preview': { args: [string]; ret: string | null } // ruta -> data URL (miniatura)
  'chat:cancel': { args: [string]; ret: void }
  'chat:permit': { args: [string, string, PermissionChoice]; ret: void } // convId, id de la solicitud, decisión
  'chat:config': { args: [string, { provider?: Provider; model?: string }]; ret: void } // proveedor y modelo de la conversación
  'chat:reset': { args: [string]; ret: void }
  'chat:summarize': { args: [string]; ret: { text: string; mode: 'ai' | 'local' } }
  'chat:new': { args: [string, 'design'?]; ret: string } // taskId -> id de la conversación creada
  /** Abre una terminal en la carpeta de la tarea; con una sesión, retoma esa conversación con `claude --resume`. */
  'terminal:open': { args: [string, string?]; ret: void }
  /** Terminal integrada: crea un shell (ConPTY) en la carpeta de la tarea; con sesión, retoma esa conversación de Claude. */
  'pty:create': { args: [string, number, number, string?]; ret: { id: string; title: string } }
  'pty:write': { args: [string, string]; ret: void }
  'pty:resize': { args: [string, number, number]; ret: void }
  'pty:kill': { args: [string]; ret: void }
  'data:export': { args: []; ret: string | null }
  'data:import': { args: []; ret: boolean }
  'data:backups': { args: []; ret: void }
  /** Devuelve lo borrado (deshacer). */
  'undo:restore': { args: [UndoPayload]; ret: void }
  'git:repos': { args: [string]; ret: GitRepo[] }
  'git:init': { args: [string]; ret: void }
  'git:status': { args: [string]; ret: GitStatus }
  'git:diff': { args: [string, string, 'staged' | 'work' | 'untracked']; ret: string }
  'git:stage': { args: [string, string[]]; ret: void }
  'git:unstage': { args: [string, string[]]; ret: void }
  'git:discard': { args: [string, string[], string[]]; ret: void } // repo, archivos con seguimiento, archivos sin seguimiento
  'git:commit': { args: [string, string]; ret: string }
  'git:message': { args: [string]; ret: string } // mensaje de commit propuesto por Claude a partir de lo preparado
  'git:branches': { args: [string]; ret: GitBranches }
  'git:checkout': { args: [string, string, boolean]; ret: void } // repo, rama, crear
  'git:sync': { args: [string, 'fetch' | 'pull' | 'push']; ret: string }
  'git:log': { args: [string, number]; ret: GitCommit[] }
  'git:show': { args: [string, string]; ret: string }
  'daily:polish': { args: [string]; ret: string } // Claude redacta el daily a partir del borrador
  'mockup:list': { args: [string]; ret: MockupFile[] }
  'mockup:delete': { args: [string, string]; ret: void }
  'mockup:export': { args: [string, string, 'png' | 'pdf', number]; ret: string | null } // tarea, archivo, formato, ancho
  'mockup:reveal': { args: [string]; ret: void }
  'chat:close': { args: [string]; ret: void }
  'chat:reopen': { args: [string]; ret: void }
  'group:save': { args: [FolderGroup]; ret: void }
  'group:delete': { args: [string]; ret: void }
  'redmine:lines': { args: [string]; ret: RedmineLine[] }
  'files:roots': { args: [string]; ret: FileRoot[] }
  'files:list': { args: [string, string, string]; ret: FileEntry[] }
  'files:read': { args: [string, string, string]; ret: FileContent }
  'files:find': { args: [string, string, string]; ret: string[] }
  'notif:read': { args: [string]; ret: void }
  'notif:clear': { args: []; ret: void }
  'telegram:status': { args: []; ret: TelegramStatus }
  'telegram:save': { args: [{ token: string; on: boolean; details: boolean }]; ret: TelegramStatus }
  'telegram:link': { args: []; ret: string }
  'telegram:unlink': { args: []; ret: TelegramStatus }
  'telegram:test': { args: []; ret: void }
  'redmine:login': { args: []; ret: void }
  'redmine:days': { args: [string, string]; ret: RedmineDay[] }
  'redmine:send': { args: [string, string[], Record<string, number>, Record<string, string>?]; ret: RedmineResult }
  'redmine:catalog': { args: []; ret: { projects: number; issues: number } }
  'entry:update': { args: [EntryPatch]; ret: void }
  'entry:delete': { args: [string]; ret: void }
  'entry:add': { args: [{ taskId: string; start: number; end: number }]; ret: void }
  'settings:save': { args: [Partial<Settings>]; ret: void }
  'folder:pick': { args: []; ret: string | null }
  'git:commits': { args: [string]; ret: Record<string, string[]> }
  'draft:fillNotes': { args: [string]; ret: number }
  'excel:export': { args: [string, string]; ret: string | null }
}

export type Unsubscribe = () => void

/** API que el preload expone en `window.api`. */
export interface Api {
  call<K extends keyof IpcChannels>(name: K, ...args: IpcChannels[K]['args']): Promise<IpcChannels[K]['ret']>
  onState(cb: (s: DB) => void): Unsubscribe
  onDelta(cb: (d: { convId: string; text: string }) => void): Unsubscribe
  onPtyData(cb: (d: { id: string; data: string }) => void): Unsubscribe
  onPtyExit(cb: (d: { id: string; code: number }) => void): Unsubscribe
  onQuickAdd(cb: () => void): Unsubscribe
  onGoto(cb: (view: string) => void): Unsubscribe
}
