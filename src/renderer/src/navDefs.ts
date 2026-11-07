import type { View } from './ui'

/** Secciones del menú lateral: [vista, icono, nombre]. Su orden y visibilidad se configuran en Apariencia. */
export const NAV_GROUPS: Array<{ title: string; items: Array<[View, string, string]> }> = [
  {
    title: 'Trabajo',
    items: [
      ['today', '☀', 'Hoy'],
      ['board', '▦', 'Tablero'],
      ['groups', '🗂', 'Carpetas'],
      ['history', '☰', 'Historial']
    ]
  },
  {
    title: 'Registro',
    items: [
      ['hours', '⏱', 'Horas'],
      ['redmine', '✓', 'Redmine'],
      ['usage', '◔', 'Consumo']
    ]
  }
]
