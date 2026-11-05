import { shell } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile, execFileSync, spawn } from 'child_process'
import type { Task } from '../shared/types'
import { getDb } from './db'
import { effectiveTask, groupAccess } from './groups'

export function renderPrompt(t: Task): string {
  const base = getDb()
    .settings.promptTemplate.replace(/{{title}}/g, t.title || '')
    .replace(/{{description}}/g, t.description || '')
    .replace(/{{project}}/g, t.project || '')
    .replace(/{{client}}/g, t.client || '')
    .trim()
  // las subtareas pendientes se agregan solas: Claude sabe qué falta
  const pending = (t.subtasks ?? []).filter((s) => !s.done)
  return pending.length ? `${base}\n\nSubtareas pendientes:\n${pending.map((s) => `- ${s.text}`).join('\n')}` : base
}

// ---------- terminales ----------
let wtInstalled: boolean | null = null
function hasWindowsTerminal(): boolean {
  if (wtInstalled === null) {
    try {
      execFileSync('where.exe', ['wt.exe'], { stdio: 'ignore' })
      wtInstalled = true
    } catch {
      wtInstalled = false
    }
  }
  return wtInstalled
}

interface Launch {
  ps: string // script de PowerShell
  cmd?: string // equivalente para cmd.exe; sin él, se usa PowerShell aunque se haya elegido cmd
  title?: string
}

/** Abre la terminal elegida en Ajustes (Windows Terminal, PowerShell o cmd) en `cwd`, ejecutando el script. */
function openTerminal(l: Launch, cwd?: string): void {
  const pref = getDb().settings.terminal ?? 'auto'
  let kind = pref === 'auto' ? (hasWindowsTerminal() ? 'wt' : 'powershell') : pref
  if (kind === 'cmd' && !l.cmd) kind = 'powershell'
  if (kind === 'wt' && !hasWindowsTerminal()) kind = 'powershell'
  const b64 = Buffer.from(l.ps, 'utf16le').toString('base64')
  const ps = ['-NoExit', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', b64]
  const opts = { cwd, detached: true, stdio: 'ignore' as const, windowsHide: true }
  let argv: string[]
  if (kind === 'wt') argv = ['wt.exe', ...(cwd ? ['-d', cwd] : []), ...(l.title ? ['--title', l.title] : []), 'powershell.exe', ...ps]
  else if (kind === 'cmd') argv = ['cmd.exe', '/k', l.cmd as string]
  else argv = ['powershell.exe', ...ps]
  spawn('cmd.exe', ['/c', 'start', '', ...argv], opts).unref()
}

const q = (s: string): string => s.replace(/'/g, "''") // comillas simples de PowerShell

/**
 * Terminal en la carpeta de la tarea. Con `sessionId`, retoma esa conversación (`claude --resume`) con los mismos
 * grupos de carpetas; sin él, solo se posiciona en la carpeta.
 */
export function openTerminalHere(original: Task, sessionId?: string): void {
  const task = effectiveTask(original)
  const { settings } = getDb()
  if (!task.folder || !fs.existsSync(task.folder)) throw new Error('La carpeta del proyecto no existe: ' + (task.folder || '(vacía)'))
  const resume = sessionId && /^[\w-]+$/.test(sessionId) ? `${settings.claudeCmd} --resume ${sessionId} ${groupAccess(task).args.join(' ')}`.trim() : ''
  openTerminal(
    {
      ps: `Set-Location -LiteralPath '${q(task.folder)}'; $Host.UI.RawUI.WindowTitle = '${q(task.title)}'${resume ? `; & ${resume}` : ''}`,
      cmd: `cd /d "${task.folder}"${resume ? ` && ${resume}` : ''}`,
      title: task.title
    },
    task.folder
  )
}

export function openClaude(original: Task): void {
  const task = effectiveTask(original)
  const { settings } = getDb()
  if (!task.folder || !fs.existsSync(task.folder)) {
    throw new Error('La carpeta del proyecto no existe: ' + (task.folder || '(vacía)'))
  }
  if (settings.openMode !== 'terminal') {
    // Claude Desktop (pestaña Code): precarga carpeta y prompt; hay que confirmar la carpeta y enviar
    const url = `claude://code/new?folder=${encodeURIComponent(task.folder)}&q=${encodeURIComponent(renderPrompt(task).slice(0, 13000))}`
    void shell.openExternal(url)
    return
  }
  const dir = path.join(os.tmpdir(), 'mis-tareas')
  fs.mkdirSync(dir, { recursive: true })
  const pfile = path.join(dir, `prompt-${task.id}.txt`)
  fs.writeFileSync(pfile, renderPrompt(task), 'utf8')
  openTerminal(
    {
      // el prompt viaja por archivo: cmd no sabe pasar textos largos con comillas, así que aquí siempre es PowerShell
      ps:
        `Set-Location -LiteralPath '${q(task.folder)}'; ` +
        `$Host.UI.RawUI.WindowTitle = '${q(task.title)}'; ` +
        `$p = Get-Content -Raw -Encoding UTF8 -LiteralPath '${q(pfile)}'; ` +
        `& ${settings.claudeCmd} $p`,
      title: task.title
    },
    task.folder
  )
}

/** Terminal visible con `claude auth login` (el login es interactivo y abre el navegador). */
export function openLogin(): void {
  openTerminal({ ps: `$Host.UI.RawUI.WindowTitle = 'Claude: iniciar sesión'; & ${getDb().settings.claudeCmd} auth login`, title: 'Claude: iniciar sesión' })
}

export function openVSCode(folder: string): void {
  if (!folder || !fs.existsSync(folder)) throw new Error('La carpeta no existe')
  spawn('cmd.exe', ['/c', 'code', folder], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
}

// ---------- git: commits del día ----------
export function gitCommits(folder: string, day: string): Promise<string[]> {
  return new Promise((resolve) => {
    if (!folder || !fs.existsSync(path.join(folder, '.git'))) return resolve([])
    execFile(
      'git',
      ['log', '--all', '--no-merges', `--since=${day} 00:00`, `--until=${day} 23:59:59`, '--author=' + (getDb().settings.gitAuthor || ''), '--pretty=format:%s'],
      { cwd: folder, timeout: 8000 },
      (err, out) => resolve(err ? [] : out.split('\n').filter(Boolean))
    )
  })
}
