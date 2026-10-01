import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Reads the colour tokens from index.css and checks every text/background
// pair the UI uses against WCAG AA (4.5:1) in light and dark mode.
const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
};

const light = block(':root');
const dark = { ...light, ...block("[data-theme='dark']") };

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'], ['foreground', 'card'], ['foreground', 'muted'],
  ['muted-foreground', 'background'], ['muted-foreground', 'card'], ['muted-foreground', 'muted'],
  ['primary-foreground', 'primary'], ['primary', 'card'], ['primary', 'background'],
  ['primary-soft-foreground', 'primary-soft'],
  ['success-soft-foreground', 'success-soft'], ['danger-soft-foreground', 'danger-soft'], ['warning-soft-foreground', 'warning-soft'],
  ['success', 'card'], ['danger', 'card'],
];

describe.each([['light', light], ['dark', dark]] as const)('%s theme contrast', (_name, tokens) => {
  it.each(TEXT_PAIRS)('%s on %s meets AA', (fg, bg) => {
    expect(tokens[fg], `missing --${fg}`).toBeDefined();
    expect(tokens[bg], `missing --${bg}`).toBeDefined();
    expect(ratio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

// Filled status chips: white text in light mode, page background in dark.
describe('status fills', () => {
  it.each(['success', 'danger', 'warning', 'primary'])('text on %s meets AA in both themes', (fill) => {
    expect(ratio('#ffffff', light[fill])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark.background, dark[fill])).toBeGreaterThanOrEqual(4.5);
  });
});
