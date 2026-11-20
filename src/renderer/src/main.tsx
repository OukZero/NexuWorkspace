import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Login } from './components/Login'
import { SkillsWindow } from './components/SkillsWindow'
import { initStore, peek } from './store'
import { hydrate, initTheme } from './theme'
import '@fontsource/sora/600.css'
import '@fontsource/sora/700.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './styles/style.css'
import './styles/extra.css'
import './styles/cockpit.css'
import './styles/nuevo-diseno.css'
import './styles/equipo.css'

initTheme()
const root = createRoot(document.getElementById('root') as HTMLElement)

async function boot(): Promise<void> {
  const st = await window.api.call('auth:status')
  // si la sesión se inicia o se cierra (también por caducidad o acceso revocado) se recarga: o entra a la app o vuelve al login
  window.api.onAuth((s) => s.signedIn !== st.signedIn && location.reload())
  if (!st.signedIn) {
    root.render(
      <StrictMode>
        <Login status={st} />
      </StrictMode>
    )
    return
  }
  await initStore()
  hydrate(peek()?.settings.appearance) // equipo sin preferencias guardadas: se toman las de los datos
  root.render(<StrictMode>{new URLSearchParams(location.search).has('skills') ? <SkillsWindow /> : <App />}</StrictMode>)
}
void boot()
