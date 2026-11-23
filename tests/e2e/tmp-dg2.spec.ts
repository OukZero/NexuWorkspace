import { test } from '@playwright/test'
import { launchApp, goTo, shot } from './app'
test('dg2', async () => {
  const a = await launchApp()
  const p = a.page
  const errs: string[] = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.evaluate(() => (window as any).api.call('task:save', { title: 'Tarea prueba', status: 'today' }))
  await goTo(p, 'Diagramas')
  await p.locator('.dg-new').click()
  await p.getByText('BPMN', { exact: true }).last().click()
  await p.waitForTimeout(800)
  await shot(p, 'x-bpmn')
  await p.getByRole('button', { name: /IA/ }).click()
  await p.waitForTimeout(500)
  await p.waitForTimeout(1200)
  await shot(p, 'x-ai')
  console.log('ERRS', JSON.stringify(errs))
  await a.close()
})
