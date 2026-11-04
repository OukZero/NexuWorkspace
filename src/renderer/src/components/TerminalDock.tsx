import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { attachTerminal, claimAutoTerminal, claimRequest, closeTerminal, createTerminal, getActive, isCreating, refit, setActive, useTerminals } from '../terminals'
import { useUi } from '../ui'

export interface TermRequest {
  taskId: string
  sessionId?: string
  nonce: number
}

interface Props {
  taskId: string
  request: TermRequest | null // «abre una terminal (retomando esta sesión)»
  height: number
  onHeight(h: number): void
  onClose(): void
}

/** Panel de terminal integrada, como el de VS Code: pestañas por tarea, altura ajustable y shells reales. */
export function TerminalDock({ taskId, request, height, onHeight, onClose }: Props): ReactNode {
  const ui = useUi()
  const all = useTerminals()
  const mine = all.filter((t) => t.taskId === taskId)
  const current = mine.find((t) => t.id === getActive(taskId)) ?? mine[mine.length - 1]
  const host = useRef<HTMLDivElement>(null)

  const make = async (sessionId?: string): Promise<void> => {
    try {
      const id = await createTerminal(taskId, sessionId)
      setActive(taskId, id)
    } catch (e) {
      ui.toast((e as Error).message, true)
    }
  }

  // una petición nueva (p. ej. «Continuar en terminal») o, si no hay ninguna terminal, la primera automática
  useEffect(() => {
    if (request && request.taskId === taskId && claimRequest(request.nonce)) {
      claimAutoTerminal(taskId)
      // «terminal normal» pedida mientras ya hay una (o se está creando la automática): basta con mostrarla
      if (!request.sessionId && (mine.length > 0 || isCreating(taskId))) return
      void make(request.sessionId)
      return
    }
    if (!mine.length && claimAutoTerminal(taskId)) void make()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce, taskId, mine.length])

  // monta la terminal visible y la reajusta cuando cambia el tamaño del panel
  useEffect(() => {
    const h = host.current
    if (!h || !current) return
    attachTerminal(current, h)
    const ro = new ResizeObserver(() => refit(current))
    ro.observe(h)
    return () => ro.disconnect()
  }, [current?.id])
  useEffect(() => {
    if (current) refit(current)
  }, [height, current])

  const startDrag = (e: React.MouseEvent): void => {
    e.preventDefault()
    const y0 = e.clientY
    const h0 = height
    const move = (ev: MouseEvent): void => onHeight(Math.min(window.innerHeight * 0.6, Math.max(120, h0 + (y0 - ev.clientY))))
    const up = (): void => {
      removeEventListener('mousemove', move)
      removeEventListener('mouseup', up)
    }
    addEventListener('mousemove', move)
    addEventListener('mouseup', up)
  }

  return (
    <section className="dock" style={{ height }} aria-label="Terminal integrada">
      <div className="dock-grip" onMouseDown={startDrag} title="Arrastra para cambiar la altura" />
      <div className="dock-head">
        <span className="dock-title">TERMINAL</span>
        <div className="dock-tabs" role="tablist">
          {mine.map((t, i) => (
            <div key={t.id} role="tab" aria-selected={current?.id === t.id} className={`dtab ${current?.id === t.id ? 'on' : ''}`} onClick={() => setActive(taskId, t.id)}>
              <span>
                {t.title} {i + 1}
                {t.exited ? ' (terminó)' : ''}
              </span>
              <button
                className="x"
                title="Cerrar esta terminal"
                aria-label="Cerrar terminal"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTerminal(t.id)
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button className="dtab plus" title="Nueva terminal en la carpeta de la tarea" aria-label="Nueva terminal" onClick={() => void make()}>
            ＋
          </button>
        </div>
        <span className="grow" />
        <button className="icon" title="Abrir en una ventana de terminal aparte" aria-label="Terminal externa" onClick={() => void ui.run('terminal:open', taskId)}>
          ↗
        </button>
        <button className="icon" title="Ocultar el panel (Ctrl+`)" aria-label="Ocultar el panel de terminal" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="dock-body" ref={host} />
    </section>
  )
}
