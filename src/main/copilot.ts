// Ejecución del CLI de GitHub Copilot (`copilot -p --output-format json`) y lectura de su uso.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'

/** Evento JSONL del CLI. Solo se tipan los campos que se usan; el resto se ignora. */
export interface CopilotEvent {
  type?: string
  sessionId?: string
  exitCode?: number
  data?: {
    deltaContent?: string
    content?: string
    toolRequests?: Array<Record<string, unknown>>
    message?: string
  }
  usage?: { premiumRequests?: number }
}

/** Uso final de una ejecución (archivo de --usage-output-file). */
export interface CopilotUsage {
  totalPremiumRequestCost?: number
  totalNanoAiu?: number
  tokenDetails?: Record<string, { tokenCount?: number }>
  currentModel?: string
  lastCallInputTokens?: number
  totalApiDurationMs?: number
}

const psq = (s: string): string => `'${s.replace(/'/g, "''")}'`

export interface Invocation {
  file: string
  argv: string[]
  usageFile: string
  sessionId: string
}

/**
 * Se lanza mediante PowerShell con el comando codificado (-EncodedCommand): el prompt viaja en base64 y no pasa por el
 * entrecomillado de cmd.exe (saltos de línea, comillas, acentos). PowerShell también resuelve copilot.cmd / .ps1 / .exe.
 */
export function buildInvocation(o: {
  cmd: string
  prompt: string
  sessionId: string | null
  model?: string
  allow: string[]
  deny: string[]
  addDirs: string[]
  images: string[]
}): Invocation {
  const sessionId = o.sessionId ?? randomUUID()
  const usageFile = path.join(os.tmpdir(), `shutoki-copilot-${sessionId}-${Date.now()}.json`)
  const args = ['--output-format', 'json', '--no-ask-user', '--session-id', sessionId, '--usage-output-file', usageFile]
  if (o.model && o.model !== 'default') args.push('--model', o.model)
  for (const a of o.allow) args.push(`--allow-tool=${a}`)
  for (const d of o.deny) args.push(`--deny-tool=${d}`)
  for (const d of o.addDirs) args.push('--add-dir', d)
  for (const i of o.images) args.push('--attachment', i)

  const b64 = Buffer.from(o.prompt, 'utf8').toString('base64')
  const script = [
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
    `$p = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}'))`,
    // Windows PowerShell 5.1 no escapa las comillas dobles de los argumentos nativos
    `& ${psq(o.cmd)} ${args.map(psq).join(' ')} -p ($p.Replace('"', '\\"'))`,
    'exit $LASTEXITCODE'
  ].join('\n')
  return {
    file: 'powershell.exe',
    argv: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    usageFile,
    sessionId
  }
}

/** Lee (y borra) el archivo de uso de una ejecución; null si no se generó. */
export function readUsage(file: string): CopilotUsage | null {
  try {
    const u = JSON.parse(fs.readFileSync(file, 'utf8')) as CopilotUsage
    fs.rmSync(file, { force: true })
    return u
  } catch {
    return null
  }
}
