import type { ComponentType } from 'react'
import { Board } from './components/Board'
import { Dashboard } from './components/Dashboard'
import { Groups } from './components/Groups'
import { History } from './components/History'
import { Hours } from './components/Hours'
import { MeetingsView } from './components/MeetingsView'
import { MusicView } from './components/MusicView'
import { NotesView } from './components/NotesView'
import { RedmineView } from './components/RedmineView'
import { SettingsView } from './components/SettingsView'
import { TeamView } from './components/TeamView'
import { Usage } from './components/Usage'
import { WebView } from './components/WebView'
import { WhatsAppView } from './components/WhatsAppView'
import { Workspace } from './components/Workspace'
import type { View } from './ui'

/**
 * Registro de vistas sin parámetros: para añadir una pantalla basta con una entrada aquí
 * (más su `View` en ui.tsx y su sitio en navDefs.ts). `chat` y `today` las compone App.tsx
 * porque dependen del estado de las pestañas.
 */
export const VIEWS: Partial<Record<View, ComponentType>> = {
  board: Board,
  workspace: Workspace,
  hours: Hours,
  dashboard: Dashboard,
  usage: Usage,
  history: History,
  redmine: RedmineView,
  music: MusicView,
  notes: NotesView,
  meetings: MeetingsView,
  team: TeamView,
  web: WebView,
  whatsapp: WhatsAppView,
  groups: Groups,
  settings: SettingsView
}
