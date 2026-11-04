import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initStore } from './store'
import { initTheme } from './theme'
import './styles/style.css'
import './styles/extra.css'

initTheme()
void initStore().then(() => {
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
