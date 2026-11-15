// Actualiza los límites de la cuenta (ventana de 5 h y semana) bajo demanda.
// Claude Code solo informa esos límites dentro de una respuesta, así que se lanza una consulta mínima
// con el modelo más barato. Su consumo no se registra en el panel de consumo.
import os from 'os'
import { spawn } from 'child_process'
import { applyRateLimitEvent, cheapestModel, type StreamEvent } from './chat'
import { getDb } from './db'

const TIMEOUT_MS = 120_000
let inFlight: Promise<void> | null = null

/** Lanza la consulta (o espera a la que ya está en curso). Resuelve cuando los límites están guardados. */
export function refreshLimits(): Promise<void> {
  inFlight ??= probe().finally(() => {
    inFlight = null
  })
  return inFlight
}

function probe(): Promise<void> {
  const cmd = getDb().settings.claudeCmd
  const model = cheapestModel('claude')
  return new Promise((resolve, reject) => {
    const child = spawn(`${cmd}${model ? ` --model ${model}` : ''} -p --output-format stream-json --verbose`, {
      shell: true,
      cwd: os.tmpdir(), // fuera de cualquier proyecto: no ensucia la carpeta de trabajo
      windowsHide: true
    })
    let buf = ''
    let err = ''
    let found = false
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Claude Code tardó demasiado en responder. Inténtalo de nuevo.'))
    }, TIMEOUT_MS)

    child.stdout.on('data', (b: Buffer) => {
      buf += b
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line) continue
        try {
          const ev = JSON.parse(line) as StreamEvent
          if (ev.type === 'rate_limit_event' && applyRateLimitEvent(ev)) found = true
        } catch {
          /* línea que no es JSON */
        }
      }
    })
    child.stderr.on('data', (b: Buffer) => (err += b))
    child.stdin.on('error', () => undefined)
    child.stdin.end('Responde solo: ok')

    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (found) resolve()
      else reject(new Error(code !== 0 && err.trim() ? err.trim() : 'Claude Code no informó los límites de la cuenta. Revisa que tengas la sesión iniciada.'))
    })
  })
}
