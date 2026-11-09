import type { ReactNode } from 'react'
import { useUi } from '../ui'

const KEYS: Array<[string, string]> = [
  ['Ctrl + K', 'Búsqueda global: tareas, conversaciones, vistas y acciones'],
  ['Ctrl + /', 'Mostrar esta ayuda'],
  ['Ctrl + Alt + N', 'Captura rápida de una tarea (funciona desde cualquier programa)'],
  ['Ctrl + `', 'Mostrar u ocultar la terminal integrada de la tarea (como en VS Code)'],
  ['Ctrl + Alt + T', 'Iniciar, pausar o reanudar el timer (en la tarea abierta)'],
  ['Ctrl + AvPág / RePág', 'Pasar a la pestaña de tarea siguiente / anterior'],
  ['N / P', 'En un diff: ir al cambio siguiente / anterior (con el visor enfocado)'],
  ['Esc', 'Cerrar el diálogo abierto'],
  ['Enter / Shift + Enter', 'En el chat: enviar / nueva línea'],
  ['/', 'En el chat: comandos de Claude (/compact, /context…); Tab completa'],
  ['Click central', 'Cierra una pestaña de tarea o de conversación'],
  ['Tab / Shift + Tab', 'Moverse entre botones y campos (el foco siempre es visible)']
]

export function HelpModal(): ReactNode {
  const ui = useUi()
  return (
    <div className="dialog" role="dialog" aria-label="Atajos de teclado">
      <h2>Atajos de teclado</h2>
      <table className="keys">
        <tbody>
          {KEYS.map(([k, d]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="foot">
        <span className="sp" />
        <button className="btn primary" onClick={ui.closeModal}>
          Entendido
        </button>
      </div>
    </div>
  )
}
