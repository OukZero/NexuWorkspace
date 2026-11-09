import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { MAX_TABS, addTab, closeTab, selectTab, setTabUrl, takeWebRequest, useWebTabs } from '../webTabs'
import { G } from './glyphs'
import { WebPane } from './WebPane'
import { dropSlots } from './webHost'

const hostOf = (u?: string): string => {
  if (!u) return 'Nueva pestaña'
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}

/** Vista «Web»: pestañas con tus sitios (Outlook, Teams, GitHub, Jira…). Las páginas siguen vivas al cambiar de pestaña o de vista. */
export function WebView(): ReactNode {
  const wt = useWebTabs()
  const active = wt.tabs.find((t) => t.id === wt.active)

  // una dirección pedida desde fuera abre pestaña nueva; sin pestañas, se crea una vacía con tus sitios
  useEffect(() => {
    const u = takeWebRequest()
    if (u) addTab(u)
    else if (!wt.tabs.length) addTab()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // libera las páginas de pestañas cerradas
  const ids = wt.tabs.map((t) => `t-${t.id}`)
  const key = ids.join(',')
  useEffect(() => {
    dropSlots('t-', key ? key.split(',') : [])
  }, [key])

  return (
    <div className="webv">
      <div className="webv-tabs" role="tablist" aria-label="Pestañas web">
        {wt.tabs.map((t) => (
          <div key={t.id} className={`webv-tab ${t.id === wt.active ? 'on' : ''}`} role="tab" aria-selected={t.id === wt.active}>
            <button className="webv-t" onClick={() => selectTab(t.id)} title={t.url}>
              {hostOf(t.url)}
            </button>
            <button className="webv-x" aria-label="Cerrar la pestaña" title="Cerrar la pestaña" onClick={() => closeTab(t.id)}>
              <G n="x" size={12} />
            </button>
          </div>
        ))}
        <button className="mini" title={wt.tabs.length >= MAX_TABS ? `Máximo ${MAX_TABS} pestañas` : 'Nueva pestaña'} aria-label="Nueva pestaña" disabled={wt.tabs.length >= MAX_TABS} onClick={() => addTab()}>
          <G n="plus" size={15} />
        </button>
      </div>
      <div className="webv-body">{active ? <WebPane key={active.id} paneId={`t-${active.id}`} url={active.url} onUrl={(u) => setTabUrl(active.id, u)} /> : <div className="wsp-note">Abre una pestaña con «+».</div>}</div>
    </div>
  )
}
