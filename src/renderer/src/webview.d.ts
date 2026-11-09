import type { DetailedHTMLProps, HTMLAttributes } from 'react'

// Etiqueta <webview> de Electron (páginas incrustadas, ver components/webHost.tsx)
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<HTMLAttributes<HTMLElement> & { src?: string; partition?: string; useragent?: string }, HTMLElement>
    }
  }
}
