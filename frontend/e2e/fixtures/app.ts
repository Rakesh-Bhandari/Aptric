import type { Page } from '@playwright/test';
import { FIXED_NOW } from './data';
import { mockApi, type MockOptions } from './mockApi';

/** Opens a route against the mocked API with a fixed clock, and waits for it to settle. */
export async function openRoute(page: Page, path: string, mock: MockOptions = {}) {
  await page.clock.setFixedTime(FIXED_NOW);
  const unknown = await mockApi(page, mock);
  await page.goto(path);
  await page.waitForLoadState('networkidle', { timeout: mock.hang ? 1_500 : 15_000 }).catch(() => {});
  if (!mock.hang) {
    // Wait for skeletons and the route loader to go.
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 5_000 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready);
  } else {
    await page.waitForTimeout(500);
  }
  return unknown;
}

/** Scrolls through the page so scroll-reveal sections show, then back to the top. */
export async function revealAll(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight / 2) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(700);
}

/** Horizontal overflow of the page (0 = none). */
export const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
