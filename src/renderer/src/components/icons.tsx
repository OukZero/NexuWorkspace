import type { ReactNode } from 'react'

const Svg = ({ children, fill }: { children: ReactNode; fill?: boolean }): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill={fill ? 'currentColor' : 'none'}
    stroke={fill ? 'none' : 'currentColor'}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

export const IconSend = (): ReactNode => (
  <Svg>
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </Svg>
)

export const IconStop = (): ReactNode => (
  <Svg fill>
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </Svg>
)
