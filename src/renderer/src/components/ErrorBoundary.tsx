import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Si una vista falla al pintarse, React desmonta todo y queda la pantalla en negro; aquí se muestra el error y se puede reintentar. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Error al pintar la vista:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div style={{ padding: 24, maxWidth: 720 }}>
        <h2>Esta vista ha fallado</h2>
        <p style={{ color: 'var(--muted)' }}>{error.message}</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, opacity: 0.8 }}>{(error.stack ?? '').split('\n').slice(0, 8).join('\n')}</pre>
        <button onClick={() => this.setState({ error: null })}>Reintentar</button>{' '}
        {/* tras errores de hooks por recarga en caliente, solo una recarga completa limpia el estado */}
        <button onClick={() => location.reload()}>Recargar la app</button>
      </div>
    )
  }
}
