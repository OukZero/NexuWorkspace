import * as Popover from '@radix-ui/react-popover'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { refreshDevices, transferTo, useSpotify } from '../spotify'
import { useDB } from '../store'
import { useUi } from '../ui'
import { G } from './glyphs'

const KIND: Record<string, string> = { Computer: 'Equipo', Smartphone: 'Móvil', Speaker: 'Altavoz', TV: 'TV', Tablet: 'Tableta', CastAudio: 'Chromecast', CastVideo: 'Chromecast', AVR: 'Receptor', STB: 'Decodificador', AudioDongle: 'Adaptador', GameConsole: 'Consola', Automobile: 'Auto' }

/** Lista de dispositivos de Spotify: al pulsar uno, la música pasa a sonar allí y queda como tu preferido. */
function DeviceList({ onDone }: { onDone?: () => void }): ReactNode {
  const sp = useSpotify()
  const db = useDB()
  const ui = useUi()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const refresh = async (): Promise<void> => {
    setBusy('list')
    setErr(await refreshDevices())
    setBusy('')
  }
  useEffect(() => {
    void refresh()
  }, [])

  const pick = async (id: string): Promise<void> => {
    setBusy(id)
    const m = await transferTo(id)
    setBusy('')
    if (m) ui.toast(m, true)
    else onDone?.()
  }

  const preferred = db.settings.spotifyDeviceId
  const preferredName = db.settings.spotifyDeviceName
  return (
    <div className="devlist">
      <div className="dev-head">
        <b>Reproducir en</b>
        <button className="btn sm" disabled={busy === 'list'} onClick={() => void refresh()} title="Volver a buscar dispositivos (abre Spotify en el equipo o el móvil para que aparezca)">
          {busy === 'list' ? 'Buscando…' : 'Actualizar'}
        </button>
      </div>
      {sp.devices.map((d) => {
        const mine = d.id === preferred || (!!preferredName && d.name === preferredName)
        return (
          <button key={d.id} className={`dev-row ${d.active ? 'on' : ''}`} disabled={!!busy} onClick={() => void pick(d.id)} title={d.active ? 'Está sonando aquí' : 'Pasar la música a este dispositivo'}>
            <span className="dev-n">{d.name}</span>
            <span className="dev-k">
              {KIND[d.type] ?? d.type}
              {d.active ? ' · sonando aquí' : ''}
              {mine ? ' · tu preferido' : ''}
            </span>
            {busy === d.id && <span className="dev-k">pasando…</span>}
          </button>
        )
      })}
      {!sp.devices.length && busy !== 'list' && (
        <div className="meta">{err || 'No hay dispositivos. Abre la aplicación de Spotify en este equipo o en el móvil y pulsa «Actualizar».'}</div>
      )}
      {!!sp.devices.length && err && <div className="meta">{err}</div>}
    </div>
  )
}

/** Selector de dispositivo: `inline` dentro de la vista Música, `mini` como botón con menú en el mini reproductor. */
export function DevicePicker({ variant }: { variant: 'inline' | 'mini' }): ReactNode {
  const [open, setOpen] = useState(false)
  if (variant === 'inline') return <DeviceList />
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="ib mp-b" title="Elegir dónde suena Spotify" aria-label="Elegir dispositivo de Spotify">
          <G n="list" size={14} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pmenu dev-menu" side="bottom" align="end" sideOffset={8} collisionPadding={12}>
          <DeviceList onDone={() => setOpen(false)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
