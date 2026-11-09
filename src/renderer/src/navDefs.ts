import type { View } from './ui'

/** Secciones del menú lateral: [vista, icono, nombre]. Su orden y visibilidad se configuran en Apariencia. */
export const NAV_GROUPS: Array<{ title: string; items: Array<[View, string, string]> }> = [
  {
    title: 'Trabajo',
    items: [
      ['today', '☀', 'Panel'],
      ['board', '▦', 'Tablero'],
      ['workspace', '▥', 'Espacio'],
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
  },
  {
    title: 'Extras',
    items: [
      ['notes', '✎', 'Notas'],
      ['web', '🌐', 'Web'],
      ['music', '♫', 'Música'],
      ['whatsapp', '💬', 'WhatsApp']
    ]
  }
]
