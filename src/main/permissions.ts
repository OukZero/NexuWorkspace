// Comandos de shell que las conversaciones pueden ejecutar. Una sola lista (en Ajustes) se traduce a la sintaxis de cada proveedor.
import { getDb } from './db'

/** Comandos permitidos por el usuario (uno por línea en Ajustes). */
export function allowedCommands(): string[] {
  return [...new Set(getDb().settings.allowedCommands.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))]
}

// Bloqueo fijo: se aplica siempre y no se edita desde la interfaz. En ambos CLI la denegación gana a cualquier permiso.
const CLAUDE_BLOCKED = ['git push --force', 'git push -f', 'git push --force-with-lease', 'git reset --hard', 'git clean', 'rm -rf', 'rm -r', 'rmdir', 'del', 'Remove-Item', 'format']
// Copilot aprueba git por subcomando de primer nivel («git push»), así que el bloqueo es más amplio: cualquier push.
const COPILOT_BLOCKED = ['git push', 'git reset --hard', 'git clean', 'rm', 'rmdir', 'del', 'Remove-Item', 'format']

/** Reglas de Claude Code: Bash(comando:*). Con la política «all» se permite todo Bash; el bloqueo fijo sigue ganando. */
export const claudeAllow = (everything = false): string[] => [...(everything || getDb().settings.commandPolicy === 'all' ? ['Bash'] : []), ...allowedCommands().map((c) => `Bash(${c}:*)`)]
export const claudeDeny = (): string[] => CLAUDE_BLOCKED.map((c) => `Bash(${c}:*)`)

/** Reglas del CLI de Copilot: shell(...) (los comandos de varias palabras se comparan exactos; el resto por prefijo). */
const shell = (c: string): string => (c.includes(' ') ? `shell(${c})` : `shell(${c}:*)`)
export const copilotAllow = (everything = false): string[] => ['write', ...(everything || getDb().settings.commandPolicy === 'all' ? ['shell'] : []), ...allowedCommands().map(shell)]
export const copilotDeny = (): string[] => COPILOT_BLOCKED.map(shell)

// ---------- aprobación interactiva (Claude) ----------
const SPLIT = /&&|\|\||[;|\r\n]/
// programas cuyo subcomando importa: «git checkout» se aprueba aparte de «git push»
const SUBCOMMAND = new Set(['git', 'npm', 'npx', 'pnpm', 'yarn', 'dotnet', 'docker', 'kubectl', 'gh', 'az', 'aws'])

/** Regla que «Permitir siempre» agrega para un comando: el programa y, si procede, su subcomando. */
export function ruleFor(command: string): string | undefined {
  const [first, second] = command.trim().split(/\s+/)
  if (!first) return undefined
  return SUBCOMMAND.has(first) && second && !second.startsWith('-') ? `${first} ${second}` : first
}

/** ¿Todos los tramos del comando (separados por && || ; |) coinciden con comandos ya permitidos? */
export function isAllowed(command: string): boolean {
  const allowed = allowedCommands()
  const parts = command.split(SPLIT).map((p) => p.trim()).filter(Boolean)
  return parts.length > 0 && parts.every((p) => allowed.some((a) => p === a || p.startsWith(a + ' ')))
}

/** Agrega la regla a la lista permitida de Ajustes (sin duplicar). */
export function allowForever(rule: string): void {
  const s = getDb().settings
  if (!allowedCommands().includes(rule)) s.allowedCommands = `${s.allowedCommands.trimEnd()}\n${rule}`
}
