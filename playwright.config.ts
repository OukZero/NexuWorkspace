import { defineConfig } from '@playwright/test'

// Cada test abre su propia instancia de la app con datos temporales: se ejecutan en serie.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/report.json' }]],
  outputDir: 'test-results/artifacts'
})
