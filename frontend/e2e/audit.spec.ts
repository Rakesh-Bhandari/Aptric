import { writeFileSync, mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { test } from '@playwright/test';
import { openRoute } from './fixtures/app';
import { ROUTES } from './fixtures/routes';

// Opt-in report of small tap targets and all axe findings per route: AUDIT=1 npx playwright test audit
test.skip(!process.env.AUDIT, 'Set AUDIT=1 to write the audit report to e2e/.audit');
mkdirSync('e2e/.audit', { recursive: true });
for (const route of ROUTES) {
  for (const theme of ['light', 'dark'] as const) {
    test(`audit ${route.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await openRoute(page, route.path, { ...route.mock, theme });
      const small = await page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll('a[href],button,input,select,textarea,[role=tab],[role=switch],summary,[tabindex="0"]').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return;
          const s = getComputedStyle(el);
          if (s.visibility === 'hidden') return;
          if (el.closest('p, li p, .prose-question') && el.tagName === 'A') return;
          if ((el as HTMLInputElement).type === 'hidden') return;
          if (r.height < 44 || r.width < 44) {
            const label = (el.getAttribute('aria-label') || el.textContent || (el as HTMLInputElement).placeholder || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
            out.push(`${Math.round(r.width)}x${Math.round(r.height)} ${el.tagName.toLowerCase()} "${label}"`);
          }
        });
        return out;
      });
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      const v = axe.violations.map((x) => ({ id: x.id, impact: x.impact, nodes: x.nodes.slice(0, 6).map((n) => `${n.target.join(' ')} :: ${n.failureSummary?.split('\n').slice(1, 2).join('')}`) }));
      writeFileSync(`e2e/.audit/${route.name}-${theme}.json`, JSON.stringify({ small, axe: v }, null, 1));
    });
  }
}
