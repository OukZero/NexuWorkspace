// Ejecución del CLI de Gemini (`gemini -p … --output-format stream-json`) con clave de API (GEMINI_API_KEY).
// La salida mezcla avisos de texto con líneas JSON: quien la lee debe ignorar lo que no sea JSON.

export interface GeminiEvent {
  type: string
  role?: string
  content?: string
  delta?: boolean
  status?: string
  error?: { message?: string } | string
}

/** Argumentos del CLI. El prompt va por stdin (evita el entrecomillado de Windows); -p solo indica modo no interactivo. */
export function geminiArgs(o: { sessionId: string; resume: boolean; model?: string; readOnly: boolean; agent: boolean }): string[] {
  // «plan» es solo lectura; «auto_edit» aprueba ediciones; sin aprobación interactiva en modo headless, nada más se ejecuta sin permiso
  const approval = o.readOnly ? 'plan' : o.agent ? 'auto_edit' : 'default'
  // se lanza con shell (gemini.cmd en Windows) y los argumentos se unen con espacios: el valor de -p va entrecomillado
  // la instrucción de -p evita que el modelo explore la carpeta por iniciativa propia: solo hace lo que pide el mensaje
  const args = ['-p', '"Responde en español al mensaje recibido por stdin. Haz solo lo que pida ese mensaje: no busques, no leas, no modifiques archivos ni ejecutes comandos si no se piden. Ante un saludo o una pregunta general, contesta directamente."','--output-format', 'stream-json', '--skip-trust', '--approval-mode', approval]
  // el CLI solo acepta --resume con «latest» o un índice; la sesión nueva se crea con el UUID que da la app
  if (o.resume) args.push('--resume', 'latest')
  else args.push('--session-id', o.sessionId)
  if (o.model) args.push('-m', o.model)
  return args
}

/** Línea de salida → evento, o null si no es JSON (avisos, mensajes de Ripgrep, etc.). */
export function parseGeminiLine(line: string): GeminiEvent | null {
  if (!line.startsWith('{')) return null
  try {
    return JSON.parse(line) as GeminiEvent
  } catch {
    return null
  }
}
