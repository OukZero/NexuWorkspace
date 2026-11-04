import { app, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import type { DB, Settings } from '../shared/types'
import { dayKey } from '../shared/util'

export const DEFAULT_SETTINGS: Settings = {
  openMode: 'chat', // 'chat' = chat de la app, 'desktop' = Claude Desktop (claude://code/new), 'terminal' = PowerShell + claude
  summaryMode: 'ai', // resumen automático al pausar/detener: 'ai' (claude -p), 'local' (sin IA) u 'off'
  claudeCmd: 'claude',
  targetHours: 8,
  reminderTime: '17:30',
  idleMinutes: 5,
  autocompactTokens: 0,
  contextWarnTokens: 100_000,
  contextCriticalTokens: 160_000,
  notifyOnDone: true,
  terminal: 'auto',
  terminalMode: 'integrated',
  closeToTray: false,
  launchAtLogin: false,
  dailyTime: '09:00',
  promptTemplate:
    'Trabaja en esta tarea:\n\n# {{title}}\n\n{{description}}\n\nProyecto: {{project}}\nCliente: {{client}}\n\nAntes de editar, revisa el código relevante y propón un plan breve.'
}

let db: DB
let dataFile = ''
const targets = new Set<BrowserWindow>() // ventanas que reciben el estado

export const getDb = (): DB => db

export function registerWindow(w: BrowserWindow): void {
  targets.add(w)
  w.on('closed', () => targets.delete(w))
}

// ---------- persistencia (JSON atómico) ----------
/** Completa y migra los datos leídos de disco (o importados) hasta el formato actual. */
function normalize(raw: Partial<DB>): DB {
  const d: DB = {
    tasks: [],
    entries: [],
    lastReminderDay: '',
    paused: null,
    chats: {},
    groups: [],
    usage: [],
    ...raw,
    settings: { ...DEFAULT_SETTINGS, ...raw.settings }
  }
  // migración única: el chat de la app pasa a ser el modo por defecto al hacer click en una tarea
  if (!d.settings.openModeChat) {
    d.settings.openMode = 'chat'
    d.settings.openModeChat = true
  }
  // migración: antes había un solo chat por tarea y su clave era el id de la tarea
  for (const [key, c] of Object.entries(d.chats)) {
    c.taskId ??= key
    c.createdAt ??= c.messages[0]?.ts ?? Date.now()
    // un chat no puede seguir "respondiendo" tras reiniciar la app
    c.running = false
  }
  return d
}

export function initDb(): void {
  dataFile = path.join(app.getPath('userData'), 'data.json')
  let raw: Partial<DB> = {}
  try {
    raw = JSON.parse(fs.readFileSync(dataFile, 'utf8')) as Partial<DB>
  } catch {
    /* primera ejecución o archivo ilegible: se parte de cero */
  }
  db = normalize(raw)
}

export const dataPath = (): string => dataFile
export const backupsDir = (): string => path.join(path.dirname(dataFile), 'backups')

/** Reemplaza todos los datos (importar): antes se guarda una copia de lo actual. */
export function replaceDb(raw: Partial<DB>): void {
  if (!Array.isArray(raw.tasks) || !Array.isArray(raw.entries)) throw new Error('El archivo no parece una exportación de Shutoki (faltan tareas u horas).')
  fs.copyFileSync(dataFile, path.join(path.dirname(dataFile), `data.pre-importacion-${Date.now()}.json`))
  db = normalize(raw)
  commit()
}
export function save(): void {
  const tmp = dataFile + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
  fs.renameSync(tmp, dataFile)
  // copia de seguridad diaria
  const bdir = path.join(path.dirname(dataFile), 'backups')
  const bfile = path.join(bdir, `data-${dayKey(new Date())}.json`)
  if (!fs.existsSync(bfile)) {
    fs.mkdirSync(bdir, { recursive: true })
    fs.copyFileSync(dataFile, bfile)
  }
}

export function push(): void {
  for (const w of targets) if (!w.isDestroyed()) w.webContents.send('state', db)
}

/** Envía un evento a todas las ventanas con contenido (principal y de chat), no a la flotante. */
export function broadcast(channel: string, payload?: unknown): void {
  for (const w of targets) if (!w.isDestroyed()) w.webContents.send(channel, payload)
}

export function commit(): void {
  save()
  push()
}

export const uid = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
