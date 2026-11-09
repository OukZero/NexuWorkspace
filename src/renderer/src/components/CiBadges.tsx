import { useState } from 'react'
import type { ReactNode } from 'react'
import type { CiStatus, Task } from '../../../shared/types'
import { ciLabel, useCi } from '../ci'
import { useUi } from '../ui'

const REVIEW = { approved: 'aprobado', changes: 'cambios pedidos', pending: 'sin revisar' } as const

function failed(st: CiStatus): string {
  return st.checks.filter((c) => c.state === 'failure').map((c) => c.name).join(', ')
}

/** Rama de la tarea con su CI y su PR, en una línea. No dibuja nada si la tarea no tiene rama. */
export function CiBadges({ task }: { task: Task }): ReactNode {
  const ci = useCi()
  if (!task.branch) return null
  const st = ci[task.id]
  const pr = st?.pr
  const stale = !!st?.error
  return (
    <>
      <span className="chip br" title={`Rama de trabajo: ${task.branch}`}>
        ⎇ {task.branch.length > 28 ? '…' + task.branch.slice(-27) : task.branch}
      </span>
      {st && st.state !== 'none' && (
        <span className={`chip ci ci-${st.state}`} title={st.state === 'failure' ? `Falló: ${failed(st)}` : `${ciLabel[st.state]} · ${st.checks.length} checks${stale ? ' (sin conexión, dato anterior)' : ''}`}>
          <i aria-hidden /> {st.state === 'success' ? 'CI ✓' : st.state === 'failure' ? 'CI ✗' : 'CI…'}
        </span>
      )}
      {pr && (
        <span className={`chip pr pr-${pr.state}${pr.review === 'changes' ? ' pr-changes' : ''}`} title={`PR #${pr.number} · ${pr.state === 'open' ? REVIEW[pr.review] : pr.state === 'merged' ? 'fusionado' : 'cerrado'}${pr.conflicts ? ' · con conflictos' : ''}${pr.comments ? ` · ${pr.comments} comentarios` : ''}`}>
          PR #{pr.number}
          {pr.state === 'merged' ? ' · fusionado' : pr.state === 'closed' ? ' · cerrado' : pr.draft ? ' · borrador' : pr.review !== 'pending' ? ` · ${REVIEW[pr.review]}` : ''}
          {pr.conflicts ? ' ⚠' : ''}
        </span>
      )}
    </>
  )
}

const ICON = { success: '✓', failure: '✗', pending: '…', skipped: '–' } as const

/** Panel de CI de la rama de la tarea: lista de checks, enlaces y atajos para llevar el fallo a la IA. */
export function CiPanel({ taskId }: { taskId: string }): ReactNode {
  const ui = useUi()
  const ci = useCi()
  const [busy, setBusy] = useState(false)
  const st = ci[taskId]
  if (!st || (st.state === 'none' && !st.pr && !st.error)) return null

  const refresh = async (): Promise<void> => {
    setBusy(true)
    await ui.run('ci:refresh', taskId)
    // empuja el nuevo estado al hook sin esperar al ciclo de 20 s
    await window.api.call('ci:all').catch(() => undefined)
    setBusy(false)
  }
  const ask = async (): Promise<void> => {
    const text = await ui.run('ci:failure', taskId)
    if (!text) return ui.toast('No hay checks fallidos que mostrar')
    await navigator.clipboard.writeText(text)
    ui.toast('Fallo copiado. También puedes activar «Resultado de CI» en el contexto del chat.')
  }
  const failedCount = st.checks.filter((c) => c.state === 'failure').length
  return (
    <div className={`gci gci-${st.state}`}>
      <div className="gci-h">
        <b>
          {st.state === 'success' ? 'CI en verde' : st.state === 'failure' ? `CI falló (${failedCount})` : st.state === 'pending' ? 'CI en curso…' : 'CI'}
        </b>
        <span className="meta">
          {st.checks.length} checks · {new Date(st.ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
          {st.error ? ' · sin conexión con GitHub' : ''}
        </span>
        <span className="sp" />
        <button className="btn sm" disabled={busy} onClick={() => void refresh()}>
          {busy ? 'Consultando…' : '⟳ Actualizar'}
        </button>
        {failedCount > 0 && (
          <button className="btn sm" title="Copia el nombre, resumen y anotaciones de los checks fallidos" onClick={() => void ask()}>
            Copiar fallo
          </button>
        )}
      </div>
      {st.pr?.conflicts && <div className="gci-warn">El PR tiene conflictos con la rama base.</div>}
      {st.checks.length > 0 && (
        <ul className="gci-list">
          {st.checks.map((c, i) => (
            <li key={`${c.name}-${i}`} className={`s-${c.state}`}>
              <span className="gci-ic">{ICON[c.state]}</span>
              <span className="gci-n">{c.name}</span>
              {c.url && (
                <button className="ctx-link" onClick={() => void ui.run('url:open', c.url!)}>
                  Ver
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
