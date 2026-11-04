import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ACCENTS,
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
  type Density,
  type ThemeMode
} from '../theme'
import { msToday, useDB, useNow } from '../store'
import { fmtH } from '../utils'
import { useUi, type View } from '../ui'

const NAV: Array<[View, string, string]> = [
  ['today', '☀', 'Hoy'],
  ['board', '▦', 'Tablero'],
  ['hours', '⏱', 'Horas'],
  ['usage', '◔', 'Consumo'],
  ['groups', '🗂', 'Carpetas'],
  ['settings', '⚙', 'Ajustes']
]

const COLLAPSE_KEY = 'shutoki.sidebar'

const THEMES: Array<[ThemeMode, string]> = [
  ['light', '☀ Día'],
  ['dark', '☾ Noche'],
  ['system', '⌂ Auto']
]

function initials(n: string): string {
  const p = n.trim().split(/\s+/).filter(Boolean)
  return (p.length ? p[0][0] + (p[1]?.[0] || '') : '?').toUpperCase()
}

function DayBar(): ReactNode {
  const db = useDB()
  const now = useNow()
  const ms = msToday(db, now)
  const target = db.settings.targetHours * 3600000
  return (
    <div id="dayBar">
      <div>
        <b>{fmtH(ms)} h</b> / {db.settings.targetHours} h hoy
      </div>
      <div className="bar">
        <i style={{ width: `${Math.min(100, (ms / target) * 100)}%` }} />
      </div>
    </div>
  )
}

function Profile(): ReactNode {
  const ui = useUi()
  const [open, setOpen] = useState(false)
  const [name, setNameState] = useState(getName())
  const [mode, setModeState] = useState<ThemeMode>(getMode())
  const [accent, setAccentState] = useState(getAccent())
  const [density, setDensityState] = useState<Density>(getDensity())
  const [font, setFontState] = useState(getFontScale())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  return (
    <div className="profile" ref={ref}>
      <button className="profile-btn" title="Perfil y apariencia" onClick={() => setOpen(!open)}>
        <span className="avatar">{initials(name)}</span>
        <span className="pname">{name.trim() || 'Tu perfil'}</span>
      </button>
      {open && (
        <div className="pmenu">
          <label>Tu nombre</label>
          <input
            value={name}
            placeholder="Ej. Marti"
            maxLength={30}
            autoFocus
            onChange={(e) => {
              setNameState(e.target.value)
              setName(e.target.value.trim())
            }}
          />
          <label style={{ marginTop: 10 }}>Apariencia</label>
          <div className="seg">
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
          <label style={{ marginTop: 10 }}>Color de acento</label>
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
          <label style={{ marginTop: 10 }}>Densidad</label>
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
          <label style={{ marginTop: 10 }}>Tamaño de letra · {font}%</label>
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
          <button
            className="btn sm"
            style={{ width: '100%', marginTop: 10 }}
            onClick={() => {
              setOpen(false)
              ui.go('settings')
            }}
          >
            ⚙ Ajustes
          </button>
        </div>
      )}
    </div>
  )
}

function Brand(): ReactNode {
  const [ok, setOk] = useState(true) // si icon.png no existe todavía (npm run icon), queda el símbolo ◆
  return (
    <div className="brand">
      {ok ? <img className="brand-icon" src={`${import.meta.env.BASE_URL}icon.png`} alt="" onError={() => setOk(false)} /> : <span>◆</span>}
      <span className="brand-text">Shutoki</span>
    </div>
  )
}

export function Sidebar(): ReactNode {
  const ui = useUi()
  // el menú se pliega a una barra de iconos y recuerda su estado
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggle = (): void => {
    setCollapsed(!collapsed)
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '0' : '1')
    } catch {
      /* sin storage */
    }
  }
  return (
    <aside className={`side ${collapsed ? 'collapsed' : ''}`}>
      <Brand />
      <nav id="nav">
        {NAV.map(([v, icon, label]) => (
          <button key={v} className={ui.view === v ? 'active' : ''} title={label} onClick={() => ui.go(v)}>
            <span className="ni">{icon}</span>
            <span className="nl">{label}</span>
          </button>
        ))}
      </nav>
      <div className="side-foot">
        <DayBar />
        <button className="side-search" title="Búsqueda global (Ctrl+K)" onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}>
          <span className="ni">⌕</span>
          <span className="nl">Buscar · Ctrl+K</span>
        </button>
        <small>Ctrl+Alt+N: captura rápida</small>
        <button className="side-toggle" title={collapsed ? 'Expandir el menú' : 'Plegar el menú'} onClick={toggle}>
          {collapsed ? '»' : '«'}
        </button>
        <Profile />
      </div>
    </aside>
  )
}
