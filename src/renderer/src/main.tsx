import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { SkillsWindow } from './components/SkillsWindow'
import { initStore, peek } from './store'
import { hydrate, initTheme } from './theme'
import './styles/style.css'
import './styles/extra.css'

initTheme()
void initStore().then(() => {
  hydrate(peek()?.settings.appearance) // equipo sin preferencias guardadas: se toman las de los datos
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      {new URLSearchParams(location.search).has('skills') ? <SkillsWindow /> : <App />}
    </StrictMode>
  )
})
