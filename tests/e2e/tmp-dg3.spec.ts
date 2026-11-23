import { test } from '@playwright/test'
import { launchApp, goTo, shot } from './app'
test('dg3', async () => {
  const a = await launchApp()
  const p = a.page
  const errs: string[] = []
  p.on('pageerror', (e) => errs.push(e.message))
  await goTo(p, 'Diagramas')
  await p.locator('.dg-new').click()
  await p.getByText('Diagrama de flujo', { exact: true }).last().click()
  await p.waitForTimeout(600)
  await shot(p, 'v-flow')
  // añadir figura desde la paleta y conectarla
  await p.locator('.dgv-shape', { hasText: /^Proceso$/ }).click()
  await p.waitForTimeout(200)
  await p.locator('.dgv-props input').first().fill('Paso nuevo')
  await shot(p, 'v-flow-added')
  // otros tipos
  for (const [label, name] of [['UML · Clases', 'class'], ['Entidad-relación (ER)', 'er'], ['UML · Estados', 'state'], ['UML · Secuencia', 'seq']] as const) {
    await p.locator('.dg-new').click()
    await p.getByText(label, { exact: true }).last().click()
    await p.waitForTimeout(500)
    await shot(p, 'v-' + name)
  }
  // eliminar con diálogo propio
  await p.getByRole('button', { name: 'Eliminar' }).click()
  await p.waitForTimeout(300)
  await shot(p, 'v-confirm')
  console.log('ERRS', JSON.stringify(errs))
  await a.close()
})
