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
import { msToday, useDB, useNow } from '../store'
import { fmtH } from '../utils'
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

function Profile(): ReactNode {
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
        <button className="rail-av" data-tip={name.trim() || 'Perfil y apariencia'} aria-label="Perfil y apariencia">
          {initials(name)}
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

const NAV_ICON: Record<string, GlyphName> = { today: 'panelhome', workspace: 'workspace', board: 'board', groups: 'folders', history: 'history', hours: 'hours', redmine: 'redmine', usage: 'usage', music: 'music', notes: 'files', web: 'popout', whatsapp: 'chat' }

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

function ThemeToggle(): ReactNode {
  useAppearance()
  const dark = document.documentElement.dataset.theme !== 'light'
  return (
    <button
      className="rb"
      data-tip={dark ? 'Tema claro' : 'Tema oscuro'}
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

/** Menú principal como barra de iconos: los nombres van en el tooltip y el orden se configura en Apariencia. */
export function Sidebar(): ReactNode {
  const ui = useUi()
  const db = useDB()
  const badges = useBadges()
  useAppearance() // repinta al reordenar u ocultar secciones
  const pending = db.tasks.filter((t) => !t.archived && (!t.recurrence || t.recurrence.type === 'none') && (t.status === 'today' || t.status === 'doing')).length
  return (
    <aside className="side rail-side" aria-label="Principal">
      <button className="rail-logo" data-tip="Shutoki AI Workspace · Ctrl+K" aria-label="Búsqueda global" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3c4 2 6 6 4 10-1 2-3 3-4 8-1-5-3-6-4-8-2-4 0-8 4-10z" />
        </svg>
      </button>
      <nav id="nav">
        {NAV_GROUPS.map((g, gi) => (
          <div key={g.title} className="nav-group">
            {gi > 0 && <span className="rail-sep" />}
            {navOrder(g.items.map(([id, , label]) => ({ id, label }))).map(({ id: v, label }) => (
              <button key={v} className={`rb ${ui.view === v ? 'on' : ''}`} data-tip={badges[v] ? `${label} · ${badges[v]} sin leer` : label} aria-label={badges[v] ? `${label}, ${badges[v]} sin leer` : label} aria-current={ui.view === v ? 'page' : undefined} onClick={() => ui.go(v)}>
                <G n={NAV_ICON[v] ?? 'today'} />
                {v === 'today' && pending > 0 && <span className="rb-badge">{pending > 9 ? '9+' : pending}</span>}
                {badges[v] > 0 && <span className="rb-badge">{badges[v] > 9 ? '9+' : badges[v]}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <span className="sp" />
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
