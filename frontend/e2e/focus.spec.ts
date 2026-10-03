import { expect, test } from '@playwright/test';
import { openRoute } from './fixtures/app';
import { ROUTES } from './fixtures/routes';

// Every element reached with Tab shows a focus indicator with 3:1 contrast against
// the surface behind it (the nearest solid background; gradients use their first stop).
const routes = ROUTES.filter((r) => r.main || ['contest', 'onboarding', 'admin-review', 'terms'].includes(r.name));

for (const route of routes) {
  for (const theme of ['light', 'dark'] as const) {
    test(`focus rings: ${route.name} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await openRoute(page, route.path, { ...route.mock, theme });
      const bad: string[] = [];
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        await page.waitForTimeout(250); // let focus transitions finish
        const r = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          // Any CSS colour (rgb, oklab, color-mix…) to sRGB bytes, via a 1px canvas.
          const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
          const parse = (c: string) => {
            if (!c || c === 'transparent') return null;
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = '#000'; ctx.fillStyle = c;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
            return { r, g, b, a: a / 255 };
          };
          const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
            const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
          };
          // A focus-within label (sr-only radios) or the element itself carries the ring.
          const target = el.getBoundingClientRect().width <= 1 ? (el.closest('label') as HTMLElement) ?? el : el;
          const s = getComputedStyle(target);
          let ring: string | null = null;
          if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) ring = s.outlineColor;
          else if (s.boxShadow !== 'none') {
            // Tailwind stacks transparent placeholder shadows; take the most opaque layer.
            const layers = s.boxShadow.match(/(?:rgba?|oklab|oklch|color)\([^)]+\)/g) ?? [];
            ring = layers.sort((x, y) => (parse(y)?.a ?? 0) - (parse(x)?.a ?? 0))[0] ?? null;
            if (ring && (parse(ring)?.a ?? 0) < 0.9) ring = null;
          }
          // SVG marks (radar points) ring the visible circle with a stroke.
          if (!ring && target instanceof SVGGElement) {
            const mark = target.querySelector('circle:last-child');
            if (mark) ring = getComputedStyle(mark).stroke;
          }
          const name = `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`;
          if (!ring) return { name, ratio: 0 };
          // Surface behind the ring: the first opaque ancestor background (outline sits outside the element).
          let node: HTMLElement | null = target.parentElement; let bg = null;
          while (node) {
            const cs = getComputedStyle(node);
            const c = parse(cs.backgroundColor);
            if (c && c.a > 0.9) { bg = c; break; }
            const grad = cs.backgroundImage.match(/(?:rgba?|oklab|oklch|color)\([^)]+\)/);
            if (grad) { bg = parse(grad[0]); break; }
            node = node.parentElement;
          }
          bg ??= parse(getComputedStyle(document.body).backgroundColor)!;
          const a = lum(parse(ring)!), b = lum(bg!);
          return { name, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
        });
        if (!r) continue;
        if (r.ratio < 3) bad.push(`${r.name} ${r.ratio.toFixed(2)}`);
      }
      expect([...new Set(bad)]).toEqual([]);
    });
  }
}
