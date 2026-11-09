import * as Popover from '@radix-ui/react-popover'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { spotifyVolume, useSpotify } from '../spotify'
import { useUi } from '../ui'
import { G } from './glyphs'

/** Volumen del dispositivo de Spotify: la barra responde al instante y envía el valor cuando dejas de moverla. */
function useVolume(): { value: number | null; set: (v: number) => void; toggleMute: () => void } {
  const sp = useSpotify()
  const ui = useUi()
  const remote = sp.now?.volume ?? null
  const [local, setLocal] = useState<number | null>(null) // valor mientras se arrastra (la lectura periódica no lo pisa)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const before = useRef(40) // volumen anterior al silencio, para devolverlo
  useEffect(() => () => clearTimeout(timer.current), [])

  const send = (v: number): void => {
    void spotifyVolume(v).then((m) => {
      if (m) ui.toast(m, true)
      setLocal(null)
    })
  }
  const set = (v: number): void => {
    setLocal(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => send(v), 180)
  }
  const value = local ?? remote
  const toggleMute = (): void => {
    const cur = value ?? 0
    if (cur > 0) {
      before.current = cur
      send(0)
    } else send(before.current || 40)
  }
  return { value, set, toggleMute }
}

function Slider({ value, onChange }: { value: number; onChange: (v: number) => void }): ReactNode {
  return <input className="vol-range" type="range" min={0} max={100} step={1} value={value} aria-label="Volumen" style={{ ['--v' as string]: `${value}%` }} onChange={(e) => onChange(Number(e.target.value))} />
}

/** `inline` en la vista Música (botón de silencio + barra); `mini` como botón con barra desplegable en el mini reproductor. */
export function VolumeControl({ variant }: { variant: 'inline' | 'mini' }): ReactNode {
  const { value, set, toggleMute } = useVolume()
  const [open, setOpen] = useState(false)
  if (value === null) return null // sin dispositivo activo, o uno que no deja cambiar el volumen
  const icon = <G n={value === 0 ? 'mute' : 'volume'} size={variant === 'mini' ? 14 : 18} />
  if (variant === 'inline') {
    return (
      <div className="vol">
        <button className="ib" title={value === 0 ? 'Quitar el silencio' : 'Silenciar'} aria-label={value === 0 ? 'Quitar el silencio' : 'Silenciar'} onClick={toggleMute}>
          {icon}
        </button>
        <Slider value={value} onChange={set} />
        <span className="vol-n">{value}%</span>
      </div>
    )
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="ib mp-b" title={`Volumen · ${value}%`} aria-label="Volumen de Spotify">
          {icon}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pmenu vol-menu" side="bottom" align="end" sideOffset={8} collisionPadding={12}>
          <div className="vol">
            <button className="ib" title={value === 0 ? 'Quitar el silencio' : 'Silenciar'} aria-label={value === 0 ? 'Quitar el silencio' : 'Silenciar'} onClick={toggleMute}>
              <G n={value === 0 ? 'mute' : 'volume'} size={16} />
            </button>
            <Slider value={value} onChange={set} />
            <span className="vol-n">{value}%</span>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
