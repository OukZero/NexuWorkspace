import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'

const COLORS = ['var(--accent)', 'var(--accent2)', 'var(--warn)', 'var(--danger)', '#fff']

/** Confeti discreto al completar una tarea; se retira solo y respeta «reducir movimiento». */
export function Confetti({ onDone }: { onDone: () => void }): ReactNode {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        i,
        left: 30 + Math.random() * 40, // % del ancho: nace en la zona central
        dx: (Math.random() - 0.5) * 360,
        rot: (Math.random() - 0.5) * 720,
        delay: Math.random() * 120,
        color: COLORS[i % COLORS.length]
      })),
    []
  )
  useEffect(() => {
    const t = setTimeout(onDone, 1700)
    return () => clearTimeout(t)
  }, [onDone])
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <i
          key={p.i}
          style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}ms`, ['--dx' as string]: `${p.dx}px`, ['--rot' as string]: `${p.rot}deg` }}
        />
      ))}
    </div>
  )
}
