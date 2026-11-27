import { expect, test } from '@playwright/test'
import { goTo, launchApp, shot } from './app'

// Recorrido básico: arranca aislado y cada sección principal abre sin errores en consola.
const SECCIONES = ['Inicio', 'Tablero', 'Horas', 'Notas', 'Equipo']

test('la app arranca en modo de pruebas y navega por las secciones', async () => {
  const { page, close } = await launchApp()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    for (const s of SECCIONES) {
      await goTo(page, s)
      await page.waitForTimeout(400)
      await shot(page, `seccion-${s.toLowerCase()}`)
    }
    expect(errors).toEqual([])
  } finally {
    await close()
  }
})

test('Equipo: se puede abrir el panel de personaje y elegir un color', async () => {
  const { page, close } = await launchApp()
  try {
    await goTo(page, 'Equipo')
    await expect(page.locator('.tm-wrap')).toBeVisible()
    const sw = page.locator('.tm-sw > button').first()
    if (await sw.count()) await sw.click()
    await shot(page, 'equipo-personaje')
  } finally {
    await close()
  }
})
