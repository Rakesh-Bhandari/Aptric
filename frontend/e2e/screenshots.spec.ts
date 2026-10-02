import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { horizontalOverflow, openRoute, revealAll } from './fixtures/app';
import { ROUTES, WIDTHS } from './fixtures/routes';

// Visual audit: every route at 360/390/768/1280 in light and dark, against
// the mocked API. Opt-in (SHOTS=1) because it writes ~250 full-page images:
//   SHOTS=1 npx playwright test screenshots            # all routes
//   SHOTS=1 MAIN=1 SHOT_DIR=shots/after npx playwright test screenshots
const dir = process.env.SHOT_DIR ?? 'e2e/.screenshots';
const routes = process.env.MAIN ? ROUTES.filter((r) => r.main) : ROUTES;
const widths = process.env.MAIN ? [390, 1280] : WIDTHS;

test.skip(!process.env.SHOTS, 'Set SHOTS=1 to take the screenshot set');

for (const route of routes) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of widths) {
      test(`${route.name} ${theme} ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        const unknown = await openRoute(page, route.path, { ...route.mock, theme });
        if (!route.mock?.hang) await revealAll(page);
        const file = path.join(dir, `${route.name}-${theme}-${width}.png`);
        mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
        const overflow = await horizontalOverflow(page);
        if (overflow > 0 || unknown.length) {
          writeFileSync(`${file}.txt`, JSON.stringify({ overflow, unknown }, null, 2));
        }
      });
    }
  }
}
