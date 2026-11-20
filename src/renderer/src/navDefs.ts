import type { View } from './ui'

/** Secciones del menú lateral: [vista, icono, nombre]. Su orden y visibilidad se configuran en Apariencia. */
export const NAV_GROUPS: Array<{ title: string; items: Array<[View, string, string]> }> = [
  {
    title: 'Hoy',
    items: [
      ['today', '⌂', 'Inicio'],
      ['board', '▦', 'Tablero'],
      ['workspace', '▥', 'Espacio'],
      ['chat', '💬', 'Chats']
    ]
  },
  {
    title: 'Tiempo',
    items: [
      ['hours', '⏱', 'Horas'],
      ['redmine', '✓', 'Redmine'],
      ['dashboard', '▤', 'Productividad'],
      ['usage', '◔', 'Consumo IA']
    ]
  },
  {
    title: 'Herramientas',
    items: [
      ['notes', '✎', 'Notas'],
      ['meetings', '●', 'Reuniones'],
      ['team', '🧑‍💻', 'Equipo'],
      ['web', '🌐', 'Navegador'],
      ['music', '♫', 'Música'],
      ['groups', '🗂', 'Carpetas'],
      ['whatsapp', '💬', 'WhatsApp']
    ]
  }
]
