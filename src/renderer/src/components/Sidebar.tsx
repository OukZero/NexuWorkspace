import * as Popover from '@radix-ui/react-popover'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  ACCENTS,
  PRESETS,
  getPreset,
  setPreset,
  getAccent,
  getDensity,
  getFontScale,
  getMode,
  getName,
  setAccent,
  setDensity,
  setFontScale,
  setMode,
  toggleDayNight,
  setName,
  navOrder,
  useAppearance,
  type Density,
  type ThemeMode
} from '../theme'
import { recElapsed, useRecording } from '../meetings'
import { useDB } from '../store'
import { useUi, type View } from '../ui'
import { UpdateChip } from './UpdateCard'
import { MiniPlayer } from './MiniPlayer'
import { TimerBar } from './TimerBar'
import { NotificationBell } from './NotificationBell'
import { CommandsBell } from './CommandsBell'
import { showSettingsTab } from './SettingsView'
import { NAV_GROUPS } from '../navDefs'
import { BackgroundPicker } from './BackgroundPicker'
import { G, type GlyphName } from './glyphs'


const THEMES: Array<[ThemeMode, string]> = [
  ['light', '☀ Día'],
  ['dark', '☾ Noche'],
  ['system', '⌂ Auto']
]

function initials(n: string): string {
  const p = n.trim().split(/\s+/).filter(Boolean)
  return (p.length ? p[0][0] + (p[1]?.[0] || '') : '?').toUpperCase()
}

function Profile({ wide }: { wide?: boolean }): ReactNode {
  const ui = useUi()
  const [open, setOpen] = useState(false)
  const [name, setNameState] = useState(getName())
  const [mode, setModeState] = useState<ThemeMode>(getMode())
  const [accent, setAccentState] = useState(getAccent())
  const [density, setDensityState] = useState<Density>(getDensity())
  const [font, setFontState] = useState(getFontScale())
  const [preset, setPresetState] = useState(getPreset())
  const choosePreset = (k: string): void => {
    setPreset(k)
    setPresetState(k)
  }

  const section = (title: string, children: ReactNode): ReactNode => (
    <section className="pm-sec">
      <h5>{title}</h5>
      {children}
    </section>
  )

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className={wide ? 'wide-user' : 'rail-av'} data-tip={wide ? undefined : name.trim() || 'Perfil y apariencia'} title={wide ? 'Perfil y apariencia' : undefined} aria-label="Perfil y apariencia">
          {wide ? (
            <>
              <span className="wide-av">{initials(name)}</span>
              <span className="wide-who">
                <b>{name.trim() || 'Tu nombre'}</b>
                <small>Perfil y apariencia</small>
              </span>
            </>
          ) : (
            initials(name)
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pmenu" side="bottom" align="end" sideOffset={10} collisionPadding={12}>
          <div className="pm-head">
            <span className="avatar big">{initials(name)}</span>
            <div className="grow">
              <small>Tu nombre</small>
              <input
                value={name}
                placeholder="Ej. Marti"
                maxLength={30}
                onChange={(e) => {
                  setNameState(e.target.value)
                  setName(e.target.value.trim())
                }}
              />
            </div>
          </div>
          <div className="pm-body">
            {section(
              'Tema',
              <>
                <div className="swatches">
                  <button
                    className={`swatch-btn style-btn ${preset === '' ? 'on' : ''}`}
                    style={{ background: 'linear-gradient(135deg, #0f1115 50%, #f4f5f9 50%)' }}
                    title="Clásico (día / noche)"
                    aria-label="Estilo clásico"
                    onClick={() => choosePreset('')}
                  />
                  {Object.entries(PRESETS).map(([k, p]) => (
                    <button
                      key={k}
                      className={`swatch-btn style-btn ${preset === k ? 'on' : ''}`}
                      style={{ background: `linear-gradient(135deg, ${p.swatch[0]} 45%, ${p.swatch[1]} 45% 70%, ${p.swatch[2]} 70%)` }}
                      title={p.label}
                      aria-label={`Estilo ${p.label}`}
                      onClick={() => choosePreset(k)}
                    />
                  ))}
                </div>
                {preset === '' && (
                  <div className="seg" style={{ marginTop: 8 }}>
                    {THEMES.map(([k, l]) => (
                      <button
                        key={k}
                        className={mode === k ? 'on' : ''}
                        onClick={() => {
                          setMode(k)
                          setModeState(k)
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                )}
                <small className="pm-lbl">Color de acento</small>
                <div className="swatches">
                  {Object.entries(ACCENTS).map(([k, [dark]]) => (
                    <button
                      key={k}
                      className={`swatch-btn ${accent === k ? 'on' : ''}`}
                      style={{ background: dark }}
                      title={k}
                      aria-label={`Acento ${k}`}
                      onClick={() => {
                        setAccent(k)
                        setAccentState(k)
                      }}
                    />
                  ))}
                </div>
              </>
            )}
            {section('Fondo', <BackgroundPicker />)}
            {section(
              'Lectura',
              <>
                <div className="seg">
                  {(
                    [
                      ['comfortable', 'Cómoda'],
                      ['compact', 'Compacta']
                    ] as Array<[Density, string]>
                  ).map(([k, l]) => (
                    <button
                      key={k}
                      className={density === k ? 'on' : ''}
                      onClick={() => {
                        setDensity(k)
                        setDensityState(k)
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <small className="pm-lbl">Tamaño de letra · {font}%</small>
                <input
                  type="range"
                  min={90}
                  max={120}
                  step={5}
                  value={font}
                  aria-label="Tamaño de letra"
                  onChange={(e) => {
                    setFontScale(Number(e.target.value))
                    setFontState(Number(e.target.value))
                  }}
                />
              </>
            )}
          </div>
          <div className="pm-foot">
            <button className="btn sm" onClick={toggleDayNight}>
              ◐ Claro / oscuro
            </button>
            <button
              className="btn sm"
              onClick={() => {
                setOpen(false)
                ui.go('settings')
              }}
            >
              ⚙ Ajustes
            </button>
            <button
              className="btn sm"
              onClick={() => {
                setOpen(false)
                showSettingsTab('apariencia')
                ui.go('settings')
              }}
            >
              🎨 Personalizar…
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

const NAV_ICON: Record<string, GlyphName> = { today: 'panelhome', workspace: 'workspace', board: 'board', groups: 'folders', history: 'history', chat: 'chats', hours: 'hours', redmine: 'redmine', usage: 'usage', dashboard: 'usage', music: 'music', notes: 'files', meetings: 'volume', arch: 'workspace', diagrams: 'board', web: 'popout', whatsapp: 'chat' }

/** Mensajes sin leer de los servicios de mensajería (vista → número), enviados por el proceso principal. */
function useBadges(): Record<string, number> {
  const [b, setB] = useState<Record<string, number>>({})
  useEffect(() => {
    void window.api.call('badges:get').then(setB, () => undefined)
    return window.api.onBadges(setB)
  }, [])
  return b
}


/** Estado compartido por el riel lateral y las utilidades de la barra superior. */
function useNavModel(): {
  ui: ReturnType<typeof useUi>
  chatTip: (label: string) => string
  closeApp: () => Promise<void>
  badgeOf: (v: string) => { n: number; need: boolean; dot: boolean }
  isOn: (v: string) => boolean
  pinned: { id: View; label: string; group: string }[]
  rest: { id: View; label: string; group: string }[]
  restBadge: number
} {
  const ui = useUi()
  const db = useDB()
  const badges = useBadges()
  const app = useAppearance() // repinta al fijar, reordenar u ocultar secciones
  const ca = ui.chatAlerts
  const chatN = ca.waiting + ca.unread
  const chatTip = (label: string): string => {
    const p: string[] = []
    if (ca.waiting) p.push(`${ca.waiting} esperando tu respuesta`)
    if (ca.unread) p.push(`${ca.unread} sin leer`)
    if (ca.running) p.push(`${ca.running} respondiendo`)
    return p.length ? `${label} · ${p.join(' · ')}` : label
  }
  const pending = db.tasks.filter((t) => !t.archived && (!t.recurrence || t.recurrence.type === 'none') && (t.status === 'today' || t.status === 'doing')).length
  /** Pide confirmación antes de salir de verdad; avisa de lo que quedará detenido. */
  const closeApp = async (): Promise<void> => {
    const notes: string[] = []
    if (db.entries.some((e) => !e.end)) notes.push('el timer en marcha se detendrá')
    if (ca.running) notes.push(`${ca.running} respuesta${ca.running > 1 ? 's' : ''} de IA en curso se cancelará${ca.running > 1 ? 'n' : ''}`)
    const text = 'Se cierra Nexu por completo: no quedará nada en segundo plano (ni en la bandeja).' + (notes.length ? ` Además: ${notes.join(' y ')}.` : '')
    if (!(await ui.confirm(text, { title: 'Cerrar Nexu', confirmLabel: 'Cerrar la aplicación', danger: true }))) return
    void ui.run('app:quit')
  }
  /** Aviso de cada botón: número (rojo si espera tu respuesta) o un punto si solo está respondiendo. */
  const badgeOf = (v: string): { n: number; need: boolean; dot: boolean } => {
    if (v === 'chat') return { n: chatN, need: ca.waiting > 0, dot: chatN === 0 && ca.running > 0 }
    if (v === 'today') return { n: pending, need: false, dot: false }
    return { n: badges[v] ?? 0, need: false, dot: false }
  }

  const all = navOrder(NAV_GROUPS.flatMap((g) => g.items.map(([id, , label]) => ({ id, label, group: g.title }))))
  const pinned = all.filter((x) => app.nav.pinned.includes(x.id))
  const rest = all.filter((x) => !app.nav.pinned.includes(x.id))
  const isOn = (v: string): boolean => ui.view === v || (v === 'chat' && ui.view === 'history')
  const restBadge = rest.reduce((n, x) => n + badgeOf(x.id).n, 0)

  return { ui, chatTip, closeApp, badgeOf, isOn, pinned, rest, restBadge }
}

/** Riel lateral: logo, secciones fijadas, «+» con el resto y perfil. */
export function Rail({ onSearch }: { onSearch: () => void }): ReactNode {
  const { ui, chatTip, badgeOf, isOn, pinned, rest, restBadge } = useNavModel()
  const [more, setMore] = useState(false)
  const app = useAppearance()
  // Plegado de la barra (solo lo muestra el tema Sorvo): se recuerda entre sesiones
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem('railFolded') === '1'
    } catch {
      return false
    }
  })
  const navRef = useRef<HTMLElement>(null)
  const before = useRef<Map<Element, DOMRect> | null>(null)
  const flipTargets = (): Element[] => Array.from(navRef.current?.querySelectorAll('.tn-logo, .tn-fold, .tn-items > .tn-i, .rail-av') ?? [])
  const toggleFold = (): void => {
    // FLIP: se anotan las posiciones, React pliega la barra y en el layout siguiente cada elemento se desliza desde donde estaba
    before.current = new Map(flipTargets().map((el) => [el, el.getBoundingClientRect()]))
    setFolded((f) => {
      try {
        localStorage.setItem('railFolded', f ? '0' : '1')
      } catch {
        /* sin storage */
      }
      return !f
    })
  }
  // Ctrl+B pliega/despliega la barra desde cualquier lugar
  const toggleRef = useRef(toggleFold)
  toggleRef.current = toggleFold
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useLayoutEffect(() => {
    const prev = before.current
    before.current = null
    if (!prev || document.documentElement.dataset.motion === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    for (const el of flipTargets()) {
      const a = prev.get(el)
      if (!a) continue
      const b = el.getBoundingClientRect()
      const dx = a.left - b.left
      const dy = a.top - b.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 620, easing: 'cubic-bezier(.645, .045, .355, 1)' })
    }
  }, [folded])
  return (
    <nav className="navrail" id="nav" aria-label="Principal" ref={navRef} data-folded={folded}>
      <div className="tn-head">
        <button className="tn-logo" title="Nexu Workspace · Ctrl+K" aria-label="Búsqueda global" onClick={onSearch}>
          N
        </button>
      </div>
      <div className="tn-items">
        {pinned.map(({ id: v, label }, i) => {
          const b = badgeOf(v)
          return (
            <button key={v} className={`tn-i${isOn(v) ? ' on' : ''}`} style={{ '--i': i } as CSSProperties} title={v === 'chat' ? chatTip(label) : label} aria-current={ui.view === v ? 'page' : undefined} onClick={() => ui.go(v)}>
              <G n={NAV_ICON[v] ?? 'today'} size={16} />
              <span className="tn-t">{label}</span>
              {b.n > 0 ? <span className={`tn-n${b.need ? ' need' : ''}`}>{b.n > 9 ? '9+' : b.n}</span> : b.dot ? <span className="tn-dot" aria-hidden /> : null}
            </button>
          )
        })}
        {rest.length > 0 && (
          <Popover.Root open={more} onOpenChange={setMore}>
            <Popover.Trigger asChild>
              <button className={`tn-i tn-plus${rest.some((x) => isOn(x.id)) ? ' on' : ''}`} title="Más secciones" aria-label="Más secciones">
                <G n="plus" size={16} />
                {restBadge > 0 && <span className="tn-dot" aria-hidden />}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="pmenu tn-more" side={app.dock === 'right' ? 'left' : 'right'} align="end" sideOffset={10} collisionPadding={12}>
                {NAV_GROUPS.map((g) => {
                  const items = rest.filter((x) => x.group === g.title)
                  if (!items.length) return null
                  return (
                    <div key={g.title} className="tn-mg">
                      <div className="wide-gt">{g.title}</div>
                      {items.map(({ id: v, label }) => {
                        const b = badgeOf(v)
                        return (
                          <button
                            key={v}
                            className={`tn-mi${isOn(v) ? ' on' : ''}`}
                            onClick={() => {
                              setMore(false)
                              ui.go(v)
                            }}
                          >
                            <G n={NAV_ICON[v] ?? 'today'} size={16} />
                            <span className="grow">{label}</span>
                            {b.n > 0 && <span className={`tn-n${b.need ? ' need' : ''}`}>{b.n > 9 ? '9+' : b.n}</span>}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
                <div className="tn-mf">Elige qué se fija arriba en Ajustes → Apariencia.</div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
      <span className="nr-sp" />
      <button className="tn-fold" title={`${folded ? 'Desplegar' : 'Plegar'} menú (Ctrl+B)`} aria-label={folded ? 'Desplegar menú' : 'Plegar menú'} aria-pressed={folded} onClick={toggleFold}>
        <G n="chevron" size={16} />
        <span className="tn-t">Plegar menú</span>
      </button>
      <Profile />
    </nav>
  )
}

/** Aviso visible en toda la app mientras se graba una reunión: punto rojo, tiempo y acceso a la vista de reuniones. */
function RecIndicator(): ReactNode {
  const rec = useRecording()
  const ui = useUi()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [rec])
  if (!rec) return null
  const s = Math.floor(recElapsed(rec, now) / 1000)
  const t = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  return (
    <button className={`rec-chip${rec.paused ? ' paused' : ''}`} title={`${rec.paused ? 'Grabación en pausa' : 'Grabando'}: ${rec.title}. Pulsa para ir a Reuniones`} aria-label={`${rec.paused ? 'En pausa' : 'Grabando'} ${t}. Ir a Reuniones`} onClick={() => ui.go('meetings')}>
      <span className="rec-dot" aria-hidden />
      {rec.paused ? 'Pausa' : 'REC'} {t}
    </button>
  )
}

/** Utilidades de la barra superior: búsqueda, reproductor, timer, avisos, pantalla completa y salir. */
export function TopTools({ onSearch, fullscreen, onFullscreen }: { onSearch: () => void; fullscreen: boolean; onFullscreen: () => void }): ReactNode {
  const { closeApp } = useNavModel()
  return (
    <div className="tb-tools">
      <button className="tb-search" title="Buscar o ejecutar (Ctrl K)" aria-label="Búsqueda global" onClick={onSearch}>
        <G n="search" size={15} />
        <span>Buscar o ejecutar…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <RecIndicator />
      <MiniPlayer />
      <TimerBar />
      <NotificationBell variant="top" />
      <CommandsBell variant="top" />
      <UpdateChip />
      <button className="ib" title={fullscreen ? 'Salir de pantalla completa (F11)' : 'Pantalla completa (F11)'} aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'} aria-pressed={fullscreen} onClick={onFullscreen}>
        <G n={fullscreen ? 'shrink' : 'expand'} size={16} />
      </button>
      <button className="ib tn-quit" title="Cerrar Nexu por completo" aria-label="Cerrar la aplicación" onClick={() => void closeApp()}>
        <G n="x" size={16} />
      </button>
    </div>
  )
}
