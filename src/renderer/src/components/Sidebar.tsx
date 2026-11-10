import * as Popover from '@radix-ui/react-popover'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
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
  setName,
  navOrder,
  useAppearance,
  type Density,
  type ThemeMode
} from '../theme'
import { activeEntry, findTask, msToday, useDB, useNow } from '../store'
import { baseName, fmtH } from '../utils'
import { workFolder } from '../../../shared/util'
import { getSideWide, setSideWide, useSideWide } from '../sideMode'
import { useUi, type View } from '../ui'
import { UpdateChip } from './UpdateCard'
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
        <Popover.Content className="pmenu" side="right" align="end" sideOffset={10} collisionPadding={12}>
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

const NAV_ICON: Record<string, GlyphName> = { today: 'panelhome', workspace: 'workspace', board: 'board', groups: 'folders', history: 'history', chat: 'chats', hours: 'hours', redmine: 'redmine', usage: 'usage', music: 'music', notes: 'files', meetings: 'volume', web: 'popout', whatsapp: 'chat' }

/** Avance del día como anillo, bajo el logo: horas registradas frente al objetivo. */
function DayRing(): ReactNode {
  const db = useDB()
  const now = useNow(30000)
  const ms = msToday(db, now)
  const target = db.settings.targetHours * 3600000
  const p = Math.min(1, target ? ms / target : 0)
  const c = 2 * Math.PI * 9
  return (
    <span className="rail-ring" data-tip={`${fmtH(ms)} h de ${db.settings.targetHours} h hoy`} role="img" aria-label={`${fmtH(ms)} horas de ${db.settings.targetHours} hoy`}>
      <svg viewBox="0 0 24 24" width="22" height="22">
        <circle cx="12" cy="12" r="9" stroke="var(--line)" />
        <circle cx="12" cy="12" r="9" stroke="var(--accent2)" strokeDasharray={`${p * c} ${c}`} strokeLinecap="round" />
      </svg>
    </span>
  )
}

function ThemeToggle({ small }: { small?: boolean }): ReactNode {
  useAppearance()
  const dark = document.documentElement.dataset.theme !== 'light'
  return (
    <button
      className={small ? 'ib' : 'rb'}
      data-tip={small ? undefined : dark ? 'Tema claro' : 'Tema oscuro'}
      title={small ? (dark ? 'Tema claro' : 'Tema oscuro') : undefined}
      aria-label={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      onClick={() => {
        if (getPreset()) setPreset('') // los estilos con nombre son de un solo modo: se vuelve al clásico día / noche
        setMode(dark ? 'light' : 'dark')
      }}
    >
      <G n={dark ? 'sun' : 'moon'} />
    </button>
  )
}

/** Mensajes sin leer de los servicios de mensajería (vista → número), enviados por el proceso principal. */
function useBadges(): Record<string, number> {
  const [b, setB] = useState<Record<string, number>>({})
  useEffect(() => {
    void window.api.call('badges:get').then(setB, () => undefined)
    return window.api.onBadges(setB)
  }, [])
  return b
}

/** Jornada de hoy como barra fina (menú ancho): horas registradas frente al objetivo. */
function DayBar(): ReactNode {
  const db = useDB()
  const now = useNow(30000)
  const ms = msToday(db, now)
  const target = db.settings.targetHours * 3600000
  const p = Math.min(1, target ? ms / target : 0)
  return (
    <div className="wide-day" role="img" aria-label={`${fmtH(ms)} horas de ${db.settings.targetHours} hoy`} title={`${fmtH(ms)} h de ${db.settings.targetHours} h hoy`}>
      <div>
        <span>Jornada de hoy</span>
        <b>
          {fmtH(ms).replace('.', ',')} h<small> / {db.settings.targetHours} h</small>
        </b>
      </div>
      <i>
        <b style={{ width: `${p * 100}%` }} />
      </i>
    </div>
  )
}

const MODES: Array<['chat' | 'design' | 'git' | 'files', string, GlyphName]> = [
  ['chat', 'Chat IA', 'chat'],
  ['design', 'Diseño', 'design'],
  ['git', 'Git', 'git'],
  ['files', 'Archivos', 'code']
]

const openPalette = (): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
}

const LOGO = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3c4 2 6 6 4 10-1 2-3 3-4 8-1-5-3-6-4-8-2-4 0-8 4-10z" />
  </svg>
)

/** Menú principal: ancho (nombres, secciones y tarea activa) o reducido a una barra de iconos. Ctrl+B cambia entre ambos. */
export function Sidebar(): ReactNode {
  const ui = useUi()
  const db = useDB()
  const badges = useBadges()
  const wide = useSideWide()
  useAppearance() // repinta al reordenar u ocultar secciones
  const ca = ui.chatAlerts
  const chatN = ca.waiting + ca.unread
  /** Texto del aviso del botón «Chats»: qué conversaciones necesitan atención. */
  const chatTip = (label: string): string => {
    const p: string[] = []
    if (ca.waiting) p.push(`${ca.waiting} esperando tu respuesta`)
    if (ca.unread) p.push(`${ca.unread} sin leer`)
    if (ca.running) p.push(`${ca.running} respondiendo`)
    return p.length ? `${label} · ${p.join(' · ')}` : label
  }
  const pending = db.tasks.filter((t) => !t.archived && (!t.recurrence || t.recurrence.type === 'none') && (t.status === 'today' || t.status === 'doing')).length
  /** Aviso de cada botón: número (rojo si espera tu respuesta) o un punto si solo está respondiendo. */
  const badgeOf = (v: string): { n: number; need: boolean; dot: boolean } => {
    if (v === 'chat') return { n: chatN, need: ca.waiting > 0, dot: chatN === 0 && ca.running > 0 }
    if (v === 'today') return { n: pending, need: false, dot: false }
    return { n: badges[v] ?? 0, need: false, dot: false }
  }

  // Ctrl+B: ancho ↔ reducido (sin pisar el teclado dentro de cuadros de texto)
  useEffect(() => {
    const on = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'b') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      setSideWide(!getSideWide())
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  // tarea activa: la de la pestaña abierta o, si estás en otra pantalla, la del timer
  const task = findTask(db, ui.activeTask ?? activeEntry(db)?.taskId ?? db.paused)
  const folder = task ? workFolder(task, db.groups) : ''

  if (wide) {
    return (
      <aside className="side rail-side wide" aria-label="Principal">
        <div className="wide-brand">
          <button className="wide-brand-b" onClick={openPalette} title="Búsqueda global (Ctrl+K)" aria-label="Búsqueda global">
            <span className="wide-logo">{LOGO}</span>
            <span className="wide-bn">
              <b>Shutoki</b>
              <small>AI Workspace</small>
            </span>
          </button>
          <button className="ib" title="Reducir el menú (Ctrl+B)" aria-label="Reducir el menú" onClick={() => setSideWide(false)}>
            <G n="chevron" size={15} />
          </button>
        </div>
        <nav id="nav" className="wide-nav">
          {NAV_GROUPS.map((g) => (
            <div key={g.title} className="nav-group wide-group">
              <div className="wide-gt">{g.title}</div>
              {navOrder(g.items.map(([id, , label]) => ({ id, label }))).map(({ id: v, label }) => {
                const b = badgeOf(v)
                return (
                  <button key={v} className={`wi${ui.view === v ? ' on' : ''}`} title={v === 'chat' ? chatTip(label) : undefined} aria-current={ui.view === v ? 'page' : undefined} onClick={() => ui.go(v)}>
                    <G n={NAV_ICON[v] ?? 'today'} size={17} />
                    <span className="wi-t">{label}</span>
                    {b.n > 0 ? <span className={`wi-n${b.need ? ' need' : ''}`}>{b.n > 9 ? '9+' : b.n}</span> : b.dot ? <span className="wi-dot" aria-hidden /> : null}
                  </button>
                )
              })}
            </div>
          ))}
          {task && (
            <div className="nav-group wide-group">
              <div className="wide-gt">Tarea activa</div>
              <button className="wide-task" onClick={() => ui.openChat(task.id)} title={`${task.title}${folder ? ` · ${folder}` : ''}\nAbrir su chat`}>
                <small>{task.title}</small>
                <b>{[folder ? baseName(folder) : task.project || 'Sin carpeta', task.branch].filter(Boolean).join(' · ')}</b>
              </button>
              {MODES.map(([m, label, icon]) => (
                <button key={m} className={`wi${ui.view === 'chat' && ui.activeTask === task.id && ui.activeMode === m ? ' on' : ''}`} onClick={() => ui.openMode(task.id, m)}>
                  <G n={icon} size={17} />
                  <span className="wi-t">{label}</span>
                </button>
              ))}
            </div>
          )}
        </nav>
        <span className="sp" />
        <DayBar />
        <div className="wide-foot">
          <Profile wide />
          <UpdateChip />
          <ThemeToggle small />
          <button className={`ib${ui.view === 'settings' ? ' on' : ''}`} title="Ajustes" aria-label="Ajustes" onClick={() => ui.go('settings')}>
            <G n="settings" size={16} />
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="side rail-side" aria-label="Principal">
      <button className="rail-logo" data-tip="Shutoki AI Workspace · Ctrl+K" aria-label="Búsqueda global" onClick={openPalette}>
        {LOGO}
      </button>
      <nav id="nav">
        {NAV_GROUPS.map((g, gi) => (
          <div key={g.title} className="nav-group">
            {gi > 0 && <span className="rail-sep" />}
            {navOrder(g.items.map(([id, , label]) => ({ id, label }))).map(({ id: v, label }) => {
              const b = badgeOf(v)
              return (
                <button key={v} className={`rb ${ui.view === v ? 'on' : ''}`} data-tip={v === 'chat' ? chatTip(label) : badges[v] ? `${label} · ${badges[v]} sin leer` : label} aria-label={badges[v] ? `${label}, ${badges[v]} sin leer` : label} aria-current={ui.view === v ? 'page' : undefined} onClick={() => ui.go(v)}>
                  <G n={NAV_ICON[v] ?? 'today'} />
                  {b.n > 0 ? <span className={`rb-badge${b.need ? ' need' : ''}`}>{b.n > 9 ? '9+' : b.n}</span> : b.dot ? <span className="rb-dot" aria-hidden /> : null}
                </button>
              )
            })}
          </div>
        ))}
      </nav>
      <span className="sp" />
      <button className="rb" data-tip="Ampliar el menú · Ctrl+B" aria-label="Ampliar el menú" onClick={() => setSideWide(true)}>
        <G n="chevron" size={16} />
      </button>
      <DayRing />
      <UpdateChip />
      <ThemeToggle />
      <button className={`rb ${ui.view === 'settings' ? 'on' : ''}`} data-tip="Ajustes" aria-label="Ajustes" onClick={() => ui.go('settings')}>
        <G n="settings" />
      </button>
      <Profile />
    </aside>
  )
}
