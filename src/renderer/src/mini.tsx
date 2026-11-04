import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Mini } from './components/Mini'
import { initStore } from './store'
import { initTheme } from './theme'
import './styles/mini.css'

initTheme()
void initStore().then(() => {
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <Mini />
    </StrictMode>
  )
})
