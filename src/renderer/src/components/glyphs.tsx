import type { ReactNode } from 'react'

/** Iconos de trazo fino (1.6) del diseño minimal. Heredan el color del texto. */
const P: Record<string, ReactNode> = {
  today: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
    </>
  ),
  board: (
    <>
      <rect x="3.5" y="3.5" width="7" height="17" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="9" rx="1.5" />
    </>
  ),
  chat: <path d="M20 12a8 8 0 0 1-11.5 7.2L4 20l1-4.2A8 8 0 1 1 20 12z" />,
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 4v4h4M12 8v4l3 2" />
    </>
  ),
  folders: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  hours: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 1.5M10 2.5h4" />
    </>
  ),
  redmine: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  usage: <path d="M5 20v-7M12 20V5M19 20v-10" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  terminal: <path d="M5 8l5 4-5 4M13 17h6" />,
  code: <path d="M8.5 7L4 12l4.5 5M15.5 7L20 12l-4.5 5" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M15 6l-6 6 6 6" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  filter: <path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r=".9" />
      <circle cx="12" cy="12" r=".9" />
      <circle cx="18.5" cy="12" r=".9" />
    </>
  ),
  check: <path d="M5 12l5 5 9-10" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />,
  git: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="8" r="2" />
      <path d="M6 8v8M18 10c0 4-6 3-11 6.5" />
    </>
  ),
  design: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.8 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10.5" cy="7" r="1" />
      <circle cx="15" cy="7.5" r="1" />
    </>
  ),
  files: <path d="M7 3.5h7l4.5 4.5v12.5H7zM14 3.5V8h4.5" />,
  panel: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M14.5 4.5v15" />
    </>
  ),
  popout: <path d="M14 4h6v6M20 4l-8 8M10 5H5v14h14v-5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  send: <path d="M12 19V5M5 12l7-7 7 7" />,
  list: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  workspace: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M12 3.5v17M12 12h8.5" />
    </>
  ),
  panelhome: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  splitright: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M12 4.5v15" />
    </>
  ),
  splitdown: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 12h17" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" />
    </>
  ),
  reset: <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5" />,
  music: <path d="M9 18V6l10-2v12M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM19 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z" />,
  volume: <path d="M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />,
  mute: <path d="M11 5L6 9H3v6h3l5 4zM16 9.5l5 5M21 9.5l-5 5" />,
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  chats: (
    <>
      <path d="M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-1" />
      <path d="M4 10h9a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-3.5 3V19H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2z" />
    </>
  ),
  bullets: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  bold: <path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z" />,
  italic: <path d="M19 4h-9M14 20H5M15 4L9 20" />,
  link: <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />,
  desk: (
    <>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  tablet: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />
}

const FILLED: Record<string, ReactNode> = {
  play: <path d="M8 5l12 7-12 7z" />,
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  skipnext: (
    <>
      <path d="M6 5l9 7-9 7z" />
      <rect x="16.5" y="5" width="2.5" height="14" rx="1" />
    </>
  ),
  skipprev: (
    <>
      <path d="M18 5l-9 7 9 7z" />
      <rect x="5" y="5" width="2.5" height="14" rx="1" />
    </>
  )
}

export type GlyphName = keyof typeof P | keyof typeof FILLED

export function G({ n, size = 18, stroke }: { n: GlyphName; size?: number; stroke?: number }): ReactNode {
  const filled = n in FILLED
  return (
    <svg className="g" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth={stroke ?? 1.6} strokeLinecap="round" strokeLinejoin="round">
      {filled ? FILLED[n] : P[n]}
    </svg>
  )
}
