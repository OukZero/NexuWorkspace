import type { ReactNode } from 'react'

type Kind = 'tasks' | 'hours' | 'folders' | 'chart' | 'routines'

// ilustraciones sencillas en SVG, con los colores del tema
const ART: Record<Kind, ReactNode> = {
  tasks: (
    <>
      <rect x="14" y="10" width="52" height="60" rx="8" fill="var(--panel2)" stroke="var(--line)" strokeWidth="2" />
      <path d="M26 30l5 5 9-10" fill="none" stroke="var(--accent2)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46 31h12M26 50l5 5 9-10" fill="none" stroke="var(--line)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46 51h12" stroke="var(--line)" strokeWidth="3.5" strokeLinecap="round" />
    </>
  ),
  hours: (
    <>
      <circle cx="40" cy="40" r="28" fill="var(--panel2)" stroke="var(--line)" strokeWidth="2" />
      <path d="M40 22v19l12 7" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  folders: (
    <>
      <path d="M10 26a6 6 0 0 1 6-6h14l6 7h28a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z" fill="var(--panel2)" stroke="var(--line)" strokeWidth="2" />
      <path d="M10 36h60" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" opacity=".6" />
    </>
  ),
  chart: (
    <>
      <rect x="12" y="44" width="12" height="22" rx="3" fill="var(--line)" />
      <rect x="34" y="30" width="12" height="36" rx="3" fill="var(--accent)" opacity=".7" />
      <rect x="56" y="16" width="12" height="50" rx="3" fill="var(--accent2)" opacity=".7" />
    </>
  ),
  routines: (
    <>
      <path d="M58 30a20 20 0 1 0 2 14" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
      <path d="M60 16v16H44" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

/** Estado vacío con ilustración y una invitación a la acción (en lugar de un cuadro punteado). */
export function EmptyState({ kind, title, text, action }: { kind: Kind; title: string; text?: string; action?: ReactNode }): ReactNode {
  return (
    <div className="emptystate">
      <svg viewBox="0 0 80 80" width="84" height="84" aria-hidden="true">
        {ART[kind]}
      </svg>
      <b>{title}</b>
      {text && <span>{text}</span>}
      {action}
    </div>
  )
}
