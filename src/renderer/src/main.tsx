import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
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
import './styles/sorvo.css'
import './styles/glass.css'
import './styles/chat-glass.css'
import './styles/home-fx.css'
import './styles/fx.css'
import './styles/ambient.css'
import './styles/diagramas.css'
import { initFx } from './fx'

initTheme()
initFx()
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
  root.render(<StrictMode><ErrorBoundary>{new URLSearchParams(location.search).has('skills') ? <SkillsWindow /> : <App />}</ErrorBoundary></StrictMode>)
}
// sin esto, un fallo al arrancar deja solo el fondo y ningún mensaje
boot().catch((e: unknown) => {
  console.error(e)
  const box = document.createElement('pre')
  box.style.cssText = 'position:fixed;inset:0;margin:0;padding:24px;color:#fff;background:#000c;white-space:pre-wrap;overflow:auto'
  box.textContent = 'No se pudo iniciar la app:\n\n' + (e instanceof Error ? e.stack ?? e.message : String(e))
  document.body.appendChild(box)
})
