import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { VideoLogin, VideoProject, VideoStep } from '../../../shared/types'
import { DEFAULT_VIDEO_STYLE } from '../../../shared/videoStyle'
import { useUi } from '../ui'
import '../styles/videos.css'

const ACTIONS: Array<[VideoStep['action'], string]> = [['goto', 'Ir a URL'], ['click', 'Clic'], ['fill', 'Escribir'], ['press', 'Tecla'], ['scroll', 'Desplazar'], ['wait', 'Esperar']]
const TARGET_HINT: Record<VideoStep['action'], string> = { goto: 'URL', click: 'Selector', fill: 'Selector', press: '—', scroll: 'Píxeles (ej. 400)', wait: 'Milisegundos (ej. 1500)' }
const NOTES_HINT = ['1. Clic en «Iniciar sesión»', '2. Escribir usuario y contraseña y entrar', '3. Abrir el módulo Clientes', '4. Rellenar el formulario y guardar'].join('\n')
const src = (p: VideoProject): string => `shutoki-video://v/${p.id}/${p.file}?t=${p.rev ?? p.createdAt}`
const DRAFT = 'vd-draft'
const STYLE = 'vd-style'

interface Brief { url: string; goal: string; notes: string; model: string; useLogin: boolean; loginUrl: string; showLogin: boolean; voice: string }
const EMPTY: Brief = { url: '', goal: '', notes: '', model: 'sonnet', useLogin: false, loginUrl: '', showLogin: false, voice: 'dalia' }
const briefOf = (p: VideoProject): Brief => ({ url: p.url, goal: p.goal, notes: p.notes ?? '', model: p.model ?? 'sonnet', useLogin: !!p.useLogin, loginUrl: p.loginUrl ?? '', showLogin: !!p.showLogin, voice: p.voice ?? 'dalia' })
const loadDraft = (): Brief => {
  try { return { ...EMPTY, ...(JSON.parse(localStorage.getItem(DRAFT) ?? '{}') as Partial<Brief>) } } catch { return EMPTY }
}
/** Instrucciones numeradas igual que en el servidor, para mostrar cuáles cubre el guion. */
const itemsOf = (notes: string): string[] => notes.split(/\r?\n/).map((l) => l.replace(/^\s*(?:\d+\s*[.)\-:]|[-*•])\s*/, '').trim()).filter(Boolean)

export function VideosView(): ReactNode {
  const ui = useUi()
  const [list, setList] = useState<VideoProject[]>([])
  const [sel, setSel] = useState<string | null>(null) // null = video nuevo (borrador)
  const [brief, setBrief] = useState<Brief>(loadDraft)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [style, setStyle] = useState(() => localStorage.getItem(STYLE) ?? DEFAULT_VIDEO_STYLE)
  const [showStyle, setShowStyle] = useState(false)
  const [proj, setProj] = useState<VideoProject | null>(null)
  const [busy, setBusy] = useState<'' | 'script' | 'record' | 'remux'>('')
  const [progress, setProgress] = useState('')
  const [frame, setFrame] = useState('') // último fotograma de la grabación en curso (vista en vivo)
  const [saved, setSaved] = useState('')
  const creds = useRef(new Map<string, { user: string; password: string }>()) // solo en memoria: nunca a disco ni a la IA
  const lastSaved = useRef('')

  const reload = async (): Promise<void> => setList((await ui.run('video:list')) ?? [])
  useEffect(() => { void reload() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => window.api.onVideoProgress((p) => (p.frame ? setFrame(p.frame) : setProgress(p.text))), [])

  const set = <K extends keyof Brief>(k: K, v: Brief[K]): void => setBrief((b) => ({ ...b, [k]: v }))
  const items = useMemo(() => itemsOf(brief.notes), [brief.notes])

  const login = (): VideoLogin | undefined => (brief.useLogin && password ? { user, password, loginUrl: brief.loginUrl.trim() || undefined, showLogin: brief.showLogin } : undefined)
  const full = (p: VideoProject): VideoProject => ({ ...p, ...brief, goal: brief.goal, url: brief.url, loginUrl: brief.loginUrl.trim() || undefined, style })

  // cambia de video conservando credenciales (en memoria) y borrador
  const open = (p: VideoProject | null): void => {
    creds.current.set(sel ?? 'new', { user, password })
    const c = creds.current.get(p?.id ?? 'new')
    setUser(c?.user ?? '')
    setPassword(c?.password ?? '')
    setSel(p?.id ?? null)
    setProj(p)
    setBrief(p ? briefOf(p) : loadDraft())
    if (p?.style) setStyle(p.style)
    setProgress('')
    lastSaved.current = p ? JSON.stringify(full0(p)) : ''
  }
  // lo que se compara para el autoguardado: lo guardado en disco del proyecto
  const full0 = (p: VideoProject): VideoProject => ({ ...p, ...briefOf(p), style: p.style ?? style })

  // el borrador del video nuevo y el estilo sobreviven a cerrar la ventana
  useEffect(() => { if (sel === null) localStorage.setItem(DRAFT, JSON.stringify(brief)) }, [sel, brief])
  useEffect(() => { localStorage.setItem(STYLE, style) }, [style])

  // autoguardado de cualquier cambio (campos, título y pasos) para no perder nada
  useEffect(() => {
    if (!proj || busy) return
    const next = full(proj)
    const key = JSON.stringify(next)
    if (key === lastSaved.current) return
    const t = setTimeout(() => {
      void window.api.call('video:save', next).then((s) => {
        lastSaved.current = JSON.stringify(full(s))
        setSaved(new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }))
        setList((l) => l.map((x) => (x.id === s.id ? s : x)))
      }).catch(() => undefined)
    }, 700)
    return () => clearTimeout(t)
  }, [proj, brief, style, busy]) // eslint-disable-line react-hooks/exhaustive-deps

  const makeScript = async (): Promise<void> => {
    if (proj && !(await ui.confirm('Se reemplazarán los pasos actuales por un guion nuevo. ¿Continuar?', { confirmLabel: 'Regenerar' }))) return
    setBusy('script')
    setProgress('')
    const p = await ui.run('video:script', { url: brief.url, goal: brief.goal, login: login(), model: brief.model, notes: brief.notes, id: proj?.id, style })
    setBusy('')
    if (!p) return
    if (!proj) localStorage.removeItem(DRAFT) // el borrador pasó a ser un video guardado
    creds.current.set(p.id, { user, password })
    setSel(p.id)
    setProj(p)
    lastSaved.current = JSON.stringify(full0({ ...p, style }))
    void reload()
  }

  const record = async (): Promise<void> => {
    if (!proj) return
    setBusy('record')
    setProgress('')
    setFrame('')
    await window.api.call('video:save', full(proj)).catch(() => undefined) // lo grabado = lo que ves
    const done = await ui.run('video:record', full(proj), login())
    setBusy('')
    setFrame('')
    if (done) { setProj(done); lastSaved.current = JSON.stringify(full0(done)); void reload() }
  }

  // reajusta el zoom con la grabación guardada: no abre el navegador ni regenera la voz
  const remux = async (): Promise<void> => {
    if (!proj) return
    setBusy('remux')
    setProgress('')
    await window.api.call('video:save', full(proj)).catch(() => undefined)
    const done = await ui.run('video:remux', full(proj))
    setBusy('')
    if (done) { setProj(done); lastSaved.current = JSON.stringify(full0(done)); void reload() }
  }

  const patchStep = (i: number, p: Partial<VideoStep>): void => {
    if (proj) setProj({ ...proj, steps: proj.steps.map((s, j) => (j === i ? { ...s, ...p } : s)) })
  }
  const moveStep = (i: number, d: number): void => {
    if (!proj) return
    const steps = [...proj.steps]
    const j = i + d
    if (j < 0 || j >= steps.length) return
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
    setProj({ ...proj, steps })
  }
  const addStep = (i: number): void => {
    if (!proj) return
    const steps = [...proj.steps]
    steps.splice(i + 1, 0, { action: 'click', target: '', say: '', item: proj.steps[i]?.item })
    setProj({ ...proj, steps })
  }
  const remove = async (p: VideoProject): Promise<void> => {
    if (!(await ui.confirm(`¿Eliminar «${p.title}» y su video?`, { danger: true, confirmLabel: 'Eliminar' }))) return
    await ui.run('video:delete', p.id)
    if (proj?.id === p.id) open(null)
    void reload()
  }

  // instrucciones del paso a paso que ningún paso del guion cubre (p. ej. tras editar o borrar pasos)
  const uncovered = proj ? items.map((_, i) => i + 1).filter((n) => !proj.steps.some((s) => s.item === n)) : []
  const canGen = !busy && brief.url.trim() && brief.goal.trim() && !(brief.useLogin && !password)

  return (
    <div className="vd">
      <section className="vd-new">
        <div className="vd-bar">
          <div className="eyebrow">{proj ? 'Datos del video' : 'Nuevo video'}</div>
          {proj && <button className="btn sm" onClick={() => open(null)} disabled={!!busy}>＋ Nuevo video</button>}
        </div>
        <label>URL de la app<input value={brief.url} onChange={(e) => set('url', e.target.value)} placeholder="http://localhost:5173" disabled={!!busy} /></label>
        <label>¿Qué funcionalidad quieres mostrar?<textarea rows={3} value={brief.goal} onChange={(e) => set('goal', e.target.value)} placeholder="Ej.: crear un cliente nuevo y verlo en el listado" disabled={!!busy} /></label>
        <label>
          Paso a paso (una instrucción por línea; la IA las hace TODAS, en orden)
          <textarea rows={6} value={brief.notes} onChange={(e) => set('notes', e.target.value)} placeholder={NOTES_HINT} disabled={!!busy} />
        </label>
        {items.length > 0 && <small className="vd-note">{items.length} instrucciones detectadas{proj && uncovered.length ? ` · sin cubrir en el guion: ${uncovered.join(', ')}` : proj ? ' · todas cubiertas ✓' : ''}</small>}
        <label>Generar el guion con<select value={brief.model} onChange={(e) => set('model', e.target.value)} disabled={!!busy}><option value="haiku">Claude Haiku — rápido y barato</option><option value="sonnet">Claude Sonnet — equilibrado (recomendado)</option><option value="opus">Claude Opus — el más preciso, gasta más</option></select></label>

        <div className="vd-style">
          <button className="btn ghost sm" onClick={() => setShowStyle((v) => !v)}>{showStyle ? '▾' : '▸'} Estilo del guion (prompt por defecto){style.trim() !== DEFAULT_VIDEO_STYLE ? ' · editado' : ''}</button>
          {showStyle && (
            <>
              <textarea rows={9} value={style} onChange={(e) => setStyle(e.target.value)} disabled={!!busy} aria-label="Estilo del guion" />
              <div className="vd-row">
                <button className="btn sm" onClick={() => setStyle(DEFAULT_VIDEO_STYLE)} disabled={!!busy || style === DEFAULT_VIDEO_STYLE}>Restaurar el de por defecto</button>
              </div>
              <small className="vd-note">Le indica a Claude cómo redactar la narración (tono, longitud, estructura). Se aplica a todos los videos nuevos y se guarda con cada video.</small>
            </>
          )}
        </div>

        <label className="vd-check"><input type="checkbox" checked={brief.useLogin} onChange={(e) => set('useLogin', e.target.checked)} disabled={!!busy} /> La app pide usuario y contraseña</label>
        {brief.useLogin && (
          <div className="vd-login">
            <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Usuario o correo" autoComplete="off" disabled={!!busy} />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" autoComplete="off" disabled={!!busy} />
            <input value={brief.loginUrl} onChange={(e) => set('loginUrl', e.target.value)} placeholder="URL del login (opcional)" disabled={!!busy} />
            <label className="vd-check"><input type="checkbox" checked={brief.showLogin} onChange={(e) => set('showLogin', e.target.checked)} disabled={!!busy} /> Mostrar el inicio de sesión en el video</label>
            <small>Usa una cuenta de pruebas. Usuario y contraseña NO se guardan en disco ni se envían a la IA (hay que volver a escribirlos al reabrir la app).</small>
          </div>
        )}
        <div className="vd-row">
          <button className="btn p" onClick={() => void makeScript()} disabled={!canGen}>{busy === 'script' ? 'Generando…' : proj ? '🔄 Regenerar guion' : '✨ Generar guion'}</button>
          {busy === 'script' && <button className="btn" onClick={() => void window.api.call('video:cancel')}>Cancelar</button>}
        </div>
        {busy === 'script' && <div className="vd-progress" role="status">{progress || 'Trabajando…'}</div>}
        {proj && <small className="vd-note">{saved ? `Cambios guardados automáticamente a las ${saved}.` : 'Los cambios se guardan solos.'}</small>}

        <div className="eyebrow vd-h">Videos anteriores <span className="tm-count">{list.length}</span></div>
        {list.length === 0 ? <p className="vd-empty">Aún no hay videos.</p> : (
          <ul className="vd-list">
            {list.map((p) => (
              <li key={p.id} className={proj?.id === p.id ? 'on' : ''}>
                <button onClick={() => open(p)} disabled={!!busy}><b>{p.title}</b><small>{new Date(p.createdAt).toLocaleDateString('es')} · {p.file ? 'con video' : 'solo guion'}</small></button>
                <button className="btn ghost sm" aria-label={`Eliminar ${p.title}`} onClick={() => void remove(p)} disabled={!!busy}>🗑</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="vd-main">
        {!proj ? (
          <div className="vd-empty-main"><b>🎬 Videos de funcionalidades</b><p>Escribe la URL, qué mostrar y el paso a paso: Claude arma el guion mirando la pantalla real, lo revisas y se graba con voz y subtítulos. Lo que escribes se conserva aunque cierres la ventana.</p></div>
        ) : (
          <>
            <input className="vd-title" value={proj.title} onChange={(e) => setProj({ ...proj, title: e.target.value })} aria-label="Título del video" />
            {proj.file && !busy && (
              <div className="vd-player">
                <video key={src(proj)} src={src(proj)} controls />
                <button className="btn sm" onClick={() => void ui.run('video:reveal', proj.id)}>Mostrar en el Explorador</button>
              </div>
            )}
            <div className="eyebrow">Guion · {proj.steps.length} pasos</div>
            {uncovered.length > 0 && <div className="vd-warn" role="alert">Estas instrucciones de tu paso a paso no tienen ningún paso en el guion: {uncovered.map((n) => `${n}. ${items[n - 1]}`).join(' · ')}. Añade pasos (＋) o regenera el guion.</div>}
            <ol className="vd-steps">
              {proj.steps.map((s, i) => (
                <li key={i}>
                  <div className="vd-step-h">
                    <span className="vd-n">{i + 1}</span>
                    {s.item ? <span className="vd-item" title={items[s.item - 1]}>instr. {s.item}</span> : null}
                    <select value={s.action} onChange={(e) => patchStep(i, { action: e.target.value as VideoStep['action'] })} disabled={!!busy}>{ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    {s.action !== 'press' && <input value={s.target ?? ''} onChange={(e) => patchStep(i, { target: e.target.value })} placeholder={TARGET_HINT[s.action]} disabled={!!busy} />}
                    {(s.action === 'fill' || s.action === 'press') && <input value={s.value ?? ''} onChange={(e) => patchStep(i, { value: e.target.value })} placeholder={s.action === 'press' ? 'Tecla (Enter, Tab…)' : 'Texto a escribir'} disabled={!!busy} />}
                    {(s.action === 'click' || s.action === 'fill') && (
                      <select className="vd-zoom" value={s.zoom ?? ''} onChange={(e) => patchStep(i, { zoom: (e.target.value || undefined) as VideoStep['zoom'] })} disabled={!!busy} aria-label="Zoom de este paso" title="Zoom de la cámara en este paso">
                        <option value="">🔍 Zoom auto</option>
                        <option value="off">Sin zoom</option>
                        <option value="in">Acercar siempre</option>
                      </select>
                    )}
                    <span className="vd-ops">
                      <button className="btn ghost sm" aria-label="Añadir paso debajo" onClick={() => addStep(i)} disabled={!!busy}>＋</button>
                      <button className="btn ghost sm" aria-label="Subir paso" onClick={() => moveStep(i, -1)} disabled={!!busy || i === 0}>↑</button>
                      <button className="btn ghost sm" aria-label="Bajar paso" onClick={() => moveStep(i, 1)} disabled={!!busy || i === proj.steps.length - 1}>↓</button>
                      <button className="btn ghost sm" aria-label="Quitar paso" onClick={() => setProj({ ...proj, steps: proj.steps.filter((_, j) => j !== i) })} disabled={!!busy}>✕</button>
                    </span>
                  </div>
                  <textarea rows={2} value={s.say} onChange={(e) => patchStep(i, { say: e.target.value })} placeholder="Narración (también sale como subtítulo)" disabled={!!busy} />
                </li>
              ))}
            </ol>
            <label className="vd-voice">Voz de la narración
              <select value={brief.voice} onChange={(e) => set('voice', e.target.value)} disabled={!!busy}>
                <option value="dalia">Dalia — mujer, México (natural)</option>
                <option value="jorge">Jorge — hombre, México (natural)</option>
                <option value="elvira">Elvira — mujer, España (natural)</option>
                <option value="alvaro">Álvaro — hombre, España (natural)</option>
                <option value="sapi">Voz del sistema (local, más robótica)</option>
              </select>
              <small className="vd-note">Las voces naturales usan el servicio de voz de Microsoft Edge: el texto de la narración se envía a internet para generarlas. Sin conexión se usa la voz del sistema.</small>
            </label>
            <div className="vd-row">
              <button className="btn p" onClick={() => void record()} disabled={!!busy || !proj.steps.length || (brief.useLogin && !password)}>{busy === 'record' ? 'Grabando…' : proj.file ? '🔁 Volver a grabar' : '⏺ Grabar video'}</button>
              {busy === 'record' && <button className="btn" onClick={() => void window.api.call('video:cancel')}>Cancelar</button>}
            </div>
            {proj.file && proj.session && !busy && (
              <div className="vd-row">
                <button className="btn" onClick={() => void remux()}>⚡ Aplicar cambios de zoom (sin volver a grabar)</button>
              </div>
            )}
            {(busy === 'record' || busy === 'remux') && <div className="vd-progress" role="status">{progress || 'Preparando…'}</div>}
            {busy === 'record' && frame && <img className="vd-live" src={`data:image/jpeg;base64,${frame}`} alt="Vista en vivo de la grabación" />}
            {!brief.useLogin && <small className="vd-note">Si la app pide sesión, marca «usuario y contraseña» a la izquierda antes de grabar.</small>}
          </>
        )}
      </section>
    </div>
  )
}
