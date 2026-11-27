import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { currentSeason } from '../seasons'
import { playSfx } from '../sounds'
import { activeEntry, useDB } from '../store'
import { useAppearance } from '../theme'

/** Capa decorativa fija (sin eventos): partículas del evento vigente, fondo animado opcional y sonidos de la interfaz. */
export function Ambient(): ReactNode {
  const A = useAppearance()
  const db = useDB()
  const season = A.seasons || A.seasonForce ? currentSeason(new Date(), A.seasonForce) : null

  // el evento tiñe un destello superior y sirve de variable para el resto (--season)
  useEffect(() => {
    const r = document.documentElement
    if (season) {
      r.dataset.season = season.id
      r.style.setProperty('--season', season.color)
    } else {
      delete r.dataset.season
      r.style.removeProperty('--season')
    }
  }, [season])

  // sonidos: al iniciar/detener el timer y al completar una tarea (evento emitido por App)
  const run = !!activeEntry(db)
  const prev = useRef<boolean | null>(null)
  useEffect(() => {
    if (prev.current !== null && prev.current !== run) playSfx(run ? 'start' : 'stop')
    prev.current = run
  }, [run])
  useEffect(() => {
    const f = (): void => playSfx('done')
    window.addEventListener('shutoki:celebrate', f)
    return () => window.removeEventListener('shutoki:celebrate', f)
  }, [])

  const bits = useMemo(() => {
    const list = season?.bits ?? (A.liveBg === 'particulas' ? ['•'] : [])
    if (!list.length) return []
    return Array.from({ length: season ? 16 : 22 }, (_, i) => ({
      ch: list[i % list.length],
      left: (i * 37 + 11) % 100,
      size: 10 + ((i * 7) % 14),
      dur: 14 + ((i * 5) % 14),
      delay: -((i * 3.3) % 20)
    }))
  }, [season, A.liveBg])

  const moving = A.motion
  if (!season && A.liveBg === 'off') return null
  return (
    <div className="ambient" aria-hidden data-live={A.liveBg} data-season={season?.id}>
      {A.liveBg === 'aurora' && moving && <><i className="amb-blob b1" /><i className="amb-blob b2" /><i className="amb-blob b3" /></>}
      {moving && bits.map((b, i) => <span key={i} className="amb-bit" style={{ left: `${b.left}%`, fontSize: b.size, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` } as CSSProperties}>{b.ch}</span>)}
      {season && <span className="amb-glow" />}
    </div>
  )
}
