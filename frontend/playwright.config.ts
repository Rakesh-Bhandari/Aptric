import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// The cloud image ships Chromium at /opt/pw-browsers; use it when the bundled
// browser for this Playwright version isn't installed.
const systemChromium = '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: true,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:6969',
    ...devices['Desktop Chrome'],
    launchOptions: existsSync(systemChromium) ? { executablePath: systemChromium } : {},
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:6969',
    reuseExistingServer: true,
    env: { VITE_API_URL: 'http://localhost:5000' },
  },
});
