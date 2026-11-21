import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { UpdateState } from '../../../shared/types'
import { useUi } from '../ui'
import { G } from './glyphs'

/** Estado de las actualizaciones, siempre al día (llega por evento desde el proceso principal). */
export function useUpdate(): UpdateState | null {
  const [s, setS] = useState<UpdateState | null>(null)
  useEffect(() => {
    let alive = true
    void window.api.call('update:state').then((x) => alive && setS(x)).catch(() => undefined)
    const off = window.api.onUpdate((x) => setS(x))
    return () => {
      alive = false
      off()
    }
  }, [])
  return s
}

/** Aviso compacto para la barra lateral: solo aparece cuando hay algo que hacer. */
export function UpdateChip(): ReactNode {
  const s = useUpdate()
  const ui = useUi()
  const prev = useRef<string | undefined>(undefined)
  // aviso único cuando la descarga termina
  useEffect(() => {
    if (s?.status === 'ready' && prev.current && prev.current !== 'ready') ui.toast(`La versión ${s.version} está lista para instalar`, false, { label: 'Ver', run: () => ui.go('settings') })
    prev.current = s?.status
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.status])
  if (!s || !['available', 'downloading', 'ready'].includes(s.status)) return null
  const install = async (): Promise<void> => {
    if (await ui.confirm('La app se cerrará, instalará la versión nueva y volverá a abrirse. Tus tareas, horas y conversaciones no se tocan. Si hay un timer corriendo, queda registrado hasta este momento. Puede tardar unos segundos sin mostrar ninguna ventana.', { title: `Actualizar a ${s.version}`, confirmLabel: 'Reiniciar y actualizar' })) void ui.run('update:install')
  }
  return (
    <button
      className={`rb upd-rb ${s.status}`}
      aria-label="Actualización disponible"
      data-tip={s.status === 'downloading' ? `Descargando la versión ${s.version}…` : s.status === 'available' ? `Hay una versión nueva (${s.version}). Clic para descargarla` : `La versión ${s.version} está lista. Clic para reiniciar y actualizar`}
      onClick={() => (s.status === 'ready' ? void install() : s.status === 'available' ? void ui.run('update:download') : ui.go('settings'))}
    >
      <G n="download" />
      {s.status === 'downloading' && <span className="rb-badge">{s.percent ?? 0}</span>}
    </button>
  )
}

/** Panel completo de Ajustes: versión instalada, comprobación manual y descarga. */
export function UpdateCard(): ReactNode {
  const s = useUpdate()
  const ui = useUi()
  if (!s) return null
  const busy = s.status === 'checking' || s.status === 'downloading'
  const when = s.checkedAt ? new Date(s.checkedAt).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div className="upd-card">
      <div className="upd-row">
        <div className="grow">
          <b>Versión instalada: {s.current}</b>
          <div className="meta">
            {s.status === 'dev' && 'Estás ejecutando la app en modo desarrollo: las actualizaciones solo funcionan con la app instalada.'}
            {s.status === 'idle' && 'Aún no se ha comprobado.'}
            {s.status === 'checking' && 'Buscando versiones nuevas…'}
            {s.status === 'none' && `Estás al día${when ? ` · comprobado ${when}` : ''}.`}
            {s.status === 'available' && `Hay una versión nueva: ${s.version}.`}
            {s.status === 'downloading' && `Descargando la versión ${s.version}… ${s.percent ?? 0}%`}
            {s.status === 'ready' && `La versión ${s.version} está descargada y lista.`}
            {s.status === 'error' && <span style={{ color: 'var(--danger)' }}>{s.error}</span>}
          </div>
        </div>
        {s.status !== 'dev' && s.status !== 'ready' && s.status !== 'available' && (
          <button className="btn sm" disabled={busy} onClick={() => void ui.run('update:check')}>
            {s.status === 'checking' ? 'Buscando…' : 'Buscar ahora'}
          </button>
        )}
        {s.status === 'available' && (
          <button className="btn sm primary" onClick={() => void ui.run('update:download')}>
            Descargar {s.version}
          </button>
        )}
        {s.status === 'ready' && (
          <button
            className="btn sm primary"
            onClick={async () => {
              if (await ui.confirm('La app se cerrará, instalará la versión nueva y volverá a abrirse. Tus datos no se tocan. Puede tardar unos segundos sin mostrar ninguna ventana.', { title: `Actualizar a ${s.version}`, confirmLabel: 'Reiniciar y actualizar' })) void ui.run('update:install')
            }}
          >
            Reiniciar y actualizar
          </button>
        )}
      </div>
      {s.status === 'downloading' && (
        <div className="bar" style={{ marginTop: 8 }}>
          <i style={{ width: `${s.percent ?? 0}%` }} />
        </div>
      )}
      {s.notes && ['available', 'downloading', 'ready'].includes(s.status) && <div className="meta" style={{ marginTop: 8 }}>Novedades: {s.notes}</div>}
    </div>
  )
}
