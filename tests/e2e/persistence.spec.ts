import { expect, test } from '@playwright/test'
import { launchApp } from './app'

// Regresión: los diseños de arquitectura y la guía de estilo vivían solo en memoria porque faltaban en sqlite-store.
test('los diseños de arquitectura y la guía de estilo sobreviven a un reinicio', async () => {
  const a = await launchApp()
  const doc = await a.page.evaluate(() => (window as any).api.call('arch:save', { title: 'Portal', kind: 'App web', scope: 'medium', dir: '', brief: 'Facturas' }))
  await a.page.evaluate(() => (window as any).api.call('design:style-save', { brief: 'sobrio y técnico', links: [] }))
  await a.close(true) // conserva la carpeta de datos
  const b = await launchApp(a.dataDir)
  const list = await b.page.evaluate(() => (window as any).api.call('arch:list'))
  const style = await b.page.evaluate(() => (window as any).api.call('design:style-get'))
  await b.close()
  expect(list.map((d: { id: string }) => d.id)).toContain(doc.id)
  expect(style.brief).toBe('sobrio y técnico')
})
