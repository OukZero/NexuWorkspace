import { spawn, type ChildProcess } from 'child_process'

/** Estado de cierre compartido: distingue «cerrar la ventana» (se oculta a la bandeja) de salir de verdad. */
export const lifecycle = { quitting: false }

// Procesos de larga duración (whisper, comandos de verificación…): en Windows no mueren con la app, hay que matarlos.
const tracked = new Set<ChildProcess>()

export function trackChild(c: ChildProcess): void {
  tracked.add(c)
  c.once('close', () => tracked.delete(c))
}

/** Mata los procesos registrados junto con todo su árbol. */
export function killTracked(): void {
  for (const c of tracked) if (c.pid) spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {})
  tracked.clear()
}
