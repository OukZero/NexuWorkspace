import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Activity, ActivityKind } from '../../../shared/types'
import { setLayout, useLayout } from '../layout'
import { useDB } from '../store'
import { Resizer } from './Resizer'
import { useUi } from '../ui'
import { SessionPanel } from './SessionPanel'

const ACT_ICON: Record<ActivityKind, string> = { edit: '✎', read: '👁', run: '⌘', search: '⌕', other: '•' }

type Tab = 'session' | 'files' | 'activity'

function Files({ activity }: { activity: Activity[] }): ReactNode {
  const ui = useUi()
  const edits = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of activity) if (a.kind === 'edit' && a.status !== 'error') m.set(a.target, (m.get(a.target) ?? 0) + 1)
    return [...m.entries()]
  }, [activity])
  if (!edits.length) return <div className="meta">Nada modificado todavía</div>
  return (
    <>
      {edits.map(([f, n]) => (
        <div key={f} className="act edit file" title="Ver qué cambió" onClick={() => ui.showDiff(f)}>
          <span className="ico">✎</span>
          <code className="grow">{f}</code>
          {n > 1 && <span className="chip">×{n}</span>}
          <button
            className="icon"
            title="Ver el archivo completo"
            aria-label="Ver el archivo completo"
            onClick={(e) => {
              e.stopPropagation()
              ui.openFile(f)
            }}
          >
            {'</>'}
          </button>
          <span className="st">›</span>
        </div>
      ))}
    </>
  )
}

function Feed({ activity }: { activity: Activity[] }): ReactNode {
  if (!activity.length) return <div className="meta">Aquí verás qué lee, edita o ejecuta Claude.</div>
  return (
    <>
      {[...activity]
        .reverse()
        .slice(0, 80)
        .map((a) => (
          <div key={a.id} className={`act ${a.kind} ${a.status}`} title={a.detail || ''}>
            <span className="ico">{ACT_ICON[a.kind] || '•'}</span>
            <div className="grow">
              <b>{a.label}</b> <code>{a.target}</code>
              {a.detail && <div className="meta">{a.detail}</div>}
            </div>
            <span className="st">{a.status === 'running' ? '…' : a.status === 'ok' ? '✓' : '✕'}</span>
          </div>
        ))}
    </>
  )
}

/**
 * Panel lateral del chat: sesión, archivos y actividad. Se pliega a una barra de iconos al costado
 * (igual que el menú de la izquierda); el icono activo vuelve a plegarlo.
 */
export function SidePanel({ convId }: { convId: string }): ReactNode {
  const db = useDB()
  const lay = useLayout()
  const st = { open: lay.sideOpen, tab: lay.sideTab as Tab }
  const setSt = (v: { open: boolean; tab: Tab }): void => setLayout({ sideOpen: v.open, sideTab: v.tab })
  const activity = db.chats[convId]?.activity ?? []

  const files = new Set(activity.filter((a) => a.kind === 'edit' && a.status !== 'error').map((a) => a.target)).size
  const working = activity.some((a) => a.status === 'running')
  const tabs: Array<{ id: Tab; icon: string; label: string; badge?: ReactNode }> = [
    { id: 'session', icon: '◔', label: 'Sesión y contexto' },
    { id: 'files', icon: '✎', label: 'Archivos modificados', badge: files > 0 ? <em className="badge">{files}</em> : null },
    { id: 'activity', icon: '⚡', label: 'Actividad en vivo', badge: working ? <em className="badge run" /> : null }
  ]
  const current = tabs.find((t) => t.id === st.tab) ?? tabs[0]

  return (
    <aside className={`side-panel ${st.open ? 'open' : 'closed'}`}>
      {st.open && <Resizer value={lay.sideW} invert onChange={(w) => setLayout({ sideW: w })} onReset={() => setLayout({ sideW: 320 })} label="Ancho del panel" />}
      {st.open && (
        <div className="panel-body">
          <h4>{current.label}</h4>
          {st.tab === 'session' && <SessionPanel convId={convId} />}
          {st.tab === 'files' && <Files activity={activity} />}
          {st.tab === 'activity' && <Feed activity={activity} />}
        </div>
      )}
      <div className="rail">
        <button className="rail-btn" title={st.open ? 'Plegar el panel' : 'Mostrar el panel'} onClick={() => setSt({ ...st, open: !st.open })}>
          {st.open ? '»' : '«'}
        </button>
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`rail-btn ${st.open && st.tab === t.id ? 'on' : ''}`}
            title={t.label}
            onClick={() => setSt(st.open && st.tab === t.id ? { ...st, open: false } : { open: true, tab: t.id })}
          >
            {t.icon}
            {t.badge}
          </button>
        ))}
      </div>
    </aside>
  )
}
