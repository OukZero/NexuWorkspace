import { app, Menu, nativeImage, Tray } from 'electron'
import fs from 'fs'
import path from 'path'
import { withDot } from './badge'
import { commit, getDb } from './db'
import { quitApp } from './quit'
import { stopActive } from './timer'
import { showWin } from './windows'

let tray: Tray | null = null
let baseIcon: Electron.NativeImage | null = null
let unread = 0
let openWsp: () => void = () => {}

/** Arranque con Windows: se inicia oculto (en la bandeja) para que el timer y los avisos sigan funcionando. */
export function applyLoginItem(): void {
  const openAtLogin = getDb().settings.launchAtLogin
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] })
  else app.setLoginItemSettings({ openAtLogin, path: process.execPath, args: [app.getAppPath(), '--hidden'] })
}

function trayMenu(): Electron.Menu {
  return Menu.buildFromTemplate([
    { label: 'Abrir Nexu Workspace', click: showWin },
    { label: unread > 0 ? `Abrir WhatsApp (${unread} sin leer)` : 'Abrir WhatsApp', click: () => openWsp() },
    {
      label: 'Detener el timer',
      click: () => {
        stopActive()
        getDb().paused = null
        commit()
      }
    },
    { type: 'separator' },
    { label: 'Salir', click: () => quitApp() }
  ])
}

export function initTray(onWhatsApp: () => void): void {
  openWsp = onWhatsApp
  const icon = path.join(__dirname, '../../resources/nexo.ico')
  if (!fs.existsSync(icon)) return // sin icono no hay bandeja (se genera con `npm run icon`)
  baseIcon = nativeImage.createFromPath(icon)
  tray = new Tray(baseIcon)
  tray.setToolTip('Nexu Workspace')
  tray.on('click', showWin)
  tray.setContextMenu(trayMenu())
}

/** Quita el icono de la bandeja al salir: si no, Windows lo deja como «fantasma» en los iconos ocultos hasta pasar el cursor. */
export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) tray.destroy()
  tray = null
}

/** Muestra en la bandeja los mensajes de WhatsApp sin leer (punto rojo y texto al pasar el ratón). */
export function setUnreadBadge(n: number): void {
  unread = n
  if (!tray) return
  if (baseIcon) tray.setImage(n > 0 ? withDot(baseIcon) : baseIcon)
  tray.setToolTip(n > 0 ? `Nexu Workspace · WhatsApp: ${n} sin leer` : 'Nexu Workspace')
  tray.setContextMenu(trayMenu())
}
