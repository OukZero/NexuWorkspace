import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'

const root = path.resolve(__dirname, '../..')

/** Abre la app compilada (out/) en modo de pruebas: datos temporales, sin sesión ni integraciones. */
export async function launchApp(reuseDir?: string): Promise<{ app: ElectronApplication; page: Page; dataDir: string; close: (keepData?: boolean) => Promise<void> }> {
  const dataDir = reuseDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'shutoki-e2e-'))
  const app = await electron.launch({
    args: [root],
    cwd: root,
    env: { ...process.env, SHUTOKI_TEST: '1', SHUTOKI_DATA_DIR: dataDir, ELECTRON_ENABLE_LOGGING: '' } as Record<string, string>
  })
  // la ventana principal es la que carga la interfaz (puede haber otras auxiliares)
  const isMain = (u: string): boolean => u.includes('index.html')
  await app.firstWindow()
  const deadline = Date.now() + 30000
  let page = app.windows().find((w) => isMain(w.url()))
  while (!page && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200))
    page = app.windows().find((w) => isMain(w.url()))
  }
  if (!page) throw new Error('No se abrió la ventana principal.')
  await page.waitForSelector('#nav', { timeout: 30000 })
  const close = async (keepData = false): Promise<void> => {
    await app.close().catch(() => undefined)
    if (!keepData) fs.rmSync(dataDir, { recursive: true, force: true })
  }
  return { app, page, dataDir, close }
}

/** Abre una sección del menú lateral por su nombre visible (p. ej. «Equipo»). */
export async function goTo(page: Page, name: string): Promise<void> {
  // las secciones fijadas están en el riel; el resto, dentro del menú «+»
  const pinned = page.locator('#nav .tn-i', { hasText: name }).first()
  if (await pinned.count()) return pinned.click()
  await page.locator('#nav .tn-plus').click()
  await page.locator('.tn-more').getByText(name, { exact: true }).first().click()
}

export const shotsDir = path.join(root, 'test-results', 'screens')
export async function shot(page: Page, name: string): Promise<string> {
  fs.mkdirSync(shotsDir, { recursive: true })
  const file = path.join(shotsDir, `${name}.png`)
  await page.screenshot({ path: file })
  return file
}
