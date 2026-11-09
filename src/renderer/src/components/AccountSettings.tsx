import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthStatus } from '../../../shared/types'
import { useUi } from '../ui'

/** Cuenta: con quién se inició sesión y cierre de sesión. */
export function AccountSettings(): ReactNode {
  const ui = useUi()
  const [st, setSt] = useState<AuthStatus | null>(null)
  useEffect(() => {
    void window.api.call('auth:status').then(setSt)
    return window.api.onAuth(setSt)
  }, [])
  if (!st || st.disabled) return null // sin login activo no hay cuenta que mostrar
  return (
    <>
      <h3>Cuenta</h3>
      <div className="meta" style={{ maxWidth: 700, marginBottom: 8 }}>
        Sesión de {st?.email ?? '…'}
        {st?.offline ? ' (sin conexión: se revalidará al volver internet)' : ''}. Al cerrar sesión los datos locales se conservan en este equipo.
      </div>
      <button className="btn" onClick={() => void ui.run('auth:signOut')}>
        Cerrar sesión
      </button>
    </>
  )
}
