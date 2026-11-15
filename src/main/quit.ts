import { app, BrowserWindow, globalShortcut } from 'electron'
import * as chat from './chat'
import { commit } from './db'
import { killTracked, lifecycle } from './lifecycle'
import { killPtysOf } from './pty'
import { stop as stopTelegram } from './telegram'
import { stopActive } from './timer'
import { destroyTray } from './tray'

/** Detiene todo lo que la app deja corriendo fuera de su ventana: chats, terminales, procesos de apoyo, timer y servicios. */
export function cleanup(): void {
  try {
    stopTelegram()
    chat.killAll()
    killPtysOf()
    killTracked()
    globalShortcut.unregisterAll()
    destroyTray()
  } catch {
    /* seguir cerrando aunque algo falle */
  }
}

/** Cierra la app de verdad (no a la bandeja): detiene el timer, guarda, limpia procesos y cierra todas las ventanas. */
export function quitApp(): void {
  lifecycle.quitting = true // sin esto «cerrar a la bandeja» impediría salir
  try {
    stopActive() // el timer no debe seguir contando con la app cerrada
    commit()
  } catch {
    /* sin datos que guardar */
  }
  cleanup()
  for (const w of BrowserWindow.getAllWindows()) w.destroy()
  app.quit()
  // si algo retrasa el cierre, se fuerza para que no quede ningún proceso en segundo plano
  setTimeout(() => app.exit(0), 4000).unref()
}
