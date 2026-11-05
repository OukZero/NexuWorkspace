import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export interface ConfirmRequest {
  message: string
  title?: string
  confirmLabel?: string
  danger?: boolean
}

/** Diálogo de confirmación con el estilo de la app. Esc cancela y Enter acepta. */
export function ConfirmDialog({ req, onAnswer }: { req: ConfirmRequest; onAnswer: (ok: boolean) => void }): ReactNode {
  const ok = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    ok.current?.focus()
    const key = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onAnswer(false)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onAnswer])

  return (
    <div className="modal confirm-modal" onMouseDown={(e) => e.target === e.currentTarget && onAnswer(false)}>
      <div className="dialog confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
        <div className={`confirm-icon ${req.danger ? 'danger' : ''}`} aria-hidden>
          {req.danger ? '!' : '?'}
        </div>
        <h2 id="confirm-title">{req.title ?? '¿Continuar?'}</h2>
        <p id="confirm-msg">{req.message}</p>
        <div className="confirm-actions">
          <button className="btn" onClick={() => onAnswer(false)}>
            Cancelar
          </button>
          <button ref={ok} className={`btn ${req.danger ? 'danger-solid' : 'primary'}`} onClick={() => onAnswer(true)}>
            {req.confirmLabel ?? 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  )
}
