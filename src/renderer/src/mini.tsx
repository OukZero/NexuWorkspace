import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Mini } from './components/Mini'
import { RecMini } from './components/RecMini'
import { initStore } from './store'
import { initTheme } from './theme'
import './styles/mini.css'

initTheme()

async function boot(): Promise<void> {
  const st = await window.api.call('auth:status')
  window.api.onAuth((s) => s.signedIn !== st.signedIn && location.reload())
  if (!st.signedIn) return // sin sesión la ventana flotante no muestra nada
  // ventana de grabación: no necesita el almacén de datos
  if (location.search.includes('rec=1')) {
    createRoot(document.getElementById('root') as HTMLElement).render(
      <StrictMode>
        <RecMini />
      </StrictMode>
    )
    return
  }
  await initStore()
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <Mini />
    </StrictMode>
  )
}
void boot()
