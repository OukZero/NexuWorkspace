import { api } from '../../api'
import { commit, getDb } from '../../db'
import * as spotify from './service'

export function registerSpotifyIpc(): void {
  api('spotify:status', async () => {
    await spotify.ensureLoaded() // la sesión cifrada se lee de forma asíncrona
    return spotify.getStatus()
  })
  api('spotify:save', (c) => {
    const s = getDb().settings
    const id = c.clientId.trim()
    const focus = c.focusUri.trim()
    if (focus && !spotify.toContextUri(focus)) throw new Error('La lista de enfoque debe ser un enlace de open.spotify.com o una URI spotify:playlist:…')
    if (id !== (s.spotifyClientId ?? '')) spotify.disconnect() // otra app: hay que volver a conectar
    s.spotifyClientId = id
    s.spotifyFocusUri = focus
    s.spotifyAuto = c.auto
    commit()
    return spotify.getStatus()
  })
  api('spotify:connect', () => spotify.connect())
  api('spotify:disconnect', () => spotify.disconnect())
  api('spotify:now', () => spotify.now())
  api('spotify:control', (a) => spotify.control(a))
  api('spotify:devices', () => spotify.listDevices())
  api('spotify:volume', (v) => spotify.setVolume(v))
  api('spotify:transfer', (id) => spotify.transfer(id))
  api('spotify:search', (q) => spotify.search(q))
  api('spotify:playlists', () => spotify.myPlaylists())
  api('spotify:play', (uri) => spotify.playUri(uri))
  api('spotify:queue', (uri) => spotify.queueUri(uri))
}
