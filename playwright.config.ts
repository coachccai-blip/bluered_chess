import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173/bluered_chess/',
    headless: true,
    // Hors CI, on utilise le Chromium pré-installé de l'environnement s'il existe.
    launchOptions: process.env.CI ? {} : { executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' },
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/bluered_chess/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
