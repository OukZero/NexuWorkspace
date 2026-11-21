// Contrato compartido entre main, preload y renderer.

export type Status = 'next' | 'today' | 'doing' | 'review' | 'done'
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
  /** Issue del repositorio (GitHub) vinculada a la tarea. */
  issue?: IssueRef
  /** Rama de trabajo de la tarea y carpeta del repositorio donde vive. */
  branch?: string
  branchDir?: string
  /** Último PR publicado desde la rama de la tarea (lo revisa otra persona). */
  pr?: PrLink
  /** Entorno de la tarea: lo que se abre de un clic (carpeta, navegador, Postman, base de datos…). */
  launch?: LaunchItem[]
  /** Número del PR por el que la tarea ya pasó a «En revisión» (para no volver a moverla si la devuelves a mano). */
  reviewPr?: number
  /** Notas de sesión: lo hecho, lo decidido y lo pendiente al cerrar cada conversación. */
  sessions?: SessionNote[]
}

/** Issue de un repositorio remoto. */
export interface IssueRef {
  number: number
  title: string
  url: string
  state?: 'open' | 'closed'
  labels?: string[]
}

/** Enlace para abrir (o ver) el PR de una rama. */
export interface PrLink {
  url: string
  branch: string
  base: string
  /** true = el PR ya existe; false = es el enlace para crearlo. */
  exists: boolean
  number?: number
  title?: string
  ts: number
}

/** Dónde está el remoto de un repositorio y de qué tipo es. */
export interface RemoteInfo {
  url: string
  kind: 'github' | 'gitlab' | 'azure' | 'other'
  host: string
  owner: string
  repo: string
  /** Dirección web del repositorio (sin .git). */
  web: string
  base: string
}

/** Nota de sesión: resumen estructurado de una conversación, para retomar la tarea días después. */
export interface SessionNote {
  id: string
  ts: number
  convId: string
  title: string
  done: string[]
  decisions: string[]
  pending: string[]
  files: string[]
  branch?: string
}

/** Piezas de contexto que se pueden anexar automáticamente a un mensaje. */
export type ContextKind = 'task' | 'branch' | 'status' | 'diff' | 'base' | 'terminal' | 'notes' | 'ci' | 'web'

/** Plantilla de prompt reutilizable. Admite variables {{tarea}}, {{descripcion}}, {{rama}}, {{issue}} y {{archivos}}; lo que va entre [corchetes] se rellena a mano. */
export interface PromptTemplate {
  id: string
  name: string
  text: string
  /** Se muestra como botón rápido sobre el cuadro de texto. */
  pinned?: boolean
  /** Contexto que se adjunta solo al usar la plantilla. */
  ctx?: ContextKind[]
  /** Se envía de inmediato en lugar de dejarla en el cuadro para editarla. */
  autoSend?: boolean
}

/** Contexto elegido para un mensaje; `terminal` lo aporta la interfaz (la salida vive en el renderer). */
export interface ChatContext {
  kinds: ContextKind[]
  terminal?: string
}

export interface ContextPreview {
  text: string
  labels: string[]
  chars: number
}

/** Resultado de publicar una rama. */
export interface PushResult {
  message: string
  pr?: PrLink
  /** Sin enlace al PR: no hay remoto o no es compatible. */
  note?: string
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
  /** Valores calculados solo con los registros del timer (sin lo que el usuario cambió a mano). */
  auto?: { activity: string; hours: number; comment: string }
  /** Cambios guardados a mano para esta línea y ese día. */
  draft?: RedmineDraft
  drafted?: boolean
}

/** Lo que el usuario corrige en una línea de la previsualización de Redmine; los campos que faltan usan el valor automático. */
export interface RedmineDraft {
  hours?: number
  activity?: string
  comment?: string
}

/** Un día en Redmine: horas imputadas y horas laborables que le corresponden. */
export interface RedmineDay {
  day: string
  spent: number
  max: number
}

export type NotificationKind = 'daily' | 'reminder' | 'done' | 'attention' | 'permission' | 'idle' | 'ci' | 'whatsapp' | 'calendar'

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

/** Un check de integración continua (GitHub Actions u otro servicio que reporte a GitHub). */
export interface CiCheck {
  id?: number
  name: string
  state: 'success' | 'failure' | 'pending' | 'skipped'
  url?: string
}

export interface CiPr {
  number: number
  url: string
  state: 'open' | 'closed' | 'merged'
  draft: boolean
  /** Resultado de las revisiones: aprobado, con cambios pedidos o sin veredicto aún. */
  review: 'approved' | 'changes' | 'pending'
  comments: number
  /** GitHub dice que la rama tiene conflictos con la base. */
  conflicts: boolean
}

/** Estado de CI y PR de la rama de una tarea. */
export interface CiStatus {
  taskId: string
  branch: string
  state: 'success' | 'failure' | 'pending' | 'none'
  checks: CiCheck[]
  pr?: CiPr
  ts: number
  error?: string
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
  /** Contexto automático que se anexó a este mensaje (solo etiquetas, para mostrarlas). */
  context?: string[]
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

/** Con qué se ejecuta una conversación: Claude Code, el CLI de GitHub Copilot o el CLI de Gemini (clave de API). */
export type Provider = 'claude' | 'copilot' | 'gemini'

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
export type MiniFormat = 'full' | 'compact' | 'timer'
export type ChatMode = 'agent' | 'ask'

/** Copia del trabajo guardada antes de cada respuesta de la IA, para poder volver atrás. */
export interface Checkpoint {
  id: string
  ts: number
  /** Marca de tiempo del mensaje del usuario que la originó. */
  msgTs: number
  /** Confirmación (commit) de Git que guarda el estado de todos los archivos. */
  sha: string
}

/** Copia aislada del repositorio (git worktree) donde trabaja una conversación, en su propia rama. */
export interface ChatWorktree {
  dir: string
  branch: string
  base: string
  /** Raíz del repositorio original. */
  repo: string
}

/** Forma de trabajar de la IA: modo, modelo e instrucciones guardados con nombre. */
export interface AgentProfile {
  id: string
  name: string
  icon: string
  mode: ChatMode
  /** '' = el modelo predeterminado. */
  model: string
  /** Solo lectura: no puede editar ni crear archivos. */
  readOnly: boolean
  instructions: string
}

/** Tarea tipo: al crear una tarea con ella se rellenan datos y subtareas. */
export interface TaskTemplate {
  id: string
  name: string
  icon: string
  titlePrefix: string
  description: string
  priority: Priority
  estimateMin: number
  tags: string[]
  subtasks: string[]
}

/** Disposición guardada de la ventana (paneles, terminal, modo foco). */
export interface LayoutPreset {
  id: string
  name: string
  sideOpen: boolean
  sideTab: 'session' | 'files' | 'activity'
  sideW: number
  sidebarW: number
  dockOpen: boolean
  dockH: number
  focus: boolean
}

export interface SkillInfo {
  name: string
  description: string
  installed: boolean
  custom?: boolean // instalada por ti, no es del catálogo oficial
  recommended?: boolean // ayuda a Claude a trabajar con esta app
}

export interface CheckDef {
  name: string
  cmd: string
}

export interface CheckResult {
  name: string
  cmd: string
  ok: boolean
  code: number | null
  ms: number
  output: string
  truncated: boolean
}

/** Una conversación con Claude. Una tarea puede tener varias, cada una con su propio contexto. */
export interface Chat {
  /** Proveedor de la conversación (por defecto Claude). No se puede cambiar una vez iniciada la sesión. */
  provider?: Provider
  /** Modelo elegido ('' o ausente = el predeterminado del proveedor). */
  model?: string
  /** 'agent' = actúa sin pedir permiso; 'ask' = pregunta antes de editar o ejecutar. Ausente = según la política de Ajustes. */
  mode?: ChatMode
  /** Perfil de agente aplicado (instrucciones y solo lectura vienen de él). */
  profileId?: string
  /** Copia aislada del repositorio donde trabaja esta conversación. */
  worktree?: ChatWorktree
  /** Puntos de restauración, uno por mensaje enviado (los más recientes al final). */
  checkpoints?: Checkpoint[]
  /** Aviso de límite de la cuenta ya mostrado en este chat (para no repetirlo). */
  limitHint?: string
  /** 'design' = conversación de la pestaña Diseño (no aparece entre las conversaciones normales). */
  kind?: 'design' | 'review'
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
  /** Mensajes que ya quedaron cubiertos por una nota de sesión. */
  noteAt?: number
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
  /** Reuniones: ruta del ejecutable de whisper.cpp (whisper-cli) con el que se transcribe la voz en local. */
  whisperCmd: string
  /** Reuniones: ruta del modelo de whisper.cpp (archivo ggml-*.bin). */
  whisperModel: string
  /** Reuniones: idioma hablado («es», «en»…) o «auto» para detectarlo. */
  whisperLang: string
  /** Reuniones: conservar el audio grabado tras transcribirlo (por defecto se borra). */
  meetingKeepAudio: boolean
  /** Nombres y alias con los que te nombran en las reuniones, separados por comas. Vacío = se usa el de tu correo. */
  myNames: string
  /** Proponer tareas automáticamente al terminar el resumen de una reunión (nunca las crea sin que las confirmes). */
  meetingAutoTasks: boolean
  /** Comando del CLI de GitHub Copilot. */
  copilotCmd: string
  /** Comando del CLI de Gemini. La clave se lee de la variable de entorno GEMINI_API_KEY, no se guarda en la app. */
  geminiCmd: string
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
  /** Modelo de Claude de los chats nuevos («haiku», «sonnet», «opus»); vacío = el que use el CLI. */
  defaultChatModel?: string
  /** Migración única que activó la compactación automática (los chats largos disparaban el consumo). */
  tokenSavingsApplied?: boolean
  /** Umbrales de contexto para las recomendaciones (en tokens). */
  contextWarnTokens: number
  contextCriticalTokens: number
  /** Aviso de escritorio cuando Claude termina y la app no está en primer plano. */
  notifyOnDone: boolean
  terminal: TerminalKind
  terminalMode: TerminalMode
  /** Al cerrar la ventana la app sigue en la bandeja (el timer no se detiene). */
  closeToTray: boolean
  /** Ventana flotante: se muestra al minimizar la principal (por defecto sí). */
  miniEnabled?: boolean
  /** Avisar al acercarse a los límites de la cuenta (por defecto sí). */
  limitAlerts?: boolean
  /** Mover la tarea a «En revisión» al abrirse su PR, y a «Hecha» al fusionarse (por defecto sí). */
  prAutoReview?: boolean
  /** Pasar al modelo más barato desde este % de uso de la cuenta (0 = nunca). */
  cheapAt?: number
  profiles?: AgentProfile[]
  taskTemplates?: TaskTemplate[]
  layouts?: LayoutPreset[]
  /** Formato: completa (chat y timer), compacta (selector y timer) o solo timer. */
  miniFormat?: MiniFormat
  /** Siempre por encima de las demás ventanas (por defecto sí). */
  miniOnTop?: boolean
  /** Ya se avisó de las skills recomendadas (solo se avisa una vez). */
  skillsPrompted?: boolean
  /** Opacidad de la ventana flotante (40–100, por defecto 100). */
  miniOpacity?: number
  /** Última posición de la ventana flotante: se recuerda al moverla. */
  miniPos?: { x: number; y: number }
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
  /** Spotify: Client ID de la app del usuario, lista de enfoque (URI o enlace) y si el pomodoro la controla solo. */
  spotifyClientId?: string
  /** Calendario de Outlook (Microsoft Graph): Client ID de tu app de Azure, inquilino (common, organizations o un id) y minutos de aviso antes de cada reunión (0 = sin aviso). */
  outlookClientId?: string
  /** Permitir que Claude consulte páginas web (WebFetch y WebSearch) en todos los chats; por defecto sí. */
  claudeWeb?: boolean
  /** Sitios guardados para los paneles «Web». */
  webLinks?: WebLink[]
  outlookTenant?: string
  meetingRemindMin?: number
  spotifyFocusUri?: string
  spotifyAuto?: boolean
  /** Dispositivo elegido para reproducir (id y nombre: el id cambia en el reproductor web, el nombre sirve de respaldo). */
  spotifyDeviceId?: string
  spotifyDeviceName?: string
  /** Token de GitHub (opcional): si está vacío se usa el del Administrador de credenciales de Git. */
  githubToken?: string
  /** Plantillas de prompts; ausente = las predeterminadas. */
  promptTemplates?: PromptTemplate[]
  /** Contexto que se anexa por defecto a cada mensaje. */
  defaultContext?: ContextKind[]
  /** Indicaciones propias para la revisión de código (convenciones del equipo, qué vigilar). */
  reviewInstructions?: string
  /** Guardar una nota de sesión sola al cerrar una conversación con actividad. */
  autoSessionNotes?: boolean
  /** Rama base de los PR cuando no se puede detectar. */
  baseBranch?: string
  /** Buscar y descargar versiones nuevas sola (por defecto sí). */
  autoUpdate?: boolean
  /** Token de GitHub de solo lectura para actualizar desde un repositorio privado (si no, se usa GH_TOKEN). */
  updateToken?: string
  /** Copia de la apariencia (temas, tipografía, menú…); la interfaz la valida al leerla. */
  appearance?: Record<string, unknown>
}

export interface TelegramStatus {
  running: boolean
  linked: boolean
  bot?: string
  error?: string
}

/** Reunión del calendario (solo lectura). Las fechas son milisegundos. */
export interface CalEvent {
  id: string
  title: string
  start: number
  end: number
  allDay: boolean
  /** Ocupa tu tiempo (no es «libre»). */
  busy: boolean
  tentative?: boolean
  joinUrl?: string
  webLink?: string
  location?: string
  organizer?: string
}
export interface CalendarStatus {
  configured: boolean
  connected: boolean
  error?: string
  syncedAt?: number
}
export interface CalendarSave {
  clientId: string
  tenant: string
  remindMin: number
}
/** Tiempo reservado para trabajar en una tarea. */
export interface FocusBlock {
  id: string
  taskId: string
  start: number
  end: number
  /** Ya se avisó de que llegó la hora. */
  notified?: boolean
}

export interface SpotifyStatus {
  configured: boolean
  connected: boolean
  error?: string
}
export interface SpotifyNow {
  playing: boolean
  title: string
  artist: string
  /** Carátula (URL) y progreso en milisegundos. */
  art?: string
  progressMs?: number
  durationMs?: number
  device?: string
  /** Volumen del dispositivo (0-100); no viene si el dispositivo no permite cambiarlo desde la API. */
  volume?: number
}
export type SpotifyAction = 'play' | 'pause' | 'next' | 'prev' | 'focus'
/** Dispositivo en el que puede sonar Spotify (este equipo, el móvil, un altavoz…). */
export interface SpotifyDevice {
  id: string
  name: string
  type: string
  active: boolean
}
/** Canción de un resultado de búsqueda. */
export interface SpotifyTrack {
  uri: string
  title: string
  artist: string
  album: string
  art?: string
  durationMs: number
}
/** Playlist de un resultado de búsqueda o de la biblioteca del usuario. */
export interface SpotifyPlaylist {
  uri: string
  name: string
  owner: string
  art?: string
}
export interface SpotifySearchResult {
  tracks: SpotifyTrack[]
  playlists: SpotifyPlaylist[]
}

/** Proyecto de Redmine (por nombre) con su id y las tareas conocidas. */
export type RedmineCatalog = Record<string, { id: string; issues: Array<{ id: string; label: string }> }>

/** Agente del equipo: un Claude con su propio prompt de sistema, modelo y skills. */
export interface TeamAgent {
  id: string
  name: string
  emoji: string
  color: string
  model: 'haiku' | 'sonnet' | 'opus'
  prompt: string
  skills: string[]
  /** Puede leer y modificar archivos de `workdir` (agente desarrollador). Sin carpeta elegida no se ejecuta. */
  canEdit?: boolean
  workdir?: string
  /** Documentos de referencia fijos (p. ej. una estimación previa para el estimador): se le pasan en cada encargo. */
  refs?: Attachment[]
  /** Apariencia del robot (opcional: los agentes antiguos usan los valores por defecto). */
  look?: RobotLook
}

export interface RobotLook {
  head?: 'redonda' | 'cuadrada' | 'tv' | 'domo'
  eyes?: 'pixel' | 'redondos' | 'visor' | 'felices'
  antenna?: 'bola' | 'doble' | 'helice' | 'ninguna'
  acc?: 'ninguno' | 'gorro' | 'sombrero' | 'corona' | 'audifonos' | 'lentes'
}

/** Personaje del usuario: rasgos que el avatar dibuja en capas. Los opcionales se añadieron después. */
export interface TeamCharacter {
  name: string
  role: string
  skin: string
  hair: 'corto' | 'rizado' | 'gorro' | 'largo' | 'mono' | 'rapado' | 'cresta' | 'calvo'
  /** 'barba' es heredado: ahora va en `facial`. */
  gear: 'ninguno' | 'lentes' | 'sol' | 'audifonos' | 'gorra' | 'aretes' | 'barba'
  outfit: 'sudadera' | 'camisa' | 'bata' | 'polera' | 'chaqueta' | 'traje'
  hairColor?: string
  eyeColor?: string
  outfitColor?: string
  mouth?: 'sonrisa' | 'grande' | 'neutral' | 'sorpresa'
  face?: 'normal' | 'pecas' | 'rubor'
  facial?: 'ninguno' | 'barba' | 'bigote' | 'perilla'
}

/** Equipo de agentes + personaje + adornos de la sala (ids de adorno, en orden de colocación). */
export interface AgentTeam {
  character: TeamCharacter
  agents: TeamAgent[]
  /** Obsoleto: adornos en emoji. Se migran a `props` al abrir la vista. */
  decor: string[]
  /** Objetos colocados libremente en la sala (x/y en % de la sala, anclados por el centro). */
  props?: TeamProp[]
  /** Chat general del equipo: cada solicitud y la respuesta del agente al que se asignó (últimos 60). */
  chat?: TeamChatMsg[]
  /** Varias conversaciones; si existe, sustituye a `chat` (que se migra a la primera). */
  chats?: TeamConv[]
  activeChat?: string
}

/** Línea de progreso en vivo de un agente (herramienta que usa o fase del plan). */
export interface TeamProgress {
  agentId: string
  text: string
}

/** Una conversación del chat de equipo. */
export interface TeamConv {
  id: string
  name: string
  msgs: TeamChatMsg[]
  /** Carpeta del proyecto de esta conversación: la usan todos los agentes. */
  workdir?: string
}

export interface TeamChatMsg {
  id: string
  role: 'user' | 'agent' | 'system'
  text: string
  at: number
  /** Agente que respondió (role 'agent') o al que se asignó la solicitud. */
  agentId?: string
  /** Por qué se eligió ese agente (lo explica el enrutador). */
  reason?: string
  /** Archivos adjuntos a la solicitud (role 'user'). */
  attachments?: Attachment[]
}

export interface TeamOrchestration {
  steps: Array<{ agentId: string; instruction: string; output: string }>
  summary: string
}

export interface TeamProp {
  id: string
  /** Clave del asset (planta, gato, sofá…). */
  k: string
  x: number
  y: number
  /** Escala 0.6–2. */
  s: number
  flip?: boolean
}

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
  /** Cambios a mano en la imputación de Redmine, por día y por línea (se quitan al imputar). */
  rmDrafts?: Record<string, Record<string, RedmineDraft>>
  limits?: RateLimits
  heartbeat?: number
  lastDailyDay?: string
  /** Centro de notificaciones: lo que la app avisó (también lo que no llegó a mostrarse como aviso del sistema). */
  notifications?: AppNotification[]
  agentTeam?: AgentTeam
  /** Bloques de tiempo reservados para una tarea (solo locales, no se escriben en el calendario). */
  focusBlocks?: FocusBlock[]
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
  'chat:worktree': { args: [string, 'create' | 'remove' | 'merge']; ret: string } // aislar la conversación en su propia rama; devuelve un mensaje para mostrar
  'chat:worktreeInfo': { args: [string]; ret: { dir: string; branch: string; base: string; changed: number; ahead: number; exists: boolean } | null }
  'chat:restore': { args: [string, string]; ret: string } // vuelve los archivos al punto de restauración
  'check:list': { args: [string]; ret: CheckDef[] }
  'check:run': { args: [string, string, string | undefined]; ret: CheckResult }
  'skills:list': { args: []; ret: SkillInfo[] }
  'skills:install': { args: [string]; ret: string }
  'skills:remove': { args: [string]; ret: string }
  'skills:installRecommended': { args: []; ret: string }
  'window:skills': { args: []; ret: void } // abre la ventana del catálogo de skills
  'calendar:status': { args: []; ret: CalendarStatus }
  'calendar:save': { args: [CalendarSave]; ret: CalendarStatus }
  'calendar:connect': { args: []; ret: CalendarStatus }
  'calendar:disconnect': { args: []; ret: CalendarStatus }
  'calendar:events': { args: [boolean?]; ret: CalEvent[] } // true = volver a consultar ahora
  'focus:save': { args: [Partial<FocusBlock> & { taskId: string; start: number; end: number }]; ret: FocusBlock }
  'focus:delete': { args: [string]; ret: void }
  'web:attach': { args: [string, number, 'web' | 'wsp']; ret: boolean } // la página <webview> del panel ya está lista: id del panel e id de su WebContents
  'web:active': { args: [string]; ret: void } // esta página es la que se está viendo (la que lee Claude)
  'whatsapp:visible': { args: [boolean]; ret: void }
  'assistant:plan': { args: [string]; ret: AssistantPlan }
  'assistant:read': { args: [string | null, string]; ret: string } // dirección (null = página a la vista) y pregunta
  'launch:run': { args: [string, string?]; ret: string[] } // tarea y, opcionalmente, un elemento; devuelve los errores
  'file:pick': { args: [('app' | 'file')?]; ret: string | null }
  'notes:list': { args: []; ret: Note[] }
  'notes:save': { args: [NoteInput]; ret: Note }
  'notes:delete': { args: [string]; ret: void }
  'notes:image': { args: [string, string, string]; ret: string } // nota, tipo MIME y contenido en base64 -> dirección de la imagen
  'meetings:list': { args: []; ret: Meeting[] }
  'meetings:start': { args: [string, string?]; ret: string } // título y tarea opcional; devuelve el id de la grabación
  'meetings:chunk': { args: [string, ArrayBuffer]; ret: void } // audio PCM 16-bit, 16 kHz, mono
  'meetings:stop': { args: [string, number]; ret: Meeting } // id y duración en ms; cierra el WAV y lanza la transcripción y el resumen
  'meetings:update': { args: [string, MeetingPatch]; ret: Meeting }
  'meetings:summarize': { args: [string]; ret: Meeting } // rehace solo el resumen a partir de la transcripción
  'meetings:retry': { args: [string]; ret: Meeting } // repite la transcripción (si aún está el audio) y el resumen
  'meetings:delete': { args: [string]; ret: void }
  'meetings:extract': { args: [string]; ret: Meeting } // busca tareas en la reunión (las propone, no las crea)
  'meetings:createTasks': { args: [string, MeetingTask[]]; ret: number } // crea las tareas elegidas y las vincula a la reunión; devuelve cuántas
  'badges:get': { args: []; ret: Record<string, number> } // sin leer actuales (para pintar al abrir o recargar la ventana)
  'whatsapp:open': { args: []; ret: void } // lleva a la vista de WhatsApp dentro de la app
  'window:fullscreen': { args: [boolean?]; ret: boolean } // pantalla completa de la ventana actual (sin argumento alterna); devuelve el estado nuevo
  'win:restore': { args: []; ret: void }
  'mini:resize': { args: [number, number]; ret: void } // tamaño que necesita la ventana flotante (formato completo)
  'mini:hide': { args: []; ret: void } // oculta la ventana flotante hasta la próxima vez que se minimice la principal
  'claude:login': { args: []; ret: void }
  'claude:open': { args: [string]; ret: void }
  'vscode:open': { args: [string]; ret: void }
  'chat:send': { args: [string, string, Attachment[]?, ChatContext?]; ret: true }
  'chat:context': { args: [string, ContextKind[]]; ret: ContextPreview } // tarea, piezas -> vista previa de lo que se anexaría
  'review:start': { args: [string, string?]; ret: string } // tarea, repo (opcional) -> id de la conversación de revisión
  'session:note': { args: [string]; ret: SessionNote | null } // conversación -> nota guardada en la tarea
  'session:delete': { args: [string, string]; ret: void }
  'session:toSubtask': { args: [string, string]; ret: void } // tarea, texto pendiente
  'update:state': { args: []; ret: UpdateState }
  'update:check': { args: []; ret: UpdateState }
  'update:download': { args: []; ret: void }
  'update:install': { args: []; ret: void }
  'usage:refresh': { args: []; ret: true } // consulta mínima a Claude Code y actualiza los límites de la cuenta (ventana de 5 h y semana)
  'app:quit': { args: []; ret: void } // sale de verdad: detiene el timer y mata los procesos hijos (no queda nada en segundo plano)
  'app:restart': { args: []; ret: void } // cierra la app y la vuelve a abrir para cargar los cambios nuevos
  'window:popout': { args: [string, string | undefined, boolean | undefined]; ret: void } // abre la tarea en una ventana aparte (tarea, conversación, junto al cursor)
  'window:dock': { args: [string, string | undefined]; ret: void } // devuelve la tarea de una ventana suelta a la principal
  'url:open': { args: [string]; ret: void } // abre un enlace http(s) en el navegador
  'git:remote': { args: [string]; ret: RemoteInfo | null }
  'git:push': { args: [string, string?]; ret: PushResult } // repo, tarea -> resultado con enlace al PR
  'git:prText': { args: [string, string?]; ret: { title: string; body: string } }
  'ci:all': { args: []; ret: Record<string, CiStatus> }
  'ci:refresh': { args: [string]; ret: CiStatus | null }
  'ci:failure': { args: [string]; ret: string } // texto con los checks fallidos de la tarea, listo para la IA
  'issue:list': { args: [string]; ret: IssueRef[] }
  'issue:create': { args: [string, string, string, string[]?]; ret: IssueRef }
  'issue:branch': { args: [string, string, number]; ret: { branch: string; issue: IssueRef } } // tarea, repo, nº de issue
  'issue:link': { args: [string, IssueRef | null]; ret: void }
  'task:branch': { args: [string, string, string]; ret: string } // tarea, repo, nombre -> rama creada
  'attach:pick': { args: [string]; ret: Attachment[] } // convId -> archivos elegidos y copiados
  'attach:save': { args: [string, string, Uint8Array]; ret: Attachment } // convId, nombre, bytes (pegar / arrastrar)
  'attach:preview': { args: [string]; ret: string | null } // ruta -> data URL (miniatura)
  'chat:cancel': { args: [string]; ret: void }
  'chat:permit': { args: [string, string, PermissionChoice]; ret: void } // convId, id de la solicitud, decisión
  'chat:config': { args: [string, { provider?: Provider; model?: string; mode?: ChatMode; profileId?: string }]; ret: void } // proveedor y modelo de la conversación
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
  'redmine:aiComment': { args: [string, string]; ret: string } // día y línea -> comentario resumido por Claude
  'redmine:draft': { args: [string, string, RedmineDraft | null]; ret: void } // día, línea y cambios (null = volver a lo automático)
  'files:roots': { args: [string]; ret: FileRoot[] }
  'files:list': { args: [string, string, string]; ret: FileEntry[] }
  'files:read': { args: [string, string, string]; ret: FileContent }
  'files:find': { args: [string, string, string]; ret: string[] }
  'notif:read': { args: [string]; ret: void }
  'notif:clear': { args: []; ret: void }
  'team:get': { args: []; ret: AgentTeam }
  'team:save': { args: [AgentTeam]; ret: void }
  'team:ask': { args: [string, string, Attachment[]?, string?, string?]; ret: string } // id del agente, mensaje y adjuntos -> respuesta
  'team:orchestrate': { args: [string, Attachment[]?, string?, string?]; ret: TeamOrchestration } // el orquestador reparte la solicitud entre los agentes y integra el resultado
  'team:cancel': { args: []; ret: void } // detiene los agentes que se estén ejecutando
  'team:route': { args: [string, string?]; ret: { agentId: string; reason: string } } // solicitud -> agente que debe atenderla
  'telegram:status': { args: []; ret: TelegramStatus }
  'telegram:save': { args: [{ token: string; on: boolean; details: boolean }]; ret: TelegramStatus }
  'telegram:link': { args: []; ret: string }
  'telegram:unlink': { args: []; ret: TelegramStatus }
  'telegram:test': { args: []; ret: void }
  'spotify:status': { args: []; ret: SpotifyStatus }
  'spotify:save': { args: [{ clientId: string; focusUri: string; auto: boolean }]; ret: SpotifyStatus }
  'spotify:connect': { args: []; ret: SpotifyStatus }
  'spotify:disconnect': { args: []; ret: SpotifyStatus }
  'spotify:now': { args: []; ret: SpotifyNow | null }
  'spotify:control': { args: [SpotifyAction]; ret: void }
  'spotify:devices': { args: []; ret: SpotifyDevice[] }
  'spotify:volume': { args: [number]; ret: void } // volumen 0-100 del dispositivo activo
  /** Traspasa la reproducción a ese dispositivo (conserva si estaba sonando) y lo recuerda como el preferido. */
  'spotify:transfer': { args: [string]; ret: void }
  /** Busca canciones y playlists por texto. */
  'spotify:search': { args: [string]; ret: SpotifySearchResult }
  /** Playlists de la biblioteca del usuario (pide el permiso de lectura de playlists). */
  'spotify:playlists': { args: []; ret: SpotifyPlaylist[] }
  /** Reproduce una canción (spotify:track:…) o una lista (spotify:playlist:… / spotify:album:…). */
  'spotify:play': { args: [string]; ret: void }
  /** Añade una canción (spotify:track:…) a la cola. */
  'spotify:queue': { args: [string]; ret: void }
  'redmine:login': { args: []; ret: void }
  'redmine:days': { args: [string, string]; ret: RedmineDay[] }
  'redmine:send': { args: [string, string[], Record<string, number>, Record<string, string>?]; ret: RedmineResult }
  'redmine:catalog': { args: []; ret: { projects: number; issues: number; openFilter?: string; dump?: string; closed?: number } }
  'entry:update': { args: [EntryPatch]; ret: void }
  'entry:delete': { args: [string]; ret: void }
  'entry:add': { args: [{ taskId: string; start: number; end: number }]; ret: void }
  'settings:save': { args: [Partial<Settings>]; ret: void }
  'folder:pick': { args: []; ret: string | null }
  'git:commits': { args: [string]; ret: Record<string, string[]> }
  'draft:fillNotes': { args: [string]; ret: number }
  'excel:export': { args: [string, string]; ret: string | null }
  'auth:status': { args: []; ret: AuthStatus }
  'auth:signIn': { args: [string, string]; ret: AuthStatus }
  /** Contraseña nueva cuando el administrador creó el usuario con una temporal. */
  'auth:newPassword': { args: [string]; ret: AuthStatus }
  'auth:signOut': { args: []; ret: void }
  'auth:forgot': { args: [string]; ret: void }
  'auth:confirmForgot': { args: [string, string, string]; ret: void } // correo, código, contraseña nueva
}

/** Estado de la sesión (login con AWS Cognito). */
export interface AuthStatus {
  /** Hay un User Pool configurado (resources/auth.config.json o variables SHUTOKI_COGNITO_*). */
  configured: boolean
  signedIn: boolean
  /** El login está desactivado (resources/auth.config.json → enabled: false): la app no pide sesión. */
  disabled?: boolean
  email?: string
  /** Sesión aceptada sin poder validarla en línea (sin internet). */
  offline?: boolean
  /** Falta elegir una contraseña nueva (el usuario entró con la temporal). */
  needsNewPassword?: boolean
  /** Por qué se cerró la sesión: caducó o el administrador revocó/desactivó el acceso. */
  reason?: 'expired' | 'revoked'
}

/** Estado de las actualizaciones automáticas. 'dev' = la app no está instalada (no se actualiza sola). */
export interface UpdateState {
  status: 'dev' | 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
  current: string
  version?: string
  /** Notas de la versión nueva (texto plano). */
  notes?: string
  percent?: number
  error?: string
  checkedAt?: number
}

/** Qué se abre: carpeta o archivo (con el programa predeterminado), enlace web, programa (.exe, .lnk, .bat), VS Code o la terminal de la tarea. */
export type LaunchKind = 'folder' | 'url' | 'app' | 'file' | 'vscode' | 'terminal'

/** Una cosa que se abre al lanzar el entorno de la tarea. En `target` y `args`, {folder} se sustituye por la carpeta de la tarea. */
export interface LaunchItem {
  id: string
  kind: LaunchKind
  label?: string
  target: string
  /** Argumentos del programa (solo kind «app»), separados por espacios; admite comillas dobles. */
  args?: string
}

/** Sitio guardado para abrir en un panel «Web». */
export interface WebLink {
  id: string
  name: string
  url: string
}
export interface WebState {
  url: string
  title: string
  canBack: boolean
  canForward: boolean
  loading: boolean
}

/** Lo que el asistente propone hacer. Se valida en el proceso principal y no se ejecuta hasta que el usuario lo confirma. */
export type AssistantAction =
  | { type: 'open_view'; view: string }
  | { type: 'create_task'; title: string; description?: string; priority?: Priority; status?: 'today' | 'next' }
  | { type: 'set_status'; taskId: string; status: Status }
  | { type: 'start_timer'; taskId: string }
  | { type: 'stop_timer' }
  | { type: 'create_note'; title: string; body: string; taskId?: string }
  | { type: 'block_time'; taskId: string; start: number; minutes: number }
  | { type: 'launch_env'; taskId: string }
  | { type: 'open_web'; url: string }
  /** Lee una página (la indicada o, sin url, la del panel Web a la vista) y responde la pregunta. */
  | { type: 'read_page'; url?: string; question: string }
  /** Envía un mensaje a Claude sobre la tarea: en su conversación más reciente o en una nueva (newChat). */
  | { type: 'send_prompt'; taskId: string; prompt: string; newChat?: boolean }
/** Acciones que siguen pidiendo confirmación antes de ejecutarse (el resto se ejecuta directamente). */
export const CONFIRM_ACTIONS: AssistantAction['type'][] = ['launch_env']
export type PlannedAction = AssistantAction & { label: string }
export interface AssistantPlan {
  say: string
  actions: PlannedAction[]
}

/** Nota local en Markdown. */
export interface Note {
  id: string
  title: string
  body: string
  tags: string[]
  /** Tarea a la que está vinculada. */
  taskId?: string
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

/** Datos para crear (sin `id`) o actualizar una nota; lo omitido se conserva. `taskId: null` quita el vínculo. */
export interface NoteInput {
  id?: string
  title?: string
  body?: string
  tags?: string[]
  taskId?: string | null
  pinned?: boolean
}

/** Fases de una reunión grabada: grabando → transcribiendo → resumiendo → lista. */
export type MeetingStatus = 'recording' | 'transcribing' | 'summarizing' | 'done' | 'error'

/** Reunión grabada: su audio se transcribe en local y Claude redacta el resumen. */
export interface Meeting {
  id: string
  title: string
  taskId?: string
  createdAt: number
  durationMs: number
  status: MeetingStatus
  transcript: string
  /** Resumen en Markdown. */
  summary: string
  error?: string
  /** Si el archivo de audio sigue en disco. */
  hasAudio: boolean
  /** Tareas que Claude propone a partir de la reunión (aún sin crear). */
  proposals?: MeetingTask[]
  /** Se está buscando tareas en la reunión. */
  extracting?: boolean
}

/** Tarea propuesta desde una reunión. `mine` indica que el responsable es el usuario (según «Mis nombres» en Ajustes). */
export interface MeetingTask {
  title: string
  description: string
  priority: Priority
  owner: string
  mine: boolean
}

export interface MeetingPatch {
  title?: string
  /** `null` quita el vínculo con la tarea. */
  taskId?: string | null
  summary?: string
  transcript?: string
  /** `null` descarta las tareas propuestas. */
  proposals?: null
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
  onUpdate(cb: (s: UpdateState) => void): Unsubscribe
  onAuth(cb: (s: AuthStatus) => void): Unsubscribe
  onFullscreen(cb: (on: boolean) => void): Unsubscribe
  /** Mensajes sin leer por servicio de mensajería (id de la vista → número). */
  onBadges(cb: (b: Record<string, number>) => void): Unsubscribe
  /** Qué está haciendo ahora el agente que ejecuta una solicitud del chat de equipo. */
  onTeamProgress(cb: (p: TeamProgress) => void): Unsubscribe
}
