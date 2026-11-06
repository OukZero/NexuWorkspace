import { createContext, useContext } from 'react'
import type { IpcChannels, Task } from '../../shared/types'

export type View = 'today' | 'board' | 'hours' | 'usage' | 'history' | 'redmine' | 'groups' | 'settings' | 'chat'

export interface Ui {
  view: View
  /** Última vista del panel (la que se muestra al salir de una tarea). */
  panel: View
  /** Tarea cuya pestaña está activa (solo con view === 'chat'). */
  activeTask: string | null
  /** Conversación visible dentro de la tarea activa. */
  activeConv: string | null
  quickTick: number // cambia cuando hay que enfocar la captura rápida
  go(v: View): void
  /** Abre la pestaña de la tarea (y su última conversación; si no tiene, crea una). */
  openChat(taskId: string, convId?: string): void
  /** Crea una conversación nueva en la tarea y la muestra. */
  newConversation(taskId: string): void
  /** Abre el diálogo del «+»: nueva conversación en esta tarea u otra tarea. */
  openNewTab(): void
  /** Abre la tarea del click según el modo configurado (chat, Claude Desktop o terminal). */
  openTask(t: Task): void
  editTask(t: Partial<Task>): void
  /** Abre la ficha de solo lectura de la tarea (con botón para editarla). */
  viewTask(taskId: string): void
  showDiff(file: string): void
  /** Abre un archivo en la pestaña «Archivos» de la tarea activa (ruta absoluta o relativa a sus carpetas). */
  openFile(path: string): void
  addEntry(day: string): void
  closeModal(): void
  /** Navega a un destino de notificación: una vista («hours», «daily»…) o «chat:<conversación>». */
  goto(target: string): void
  /** Aviso temporal; con `action` muestra un botón (p. ej. «Deshacer»). */
  toast(msg: string, err?: boolean, action?: { label: string; run: () => void }): void
  /** Pide confirmación con un diálogo de la app (reemplaza a confirm() del navegador). Resuelve true si el usuario acepta. */
  confirm(message: string, opts?: { title?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean>
  /** Terminal de la tarea: el panel integrado (como VS Code) o una ventana aparte, según Ajustes. Con sesión, retoma esa conversación. */
  openTerminal(taskId: string, sessionId?: string): void
  /** Confeti discreto al completar una tarea. */
  celebrate(): void
  openHelp(): void
  /** Llama al proceso principal; ante un error muestra un aviso y devuelve undefined. */
  run<K extends keyof IpcChannels>(name: K, ...args: IpcChannels[K]['args']): Promise<IpcChannels[K]['ret'] | undefined>
}

export const UiContext = createContext<Ui | null>(null)

export function useUi(): Ui {
  const ui = useContext(UiContext)
  if (!ui) throw new Error('UiContext no disponible')
  return ui
}
