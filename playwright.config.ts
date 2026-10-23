import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra el build de producción (astro preview sobre dist/).
 * Ambos proyectos usan Chromium: "mobile" emula iPhone 13 (viewport, touch, UA)
 * con el motor Chromium para no depender de la descarga de WebKit en CI/local.
 * Para ejecutar WebKit real: `npx playwright install webkit` y quitar el override.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'es-PE',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', browserName: 'chromium' },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // `--force` reemplaza un preview huérfano del mismo proyecto (Astro 7 usa un lockfile).
    command: 'npm run build && npm run preview -- --port 4173 --force',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      PUBLIC_SITE_URL: 'https://raiden.test',
      // Número comercial del cliente (ADR-015). helpers.ts lee la misma variable.
      PUBLIC_WHATSAPP_NUMBER: process.env.PUBLIC_WHATSAPP_NUMBER ?? '51989853431',
      // Astro 7 detecta entornos "agente" (CI/IA) y lanza `astro preview` como daemon,
      // con lo que Playwright ve que el proceso termina. Esta variable fuerza primer plano.
      ASTRO_PREVIEW_BACKGROUND: '1',
    },
  },
});
