import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Mini } from './components/Mini'
import { initStore } from './store'
import { initTheme } from './theme'
import './styles/mini.css'

initTheme()

async function boot(): Promise<void> {
  const st = await window.api.call('auth:status')
  window.api.onAuth((s) => s.signedIn !== st.signedIn && location.reload())
  if (!st.signedIn) return // sin sesión la ventana flotante no muestra nada
  await initStore()
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <Mini />
    </StrictMode>
  )
}
void boot()
