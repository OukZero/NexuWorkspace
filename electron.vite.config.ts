import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Dos páginas de renderer: la ventana principal (index) y la flotante (mini).
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          mini: resolve(__dirname, 'src/renderer/mini.html')
        }
      }
    }
  }
})
