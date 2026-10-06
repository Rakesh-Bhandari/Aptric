import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { horizontalOverflow, openRoute } from './fixtures/app';
import { ROUTES } from './fixtures/routes';

// Accessibility and layout checks against the mocked API (npm run e2e).

const main = ROUTES.filter((r) => r.main);

test.describe('axe: no serious or critical issues', () => {
  for (const route of [...main, ...ROUTES.filter((r) => ['contest', 'onboarding', 'admin-review', 'admin-question', 'friends', 'followers', 'public-profile-community', 'compete-friends', 'settings-community'].includes(r.name))]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${route.name} ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openRoute(page, route.path, { ...route.mock, theme });
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        const blocking = violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
        expect(blocking).toEqual([]);
      });
    }
  }
});

test.describe('no horizontal scroll at 360px', () => {
  for (const route of ROUTES) {
    test(route.name, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await openRoute(page, route.path, route.mock);
      expect(await horizontalOverflow(page)).toBe(0);
    });
  }
});

test('the bottom tab bar never covers the end of the page', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await openRoute(page, '/progress');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const { barTop, lastBottom } = await page.evaluate(() => {
    const bar = [...document.querySelectorAll('nav')].find((n) => getComputedStyle(n).position === 'fixed')!;
    // The last piece of text on the page (the footer's copyright line).
    const texts = [...document.querySelectorAll('footer p, footer a, footer li')];
    const lastBottom = Math.max(...texts.map((t) => t.getBoundingClientRect().bottom));
    return { barTop: bar.getBoundingClientRect().top, lastBottom };
  });
  expect(lastBottom).toBeLessThanOrEqual(barTop + 1);
});

test('the solve action bar is on screen and clear of any tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openRoute(page, '/solve/daily');
  const bar = page.getByRole('button', { name: 'Check answer' });
  const box = (await bar.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(640);
  // Focus screens have no tab bar, and the button text isn't clipped.
  expect(await page.locator('nav').filter({ hasText: 'Progress' }).count()).toBe(0);
  expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

for (const mode of ['os', 'in-app'] as const) {
  test(`reduced motion (${mode}) stops every animation`, async ({ page }) => {
    if (mode === 'os') await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const [path, mock] of [['/', { signedIn: false }], ['/', {}], ['/compete', {}], ['/session/summary?daily=ds-today', {}], ['/compete', { hang: true }]] as const) {
      await openRoute(page, path, { ...mock, reduceMotion: mode === 'in-app' });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
      const moving = await page.evaluate(() => [...document.querySelectorAll('*')].flatMap((el) => {
        const out: string[] = [];
        for (const pseudo of [null, '::before', '::after']) {
          const s = getComputedStyle(el, pseudo);
          const running = s.animationName !== 'none' && s.display !== 'none' &&
            (s.animationIterationCount === 'infinite' || parseFloat(s.animationDuration) > 0.05);
          if (running) out.push(`${el.tagName}${pseudo ?? ''}.${String(el.className).slice(0, 50)} ${s.animationName}`);
        }
        const hidden = el.closest('.confetti') && getComputedStyle(el.closest('.confetti')!).display !== 'none';
        if (hidden) out.push('confetti visible');
        if (el.hasAttribute('data-reveal') && getComputedStyle(el).opacity !== '1') out.push('reveal hidden');
        return out;
      }));
      expect(moving, `${path}`).toEqual([]);
    }
  });
}

// Lazy routes, the landing hero SVG and the overlay header must not shift the page.
for (const [name, mock] of [['landing', { signedIn: false }], ['today', {}]] as const) {
  for (const width of [390, 1280]) {
    test(`no layout shift: ${name} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(() => {
        const w = window as unknown as { __cls: number };
        w.__cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) w.__cls += e.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await openRoute(page, '/', mock);
      await page.waitForTimeout(1_000);
      expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
    });
  }
}
