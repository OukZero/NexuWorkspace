import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { WebLink, WebState } from '../../../shared/types'
import { normalizeWebUrl } from '../../../shared/util'
import { queueChatDraft } from '../chatDraft'
import { activeEntry, useDB } from '../store'
import { isWorkTask } from '../utils'
import { useUi } from '../ui'
import { G } from './glyphs'
import { WebAnchor, navAction, navigate, readState } from './webHost'

const newId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

const hostOf = (u: string): string => {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}

/** Panel «Web»: barra de direcciones, navegación y sitios guardados; la página es nativa (sesión compartida y persistente). */
export function WebPane({ paneId, url, onUrl }: { paneId: string; url?: string; onUrl: (u: string | undefined) => void }): ReactNode {
  const db = useDB()
  const ui = useUi()
  const links = db.settings.webLinks ?? []
  const [addr, setAddr] = useState(url ?? '')
  const [st, setSt] = useState<WebState | null>(null)
  const editing = useRef(false)
  const onUrlRef = useRef(onUrl)
  onUrlRef.current = onUrl

  // lee el estado de la página (dirección, título, historial) mientras el panel está a la vista
  useEffect(() => {
    if (!url) return
    let off = false
    const tick = (): void => {
      if (off) return
      const n = readState(paneId)
      if (!n) return
      setSt((p) => (p && p.url === n.url && p.title === n.title && p.canBack === n.canBack && p.canForward === n.canForward && p.loading === n.loading ? p : n))
      if (n.url && !editing.current) setAddr(n.url)
      if (n.url && n.url !== url && /^https?:/.test(n.url)) onUrlRef.current(n.url) // recuerda la última página
    }
    tick()
    const t = setInterval(tick, 900)
    return () => {
      off = true
      clearInterval(t)
    }
  }, [paneId, url])

  const saveLinks = (next: WebLink[]): void => void ui.run('settings:save', { webLinks: next })
  const saved = st?.url ? links.find((l) => l.url === st.url) : undefined

  const go = async (e?: FormEvent): Promise<void> => {
    e?.preventDefault()
    editing.current = false
    const u = normalizeWebUrl(addr)
    if (!u) return ui.toast('Escribe una dirección válida, por ejemplo outlook.office.com', true)
    navigate(paneId, u) // si la página ya está viva se lleva allí; si no, se crea con esta dirección
    onUrl(u)
  }
  const open = async (u: string): Promise<void> => {
    setAddr(u)
    // si la página del panel sigue viva (se volvió a la lista), hay que llevarla a este sitio
    const n = normalizeWebUrl(u) ?? u
    navigate(paneId, n)
    onUrl(n)
  }
  // tarea a la que se pregunta: la del timer, la que está en curso o la primera de hoy
  const askClaude = (): void => {
    const t = activeEntry(db)?.taskId ?? db.tasks.find((x) => isWorkTask(x) && x.status === 'doing')?.id ?? db.tasks.find((x) => isWorkTask(x) && x.status === 'today')?.id ?? db.tasks.find((x) => isWorkTask(x) && x.status !== 'done')?.id
    if (!t) return ui.toast('Crea una tarea para poder preguntarle a Claude.', true)
    queueChatDraft({ taskId: t, kinds: ['web'], text: 'Revisa la página que tengo abierta en el panel Web (va en el contexto). Resúmela y señálame lo importante o lo que parezca incorrecto. Si quieres que mire algo en concreto, escríbelo aquí: ' })
    ui.openChat(t)
  }
  const toggleSave = (): void => {
    if (!st?.url) return
    if (saved) return saveLinks(links.filter((l) => l.id !== saved.id))
    saveLinks([...links, { id: newId(), name: (st.title || hostOf(st.url)).slice(0, 40), url: st.url }])
    ui.toast('Sitio guardado')
  }

  const bar = (
    <form className="web-bar" onSubmit={(e) => void go(e)}>
      {url && (
        <>
          <button type="button" className="mini" title="Atrás" aria-label="Atrás" disabled={!st?.canBack} onClick={() => navAction(paneId, 'back')}>
            <G n="back" size={15} />
          </button>
          <button type="button" className="mini" title="Adelante" aria-label="Adelante" disabled={!st?.canForward} onClick={() => navAction(paneId, 'forward')}>
            <G n="chevron" size={15} />
          </button>
          <button type="button" className="mini" title={st?.loading ? 'Detener' : 'Recargar'} aria-label={st?.loading ? 'Detener' : 'Recargar'} onClick={() => navAction(paneId, st?.loading ? 'stop' : 'reload')}>
            <G n={st?.loading ? 'x' : 'reset'} size={15} />
          </button>
        </>
      )}
      <input
        className="web-addr"
        value={addr}
        placeholder="Escribe una dirección, por ejemplo outlook.office.com"
        aria-label="Dirección"
        spellCheck={false}
        onFocus={(e) => {
          editing.current = true
          e.currentTarget.select()
        }}
        onBlur={() => (editing.current = false)}
        onChange={(e) => setAddr(e.target.value)}
      />
      {url && (
        <>
          <button type="button" className={`mini ${saved ? 'on' : ''}`} title={saved ? 'Quitar de los sitios guardados' : 'Guardar este sitio'} aria-label={saved ? 'Quitar de los sitios guardados' : 'Guardar este sitio'} aria-pressed={!!saved} onClick={toggleSave}>
            {saved ? '★' : '☆'}
          </button>
          <button type="button" className="mini" title="Preguntar a Claude sobre esta página" aria-label="Preguntar a Claude sobre esta página" onClick={askClaude}>
            <G n="sparkle" size={15} />
          </button>
          <button type="button" className="mini" title="Abrir en el navegador" aria-label="Abrir en el navegador" onClick={() => st?.url && void window.api.call('url:open', st.url)}>
            <G n="popout" size={15} />
          </button>
          <button type="button" className="mini" title="Volver a tus sitios" aria-label="Volver a tus sitios" onClick={() => onUrl(undefined)}>
            <G n="list" size={15} />
          </button>
        </>
      )}
    </form>
  )

  return (
    <div className="web">
      {bar}
      {url ? (
        <WebAnchor slot={{ id: paneId, partition: 'persist:web', kind: 'web', url }} className="web-host" />
      ) : (
        <div className="web-start">
          <b>Tus sitios</b>
          {links.length ? (
            <div className="web-links">
              {links.map((l) => (
                <div key={l.id} className="web-link">
                  <button className="web-open" title={l.url} onClick={() => void open(l.url)}>
                    <span className="web-ico" aria-hidden>
                      {hostOf(l.url).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="web-nm">{l.name}</span>
                    <small>{hostOf(l.url)}</small>
                  </button>
                  <button className="ib web-rm" title="Quitar" aria-label={`Quitar ${l.name}`} onClick={() => saveLinks(links.filter((x) => x.id !== l.id))}>
                    <G n="x" size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="meta">Aún no has guardado sitios. Abre uno desde la barra de direcciones y pulsa ☆ para guardarlo.</div>
          )}
        </div>
      )}
    </div>
  )
}
