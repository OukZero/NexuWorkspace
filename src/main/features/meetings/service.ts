import { app, desktopCapturer, session } from 'electron'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { Meeting, MeetingPatch, ModelStatus, MeetingStatus, MeetingTask, Priority } from '../../../shared/types'
import { clip } from '../../../shared/util'
import { getStatus, isSignedIn } from '../../auth'
import { commit, dataPath, getDb, uid } from '../../db'
import { trackChild } from '../../lifecycle'
import { askClaude } from '../ai/summary'

/**
 * Reuniones: el renderer captura el audio (micrófono + audio del sistema) y lo manda en trozos PCM 16-bit / 16 kHz / mono.
 * Aquí se guarda en disco, se envuelve en un WAV, se transcribe en local con whisper.cpp y Claude redacta el resumen.
 * Por privacidad el audio se borra tras transcribirlo, salvo que se pida conservarlo en Ajustes.
 */

const RATE = 16000
const BYTES_PER_SEC = RATE * 2
const ID = /^[A-Za-z0-9_-]{1,64}$/

interface Stored {
  id: string
  title: string
  taskId?: string
  createdAt: number
  durationMs: number
  status: MeetingStatus
  transcript: string
  summary: string
  error?: string
  proposals?: MeetingTask[]
}

/** Carpeta elegida en Ajustes o, por defecto, «meetings» junto a los datos de la app. */
const dir = (): string => getDb().settings.meetingsDir?.trim() || path.join(path.dirname(dataPath()), 'meetings')
const metaFile = (id: string): string => path.join(dir(), `${id}.json`)
const pcmFile = (id: string): string => path.join(dir(), `${id}.pcm`)
const wavFile = (id: string): string => path.join(dir(), `${id}.wav`)

const live = new Set<string>() // grabaciones en curso en esta sesión
const busy = new Set<string>() // reuniones que se están transcribiendo o resumiendo
const extracting = new Set<string>() // reuniones de las que se buscan tareas
let cache: Map<string, Stored> | null = null
let cacheDir = '' // carpeta de la que se cargó la caché: si cambia en Ajustes se vuelve a leer

function checkId(id: string): void {
  if (!ID.test(id)) throw new Error('Identificador de reunión no válido.')
}

function persist(m: Stored): void {
  fs.mkdirSync(dir(), { recursive: true })
  const tmp = metaFile(m.id) + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2), 'utf8')
  fs.renameSync(tmp, metaFile(m.id))
}

/** Cierra una grabación: envuelve el PCM acumulado en un WAV (sin cargarlo entero en memoria). */
function finalizeWav(id: string): number {
  const src = pcmFile(id)
  if (!fs.existsSync(src)) return 0
  const size = fs.statSync(src).size
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + size, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(BYTES_PER_SEC, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(size, 40)
  const out = fs.openSync(wavFile(id), 'w')
  const inp = fs.openSync(src, 'r')
  try {
    fs.writeSync(out, header)
    const buf = Buffer.alloc(1 << 20)
    for (;;) {
      const n = fs.readSync(inp, buf, 0, buf.length, null)
      if (!n) break
      fs.writeSync(out, buf, 0, n)
    }
  } finally {
    fs.closeSync(inp)
    fs.closeSync(out)
  }
  fs.rmSync(src, { force: true })
  return Math.round((size / BYTES_PER_SEC) * 1000)
}

function load(): Map<string, Stored> {
  if (cache && cacheDir === dir()) return cache
  cacheDir = dir()
  const map = new Map<string, Stored>()
  let files: string[] = []
  try {
    files = fs.readdirSync(dir())
  } catch {
    /* la carpeta aún no existe */
  }
  for (const f of files) {
    const id = f.replace(/\.json$/, '')
    if (!f.endsWith('.json') || !ID.test(id)) continue
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir(), f), 'utf8')) as Stored
      m.id = id
      // la app se cerró a mitad: la grabación se rescata y lo que estaba en proceso queda para reintentar
      if (m.status === 'recording') {
        m.durationMs = finalizeWav(id) || m.durationMs
        m.status = 'error'
        m.error = 'La aplicación se cerró durante la grabación. El audio se recuperó: pulsa «Reintentar» para transcribirlo.'
        persist(m)
      } else if (m.status === 'transcribing' || m.status === 'summarizing') {
        m.status = 'error'
        m.error = 'El proceso se interrumpió al cerrar la aplicación.'
        persist(m)
      }
      map.set(id, m)
    } catch {
      /* archivo ilegible: se ignora */
    }
  }
  cache = map
  return map
}

const get = (id: string): Stored => {
  checkId(id)
  const m = load().get(id)
  if (!m) throw new Error('Reunión no encontrada.')
  return m
}

const view = (m: Stored): Meeting => ({ ...m, hasAudio: fs.existsSync(wavFile(m.id)), extracting: extracting.has(m.id) })

function patch(m: Stored, p: Partial<Stored>): void {
  Object.assign(m, p)
  persist(m)
}

export const listMeetings = (): Meeting[] => [...load().values()].sort((a, b) => b.createdAt - a.createdAt).map(view)

export function startMeeting(title: string, taskId?: string): string {
  const m: Stored = {
    id: uid(),
    title: title.replace(/[\r\n]+/g, ' ').trim().slice(0, 120) || 'Reunión',
    taskId: taskId || undefined,
    createdAt: Date.now(),
    durationMs: 0,
    status: 'recording',
    transcript: '',
    summary: ''
  }
  persist(m)
  fs.writeFileSync(pcmFile(m.id), Buffer.alloc(0))
  load().set(m.id, m)
  live.add(m.id)
  return m.id
}

export function appendChunk(id: string, data: ArrayBuffer): void {
  checkId(id)
  if (!live.has(id)) throw new Error('Esta grabación ya no está en curso.')
  fs.appendFileSync(pcmFile(id), Buffer.from(data))
}

export function stopMeeting(id: string, durationMs: number): Meeting {
  const m = get(id)
  live.delete(id)
  liveState.delete(id)
  const real = finalizeWav(id)
  patch(m, { durationMs: real || Math.max(0, Math.round(durationMs)), status: 'transcribing', error: undefined })
  void run(id, 'full')
  return view(m)
}

export function updateMeeting(id: string, p: MeetingPatch): Meeting {
  const m = get(id)
  const next: Partial<Stored> = {}
  if (p.title !== undefined) next.title = p.title.replace(/[\r\n]+/g, ' ').trim().slice(0, 120) || 'Reunión'
  if (p.taskId !== undefined) next.taskId = p.taskId || undefined
  if (p.summary !== undefined) next.summary = p.summary
  if (p.transcript !== undefined) next.transcript = p.transcript
  if (p.proposals === null) next.proposals = undefined
  patch(m, next)
  return view(m)
}

export function deleteMeeting(id: string): void {
  const m = get(id)
  if (live.has(id) || busy.has(id)) throw new Error('La reunión está en curso; espera a que termine.')
  for (const f of [metaFile(id), pcmFile(id), wavFile(id)]) fs.rmSync(f, { force: true })
  load().delete(m.id)
}

/** `auto` repite la transcripción si el audio sigue en disco y, si no, solo el resumen. */
export function retryMeeting(id: string, want: 'auto' | 'summary'): Meeting {
  const m = get(id)
  if (live.has(id) || busy.has(id)) throw new Error('La reunión ya se está procesando.')
  const mode = want === 'auto' && fs.existsSync(wavFile(id)) ? 'full' : 'summary'
  if (mode === 'summary' && !m.transcript.trim()) throw new Error('No hay transcripción de la que resumir.')
  patch(m, { status: mode === 'summary' ? 'summarizing' : 'transcribing', error: undefined })
  void run(id, mode)
  return view(m)
}

// ---------- transcripción (whisper.cpp) ----------

const MODEL_NAME = 'ggml-small.bin'
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}`
const MODEL_MIN_BYTES = 400_000_000 // small pesa ~465 MB: un archivo menor es una descarga cortada

/** whisper-cli que viaja con la app (extraResources en la instalación; resources/whisper en desarrollo). */
const bundledExe = (): string => path.join(app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources'), 'whisper', 'whisper-cli.exe')
const modelsDir = (): string => path.join(process.env['LOCALAPPDATA'] || app.getPath('userData'), 'Shutoki', 'whisper', 'models')

let downloading: Promise<string> | null = null
let dlPercent = 0
let dlError = ''

const modelPath = (): string => path.join(modelsDir(), MODEL_NAME)
const modelPresent = (): boolean => fs.existsSync(modelPath()) && fs.statSync(modelPath()).size >= MODEL_MIN_BYTES

/** Estado del modelo por defecto para Ajustes (el renderer lo consulta mientras se descarga). */
export function modelStatus(): ModelStatus {
  return { present: modelPresent(), downloading: !!downloading, percent: dlPercent, error: dlError || undefined }
}

/** Lanza la descarga sin esperar: el progreso se lee con modelStatus(). */
export function startModelDownload(): void {
  if (!modelPresent()) downloadModel().catch(() => {}) // el error queda en dlError
}

/** Descarga el modelo por defecto una sola vez (a un .part que se renombra al terminar, para no dejar archivos a medias). */
function downloadModel(): Promise<string> {
  const dest = modelPath()
  if (modelPresent()) return Promise.resolve(dest)
  downloading ??= (async () => {
    fs.mkdirSync(modelsDir(), { recursive: true })
    const part = dest + '.part'
    dlPercent = 0
    dlError = ''
    try {
      const res = await fetch(MODEL_URL)
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      const total = Number(res.headers.get('content-length')) || 0
      let got = 0
      const src = Readable.fromWeb(res.body as never)
      src.on('data', (b: Buffer) => {
        got += b.length
        if (total) dlPercent = Math.min(99, Math.round((got / total) * 100))
      })
      await pipeline(src, fs.createWriteStream(part))
      if (fs.statSync(part).size < MODEL_MIN_BYTES) throw new Error('la descarga quedó incompleta')
      fs.renameSync(part, dest)
      dlPercent = 100
      return dest
    } catch (e) {
      fs.rmSync(part, { force: true })
      dlError = `No se pudo descargar el modelo de voz (${(e as Error).message}). Revisa la conexión y pulsa «Reintentar», o elige un modelo propio en Ajustes → IA.`
      throw new Error(dlError)
    } finally {
      downloading = null
    }
  })()
  return downloading
}

async function transcribe(wav: string): Promise<string> {
  const s = getDb().settings
  const exe = s.whisperCmd.trim() || bundledExe()
  if (!fs.existsSync(exe)) throw new Error(`No se encuentra el ejecutable de whisper: ${exe}`)
  let model = s.whisperModel.trim()
  if (!model) model = await downloadModel() // vacío = modelo por defecto, que se baja la primera vez
  else if (!fs.existsSync(model)) throw new Error(`No se encuentra el modelo de whisper: ${model}`)
  return runWhisper(exe, model, wav, s.whisperLang)
}

function runWhisper(exe: string, model: string, wav: string, lang: string): Promise<string> {
  const s = { whisperLang: lang }
  const base = wav.replace(/\.wav$/, '')
  const args = ['-m', model, '-f', wav, '-l', s.whisperLang.trim() || 'auto', '-nt', '-np', '-otxt', '-of', base]
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true })
    trackChild(child)
    let err = ''
    child.stderr.on('data', (b: Buffer) => (err = (err + b).slice(-2000)))
    child.on('error', (e) => reject(new Error(`No se pudo ejecutar whisper: ${e.message}`)))
    child.on('close', (code) => {
      const txt = base + '.txt'
      try {
        if (code !== 0) throw new Error(clip(err.trim(), 400) || `whisper terminó con el código ${code}`)
        const text = fs.readFileSync(txt, 'utf8')
        resolve(
          text
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .join('\n')
        )
      } catch (e) {
        reject(e as Error)
      } finally {
        fs.rmSync(txt, { force: true })
      }
    })
  })
}

// ---------- resumen (Claude) ----------

const CHUNK = 30000
const MAX_DIRECT = 40000

function splitText(t: string): string[] {
  const parts: string[] = []
  let cur = ''
  for (const line of t.split('\n')) {
    if (cur.length + line.length > CHUNK && cur) {
      parts.push(cur)
      cur = ''
    }
    cur += (cur ? '\n' : '') + line
  }
  if (cur) parts.push(cur)
  return parts
}

const FORMAT =
  'Redacta el resumen en español y en Markdown con estas secciones (omite las que no apliquen):\n' +
  '## Resumen\n(3 a 5 frases con lo esencial)\n## Temas tratados\n(viñetas)\n## Acuerdos y decisiones\n(viñetas)\n' +
  '## Tareas pendientes\n(viñetas con responsable y plazo si se mencionaron)\n## Preguntas abiertas\n(viñetas)\n' +
  'La transcripción es automática y puede tener errores de reconocimiento: no inventes datos, nombres ni cifras que no estén en ella. ' +
  'Responde SOLO con el resumen, sin introducción.'

async function summarizeTranscript(title: string, transcript: string, cmd: string): Promise<string> {
  let source = transcript
  if (transcript.length > MAX_DIRECT) {
    // reunión larga: primero se condensa cada tramo y luego se resume el conjunto
    const notes: string[] = []
    for (const part of splitText(transcript)) {
      notes.push(
        await askClaude(
          'Estas son notas de un tramo de la reunión «' + title + '». Extrae en viñetas todo lo relevante: temas, decisiones, acuerdos, tareas con responsable y dudas. ' +
            'Es una transcripción automática con posibles errores; no inventes nada. Responde SOLO con las viñetas.\n\n' +
            part,
          cmd,
          300000,
          'sonnet'
        )
      )
    }
    source = notes.join('\n\n')
  }
  const out = await askClaude(`Resume la reunión «${title}» a partir de ${source === transcript ? 'su transcripción' : 'las notas de sus tramos'}.\n${FORMAT}\n\n${source}`, cmd, 300000, 'sonnet')
  return out.replace(/\r/g, '').trim()
}

// ---------- tareas propuestas ----------

const plain = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Nombres con los que te nombran: los de Ajustes o, si están vacíos, las partes del correo de la sesión (martin.escobedo@… → martin, escobedo). */
function myNames(): string[] {
  const set = getDb().settings.myNames.split(/[,;\n]/).map(plain).filter(Boolean)
  if (set.length) return set
  const local = (getStatus().email || '').split('@')[0]
  return local.split(/[._\-+\d]+/).map(plain).filter((p) => p.length > 2)
}

const isMine = (owner: string, names: string[]): boolean => {
  const o = plain(owner)
  return !!o && names.some((n) => o.includes(n) || (o.length > 2 && n.includes(o)))
}

const PRIORITIES = new Set(['high', 'med', 'low'])

function parseTasks(raw: string, names: string[]): MeetingTask[] {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let arr: unknown
  try {
    arr = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const out: MeetingTask[] = []
  for (const x of arr as Record<string, unknown>[]) {
    const title = typeof x?.title === 'string' ? x.title.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
    if (!title) continue
    const owner = typeof x.owner === 'string' ? x.owner.trim().slice(0, 80) : ''
    const prio = typeof x.priority === 'string' && PRIORITIES.has(x.priority) ? (x.priority as Priority) : 'med'
    out.push({ title, description: typeof x.description === 'string' ? x.description.trim().slice(0, 1000) : '', priority: prio, owner, mine: isMine(owner, names) })
  }
  return out.slice(0, 30)
}

/** Pide a Claude las tareas que salieron en la reunión. Solo las propone: crearlas es decisión del usuario. */
async function extractTasks(m: Stored): Promise<void> {
  const names = myNames()
  const source = m.transcript.length <= MAX_DIRECT && m.transcript.trim() ? m.transcript : m.summary
  if (!source.trim()) throw new Error('No hay nada de lo que extraer tareas.')
  const who = names.length ? `El usuario aparece en la reunión como: ${names.join(', ')}. ` : ''
  const raw = await askClaude(
    `De la reunión «${m.title}» extrae las tareas de trabajo concretas que quedaron pendientes (acuerdos con una acción a realizar). ${who}` +
      'Para cada una indica quién es el responsable tal como se le nombra ("" si nadie fue asignado). ' +
      'La transcripción es automática y puede escribir mal los nombres: no inventes tareas ni responsables que no se mencionaron.\n' +
      'Responde SOLO con un arreglo JSON, sin texto alrededor ni bloques de código, con objetos {"title": "verbo en infinitivo + qué (máx. 100 caracteres)", ' +
      '"description": "contexto breve", "priority": "high|med|low", "owner": "nombre o vacío"}. Si no hay tareas, responde [].\n\n' +
      source,
    getDb().settings.claudeCmd,
    180000,
    'sonnet' // los nombres mal transcritos y los responsables piden más criterio
  )
  patch(m, { proposals: parseTasks(raw, names) })
}

export function extractMeeting(id: string): Meeting {
  const m = get(id)
  if (live.has(id) || busy.has(id)) throw new Error('La reunión ya se está procesando.')
  busy.add(id)
  extracting.add(id)
  void extractTasks(m)
    .catch((e) => patch(m, { error: `No se pudieron extraer las tareas: ${(e as Error).message}` }))
    .finally(() => {
      busy.delete(id)
      extracting.delete(id)
    })
  return view(m)
}

export function createMeetingTasks(id: string, tasks: MeetingTask[]): number {
  const m = get(id)
  const db = getDb()
  let n = 0
  for (const t of tasks) {
    const title = String(t.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
    if (!title) continue
    db.tasks.push({
      id: uid(),
      title,
      description: [String(t.description ?? '').trim(), `Origen: reunión «${m.title}»${t.owner ? ` · responsable: ${t.owner}` : ''}`].filter(Boolean).join('\n\n'),
      project: '',
      client: '',
      folder: '',
      priority: PRIORITIES.has(t.priority) ? t.priority : 'med',
      estimateMin: 0,
      status: 'next',
      recurrence: { type: 'none' },
      createdAt: Date.now(),
      doneAt: null
    })
    n++
  }
  if (n) commit()
  patch(m, { proposals: undefined })
  return n
}

/** Hay una grabación en curso (la usa el calendario para no empezar otra encima). */
export const isRecording = (): boolean => live.size > 0

// ---------- preguntas mientras se escucha ----------
// Bajo demanda (no periódico, para no gastar uso de la IA): se transcribe solo el audio nuevo desde la última vez
// con whisper (local, gratis) y Haiku propone preguntas útiles a partir de lo dicho hasta ahora.
const liveState = new Map<string, { offset: number; text: string; asked: string[]; busy: boolean }>()

function wavFrom(pcm: Buffer): Buffer {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(RATE, 24)
  h.writeUInt32LE(BYTES_PER_SEC, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

export async function liveQuestions(id: string): Promise<string[]> {
  checkId(id)
  if (!live.has(id)) throw new Error('Esta grabación ya no está en curso.')
  const st = liveState.get(id) ?? { offset: 0, text: '', asked: [], busy: false }
  liveState.set(id, st)
  if (st.busy) throw new Error('Ya se están preparando preguntas.')
  st.busy = true
  const tmp = path.join(dir(), `${id}.live.wav`)
  try {
    // lo grabado desde la última vez (los trozos del renderer llegan cada ~4 s, así que puede faltar la cola más reciente)
    const size = fs.statSync(pcmFile(id)).size & ~1
    if (size - st.offset >= BYTES_PER_SEC * 5) {
      const fd = fs.openSync(pcmFile(id), 'r')
      const buf = Buffer.alloc(size - st.offset)
      try {
        fs.readSync(fd, buf, 0, buf.length, st.offset)
      } finally {
        fs.closeSync(fd)
      }
      fs.writeFileSync(tmp, wavFrom(buf))
      const text = await transcribe(tmp)
      st.offset = size
      if (text.trim()) st.text += (st.text ? '\n' : '') + text
    }
    if (st.text.trim().length < 80) throw new Error('Todavía hay poco audio transcrito para sugerir preguntas. Prueba de nuevo en un minuto.')
    const before = st.asked.length ? `\nPreguntas ya sugeridas (no las repitas):\n${st.asked.map((q) => `- ${q}`).join('\n')}\n` : ''
    const raw = await askClaude(
      'Estás escuchando una reunión en curso. A partir de lo dicho hasta ahora, propón de 3 a 5 preguntas breves y útiles que el usuario podría hacer a continuación: ' +
        'aclarar dudas, concretar plazos, responsables, cifras o decisiones que quedaron ambiguas. La transcripción es automática y puede tener errores: no inventes datos.' +
        `${before}\nResponde SOLO con un arreglo JSON de textos, sin bloques de código.\n\n${clip(st.text.slice(-12000), 12000)}`,
      getDb().settings.claudeCmd,
      90000
    )
    const m = raw.match(/\[[\s\S]*\]/)
    const arr = m ? (JSON.parse(m[0]) as unknown) : []
    const qs = (Array.isArray(arr) ? arr : []).filter((q): q is string => typeof q === 'string').map((q) => q.trim().slice(0, 200)).filter(Boolean).slice(0, 5)
    st.asked.push(...qs)
    return qs
  } finally {
    st.busy = false
    fs.rmSync(tmp, { force: true })
  }
}

/** Copias legibles (.md y .txt) de la reunión en la carpeta de reuniones, para abrirlas sin la app. Un fallo aquí no debe romper la reunión. */
function saveReadable(m: Stored): void {
  try {
    const d = new Date(m.createdAt)
    const p = (n: number): string => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}`
    const name = m.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Reunión'
    const body = `# ${m.title}\n\n${d.toLocaleString('es')}\n\n## Resumen\n\n${m.summary.trim()}\n\n## Transcripción\n\n${m.transcript.trim()}\n`
    const base = path.join(dir(), `${stamp} ${name} (${m.id.slice(0, 6)})`)
    fs.writeFileSync(`${base}.md`, body, 'utf8')
    fs.writeFileSync(`${base}.txt`, `${m.title}\n${d.toLocaleString('es')}\n\nRESUMEN\n${m.summary.trim()}\n\nTRANSCRIPCIÓN\n${m.transcript.trim()}\n`, 'utf8')
  } catch {
    /* carpeta sin permisos o llena: queda el JSON */
  }
}

async function run(id: string, mode: 'full' | 'summary'): Promise<void> {
  const m = load().get(id)
  if (!m || busy.has(id)) return
  busy.add(id)
  try {
    if (mode === 'full') {
      if (!fs.existsSync(wavFile(id))) throw new Error('No hay audio que transcribir.')
      patch(m, { status: 'transcribing', error: undefined })
      const text = await transcribe(wavFile(id))
      patch(m, { transcript: text })
      if (!getDb().settings.meetingKeepAudio) fs.rmSync(wavFile(id), { force: true })
    }
    if (!m.transcript.trim()) throw new Error('No se detectó voz en la grabación.')
    patch(m, { status: 'summarizing', error: undefined })
    const summary = await summarizeTranscript(m.title, m.transcript, getDb().settings.claudeCmd)
    patch(m, { summary, status: 'done', error: undefined })
    saveReadable(m)
    if (getDb().settings.meetingAutoTasks) {
      // las propuestas son un extra: si fallan, el resumen ya está listo
      extracting.add(id)
      try {
        await extractTasks(m)
      } catch {
        /* se puede pedir a mano con «Buscar tareas» */
      } finally {
        extracting.delete(id)
      }
    }
  } catch (e) {
    patch(m, { status: 'error', error: (e as Error).message })
  } finally {
    busy.delete(id)
  }
}

/** Retención: con «conservar audio» activo, borra los WAV de reuniones ya terminadas que superan los días indicados (0 = nunca). */
function sweepAudio(): void {
  const s = getDb().settings
  const days = Number(s.meetingAudioDays) || 0
  if (!s.meetingKeepAudio || days <= 0) return
  const limit = Date.now() - days * 86_400_000
  for (const m of load().values()) {
    if (m.status !== 'done' || live.has(m.id) || busy.has(m.id)) continue
    try {
      if (fs.statSync(wavFile(m.id)).mtimeMs < limit) fs.rmSync(wavFile(m.id), { force: true })
    } catch {
      /* sin audio: nada que borrar */
    }
  }
}

/** Mueve las reuniones existentes (metadatos, audio y .md) a otra carpeta y la deja como carpeta de guardado. Devuelve cuántas movió. */
export function moveMeetings(dest: string): number {
  if (live.size || busy.size) throw new Error('Hay una reunión grabándose o procesándose: espera a que termine.')
  const from = path.resolve(dir())
  const to = path.resolve(dest)
  if (from === to) return 0
  fs.mkdirSync(to, { recursive: true })
  let n = 0
  let files: string[] = []
  try {
    files = fs.readdirSync(from)
  } catch {
    /* aún no había carpeta */
  }
  for (const f of files) {
    if (!/\.(json|wav|pcm|md)$/i.test(f)) continue
    const a = path.join(from, f)
    const b = path.join(to, f)
    if (fs.existsSync(b)) continue // no pisa nada que ya hubiera allí
    try {
      fs.renameSync(a, b)
    } catch {
      fs.copyFileSync(a, b) // entre discos rename falla (EXDEV)
      fs.rmSync(a, { force: true })
    }
    if (f.endsWith('.json')) n++
  }
  getDb().settings.meetingsDir = to
  commit()
  cache = null
  return n
}

/** Permite capturar el audio del sistema (la voz del cliente en Teams, Meet, Zoom…) con getDisplayMedia, sin selector de pantalla. */
export function initMeetings(): void {
  sweepAudio()
  setInterval(sweepAudio, 6 * 3_600_000)
  session.defaultSession.setDisplayMediaRequestHandler(
    (_req, cb) => {
      if (!isSignedIn()) return cb({})
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => cb(sources[0] ? { video: sources[0], audio: 'loopback' } : {}))
        .catch(() => cb({}))
    },
    { useSystemPicker: false }
  )
}
