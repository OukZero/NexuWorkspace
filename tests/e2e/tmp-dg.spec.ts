import { test } from '@playwright/test'
import { launchApp, goTo, shot } from './app'
test('diagramas', async () => {
  const a = await launchApp()
  const p = a.page
  await p.evaluate(() => (window as any).api.call('task:save', { title: 'Tarea prueba', status: 'today' }))
  await goTo(p, 'Diagramas')
  await p.locator('.dg-new').click()
  await p.getByText('UML · Clases', { exact: true }).last().click()
  await p.waitForTimeout(1200)
  await p.getByRole('button', { name: '✦ IA' }).click()
  await p.waitForTimeout(500)
  await p.waitForTimeout(1500)
  await shot(p, 'dg-ai2')
  await a.close()
})
