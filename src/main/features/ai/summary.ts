// Resumen de lo trabajado en Claude durante una entrada de tiempo.
// Lee las transcripciones locales (~/.claude/projects/<carpeta>/*.jsonl) del proyecto de la tarea.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import type { ChatMessage, SummaryMode } from '../../../shared/types'
import { clip } from '../../../shared/util'

const projectsDir = (): string => path.join(os.homedir(), '.claude', 'projects')
const encodeFolder = (f: string): string => f.replace(/[^a-zA-Z0-9]/g, '-')

function sessionFiles(folder: string, since: number): string[] {
  const dir = path.join(projectsDir(), encodeFolder(path.resolve(folder)))
  try {
    return fs
      .readdirSync(dir)
      .filter((n) => n.endsWith('.jsonl'))
      .map((n) => path.join(dir, n))
      .filter((p) => fs.statSync(p).mtimeMs >= since)
  } catch {
    return []
  }
}

interface Digest {
  asked: string[]
  said: string[]
  files: string[]
}

interface TranscriptPart {
  type?: string
  text?: string
  name?: string
  input?: { file_path?: string }
}
interface TranscriptLine {
  type?: string
  timestamp?: string
  isSidechain?: boolean
  message?: { content?: string | TranscriptPart[] }
}

// Extrae pedidos del usuario, respuestas de Claude y archivos tocados dentro de [from, to]
function digest(folder: string, from: number, to: number): Digest {
  const asked: string[] = []
  const said: string[] = []
  const files = new Set<string>()
  for (const file of sessionFiles(folder, from)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue
      let o: TranscriptLine
      try {
        o = JSON.parse(line) as TranscriptLine
      } catch {
        continue
      }
      const ts = Date.parse(o.timestamp ?? '')
      if (!ts || ts < from || ts > to || o.isSidechain) continue
      const content = o.message?.content
      const parts: TranscriptPart[] = Array.isArray(content) ? content : [{ type: 'text', text: content || '' }]
      if (o.type === 'user') {
        for (const p of parts) {
          if (p.type !== 'text' || !p.text || p.text.startsWith('<')) continue // ignora reminders/sistema
          asked.push(p.text.trim())
        }
      } else if (o.type === 'assistant') {
        for (const p of parts) {
          if (p.type === 'text' && p.text?.trim()) said.push(p.text.trim())
          if (p.type === 'tool_use' && p.name && ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(p.name) && p.input?.file_path) {
            files.add(path.relative(folder, p.input.file_path) || p.input.file_path)
          }
        }
      }
    }
  }
  return { asked, said, files: [...files] }
}

function buildText(d: Digest): string {
  const lines: string[] = []
  d.asked.slice(0, 12).forEach((a) => lines.push('PEDIDO: ' + clip(a, 500)))
  d.said.slice(-8).forEach((a) => lines.push('CLAUDE: ' + clip(a, 600)))
  if (d.files.length) lines.push('ARCHIVOS MODIFICADOS: ' + d.files.slice(0, 40).join(', '))
  return clip(lines.join('\n'), 12000)
}

// resumen sin IA: siempre disponible
function localSummary(d: Digest): string {
  const first = d.asked[0] ? clip(d.asked[0].replace(/\s+/g, ' '), 140) : 'Trabajo con Claude'
  const f = d.files.length ? ` Archivos: ${d.files.slice(0, 6).join(', ')}${d.files.length > 6 ? ` y ${d.files.length - 6} más` : ''}.` : ''
  return clip(`${first}.${f}`, 400)
}

// ejecuta `claude -p` con el prompt por stdin y devuelve la salida de texto
// Por defecto usa Haiku: son tareas de redacción corta en segundo plano. Quien necesite más calidad pasa 'sonnet'.
/** Opciones de ejecución: `signal` para detenerlo y `onProgress` para ver en vivo qué herramienta usa (activa stream-json). */
export interface AskRun {
  signal?: AbortSignal
  onProgress?: (line: string) => void
  /** Carpeta del proyecto: el agente la lee (Read/Glob/Grep) pero no puede editar. */
  cwd?: string
}

/** En Windows `child.kill()` solo mata el shell: hay que terminar el árbol entero. */
function killTree(child: ReturnType<typeof spawn>): void {
  if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  else child.kill()
}

const TOOL_LABEL: Record<string, string> = { Read: 'Leyendo', Edit: 'Editando', Write: 'Escribiendo', Glob: 'Buscando archivos', Grep: 'Buscando en el código', Bash: 'Ejecutando' }

/** Texto corto de lo que hace una herramienta, p. ej. «Leyendo src/app.ts». */
function toolLine(name: string, input: Record<string, unknown>): string {
  const target = String(input.file_path ?? input.path ?? input.pattern ?? input.command ?? '')
  return `${TOOL_LABEL[name] ?? name}${target ? ' ' + clip(target.replace(/\\/g, '/').split('/').slice(-2).join('/'), 60) : ''}`
}

export function askClaude(prompt: string, cmd: string, timeoutMs = 120000, model: string | null = 'haiku', edit?: { cwd: string }, readDir?: string, run?: AskRun): Promise<string> {
  return new Promise((resolve, reject) => {
    if (run?.signal?.aborted) return reject(new Error('Cancelado'))
    // con `edit`, Claude trabaja dentro de esa carpeta y puede editar archivos; el shell queda limitado a git de lectura y al typecheck
    let perms = edit ? ' --permission-mode acceptEdits --allowedTools "Read" "Edit" "Write" "Glob" "Grep" "Bash(git status*)" "Bash(git diff*)" "Bash(npm run typecheck*)"' : ''
    // con `readDir` (adjuntos / documentos de referencia) puede leer esa carpeta, y solo leer
    if (!edit && run?.cwd) perms += ' --allowedTools "Read" "Glob" "Grep"'
    if (readDir) perms += `${edit || run?.cwd ? '' : ' --allowedTools "Read"'} --add-dir "${readDir}"`
    const stream = !!run?.onProgress
    const child = spawn(`${cmd}${model ? ` --model ${model}` : ''}${perms}${stream ? ' --output-format stream-json --verbose' : ''} -p`, { shell: true, cwd: edit?.cwd ?? run?.cwd ?? os.tmpdir(), windowsHide: true })
    let out = ''
    let err = ''
    let buf = ''
    let final = ''
    let finished = false
    const end = (fn: () => void): void => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      run?.signal?.removeEventListener('abort', onAbort)
      fn()
    }
    const timer = setTimeout(() => {
      killTree(child)
      end(() => reject(new Error('timeout')))
    }, timeoutMs)
    const onAbort = (): void => {
      killTree(child)
      end(() => reject(new Error('Cancelado')))
    }
    run?.signal?.addEventListener('abort', onAbort)
    const onLine = (line: string): void => {
      try {
        const ev = JSON.parse(line) as { type?: string; result?: string; message?: { content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }> } }
        if (ev.type === 'result' && typeof ev.result === 'string') final = ev.result
        else if (ev.type === 'assistant') for (const p of ev.message?.content ?? []) if (p.type === 'tool_use' && p.name) run?.onProgress?.(toolLine(p.name, p.input ?? {}))
      } catch {
        /* línea que no es JSON */
      }
    }
    child.stdout.on('data', (b: Buffer) => {
      if (!stream) return void (out += b)
      buf += b
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      lines.forEach(onLine)
    })
    child.stderr.on('data', (b: Buffer) => (err += b))
    child.on('error', (e) => end(() => reject(e)))
    child.on('close', (code) => {
      if (stream && buf.trim()) onLine(buf)
      const text = (stream ? final : out).trim()
      end(() => (text && code === 0 ? resolve(text) : reject(new Error(err || 'sin salida'))))
    })
    child.stdin.end(prompt)
  })
}

function aiSummary(text: string, cmd: string): Promise<string> {
  const prompt =
    'Resume en español, en 1 o 2 frases (máx. 250 caracteres), qué trabajo se hizo en esta sesión de programación, ' +
    'con un tono neutro apto para una imputación de horas. Responde SOLO con el resumen, sin comillas ni encabezados.\n\n' +
    text
  return askClaude(prompt, cmd).then((out) => clip(out.replace(/\s+/g, ' '), 400))
}

/** Un comentario corto para Redmine a partir de las notas de una línea (una frase, en pasado). */
export async function summarizeNotes(notes: string[], claudeCmd: string): Promise<string> {
  const list = [...new Set(notes.map((n) => n.replace(/\s+/g, ' ').trim()).filter(Boolean))]
  const prompt =
    'Escribe en español UNA sola frase corta (máx. 200 caracteres) que resuma el trabajo realizado según estas notas de tiempo de una misma tarea. ' +
    'Tono neutro, apto para un comentario de imputación de horas. Responde SOLO con la frase, sin comillas ni viñetas.\n\n' +
    list.map((n) => '- ' + clip(n, 300)).join('\n')
  return clip((await askClaude(prompt, claudeCmd)).replace(/\s+/g, ' ').trim(), 240)
}

export interface SummaryResult {
  text: string
  mode: 'ai' | 'local'
}

// Resumen de una conversación del chat + archivos editados.
// Siempre intenta IA (el usuario lo pidió explícitamente) y cae a un resumen local si falla.
export async function summarizeConversation(opts: {
  messages: ChatMessage[]
  files: string[]
  claudeCmd: string
}): Promise<SummaryResult> {
  const { messages, files, claudeCmd } = opts
  const convo = messages.map((m) => (m.role === 'user' ? 'USUARIO: ' : 'CLAUDE: ') + clip(m.text.trim(), 900))
  let text = ''
  for (const l of convo.reverse()) {
    if ((text + l).length > 14000) break
    text = l + '\n\n' + text // prioriza lo más reciente
  }
  const fileLine = files.length ? `\n\nARCHIVOS MODIFICADOS: ${files.slice(0, 40).join(', ')}` : ''
  const prompt =
    'Resume en español qué se hizo en esta conversación de programación, para dejarlo como descripción del trabajo realizado en una tarea. ' +
    'Formato: entre 3 y 8 viñetas que empiecen con "- ", cada una en una línea, en pasado ("Se agregó…", "Se corrigió…"), concretas y sin relleno. ' +
    'Menciona archivos o módulos clave cuando aporte. Si quedó algo pendiente, añade al final una línea "Pendiente: …". ' +
    'Responde SOLO con las viñetas, sin encabezados ni comillas.\n\n' +
    text +
    fileLine
  try {
    const out = await askClaude(prompt, claudeCmd, 180000)
    return { text: clip(out.replace(/\r/g, '').trim(), 3000), mode: 'ai' }
  } catch {
    /* cae al resumen local */
  }
  const asked = messages.filter((m) => m.role === 'user').map((m) => '- ' + clip(m.text.replace(/\s+/g, ' ').trim(), 160))
  const f = files.length ? `\n- Archivos modificados: ${files.slice(0, 10).join(', ')}${files.length > 10 ? ` y ${files.length - 10} más` : ''}` : ''
  return { text: clip(asked.slice(0, 8).join('\n') + f, 3000), mode: 'local' }
}

// devuelve { text, mode } o null si no hubo actividad de Claude en ese rango
export async function summarize(opts: {
  folder: string
  from: number
  to: number
  mode: SummaryMode
  claudeCmd: string
}): Promise<SummaryResult | null> {
  const { folder, from, to, mode, claudeCmd } = opts
  if (!folder || mode === 'off') return null
  const d = digest(folder, from - 60000, to + 60000)
  if (!d.asked.length && !d.files.length) return null
  if (mode === 'ai') {
    try {
      return { text: await aiSummary(buildText(d), claudeCmd), mode: 'ai' }
    } catch {
      /* cae al resumen local */
    }
  }
  return { text: localSummary(d), mode: 'local' }
}
