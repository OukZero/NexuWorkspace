import { app, Menu, nativeImage, Tray } from 'electron'
import fs from 'fs'
import path from 'path'
import { commit, getDb } from './db'
import { stopActive } from './timer'
import { showWin } from './windows'

let tray: Tray | null = null

/** Arranque con Windows: se inicia oculto (en la bandeja) para que el timer y los avisos sigan funcionando. */
export function applyLoginItem(): void {
  const openAtLogin = getDb().settings.launchAtLogin
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] })
  else app.setLoginItemSettings({ openAtLogin, path: process.execPath, args: [app.getAppPath(), '--hidden'] })
}

export function initTray(): void {
  const icon = path.join(__dirname, '../../resources/shutoki-ai.ico')
  if (!fs.existsSync(icon)) return // sin icono no hay bandeja (se genera con `npm run icon`)
  tray = new Tray(nativeImage.createFromPath(icon))
  tray.setToolTip('Shutoki AI Workspace')
  tray.on('click', showWin)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Shutoki AI Workspace', click: showWin },
      {
        label: 'Detener el timer',
        click: () => {
          stopActive()
          getDb().paused = null
          commit()
        }
      },
      { type: 'separator' },
      { label: 'Salir', click: () => app.quit() }
    ])
  )
}
