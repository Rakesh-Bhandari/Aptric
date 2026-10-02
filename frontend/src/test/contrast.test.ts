import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Reads the colour tokens from index.css and checks every text/background
// pair the UI uses against WCAG AA (4.5:1) in light and dark mode.
const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
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
  ['heading', 'background'], ['heading', 'card'], ['card-foreground', 'card'],
  ['muted-foreground', 'background'], ['muted-foreground', 'card'], ['muted-foreground', 'muted'],
  ['primary-foreground', 'primary'], ['primary-foreground', 'primary-strong'],
  ['primary-soft-foreground', 'primary-soft'],
  ['navy-foreground', 'navy'], ['navy-foreground', 'navy-strong'], ['navy-soft-foreground', 'navy-soft'],
  ['navy-muted-foreground', 'navy'], ['navy-muted-foreground', 'navy-strong'],
  ['accent-text', 'card'], ['accent-text', 'background'], ['accent-text', 'primary-soft'],
  ['success-soft-foreground', 'success-soft'], ['danger-soft-foreground', 'danger-soft'], ['warning-soft-foreground', 'warning-soft'],
  ['success', 'card'], ['danger', 'card'],
  // Selected onboarding goal cards: title and hint on the soft-orange fill.
  ['heading', 'primary-soft'], ['muted-foreground', 'primary-soft'],
  // League tier names and icons on cards.
  ['tier-bronze', 'card'], ['tier-silver', 'card'], ['tier-gold', 'card'], ['tier-platinum', 'card'], ['tier-diamond', 'card'],
  // Rank 1–3 medals (league, leaderboards, contest standings): navy numbers on metal fills.
  ['medal-foreground', 'medal-gold'], ['medal-foreground', 'medal-silver'], ['medal-foreground', 'medal-bronze'],
  // Text on the navy-gradient hero (Daily card, placement intro): both gradient stops.
  ['navy-foreground', 'brand-navy'], ['navy-muted-foreground', 'brand-navy'], ['on-navy-success', 'brand-navy'], ['on-navy-danger', 'brand-navy'],
  // App chrome: header, footer, auth banner, dark tab bar.
  ['chrome-foreground', 'chrome'], ['chrome-foreground', 'chrome-deep'],
  ['chrome-muted-foreground', 'chrome'], ['chrome-muted-foreground', 'chrome-deep'],
  ['chrome-accent', 'chrome'], ['chrome-accent', 'chrome-deep'],
  // Admin sidebar: active item on the raised navy step.
  ['chrome-foreground', 'chrome-raised'], ['chrome-muted-foreground', 'chrome-raised'],
];

// Orange (--primary) is a fill in light mode; orange *text* there uses --accent-text
// (checked above). On the navy surfaces of dark mode, orange is fine as text.
// The tab bar sits on --chrome in dark mode, with muted and accent labels.
const DARK_ONLY_PAIRS: [string, string][] = [
  ['primary', 'card'], ['primary', 'background'], ['muted-foreground', 'chrome'], ['accent-text', 'chrome'],
];

describe.each([['light', light], ['dark', dark]] as const)('%s theme contrast', (_name, tokens) => {
  it.each(TEXT_PAIRS)('%s on %s meets AA', (fg, bg) => {
    expect(tokens[fg], `missing --${fg}`).toBeDefined();
    expect(tokens[bg], `missing --${bg}`).toBeDefined();
    expect(ratio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('dark theme orange text', () => {
  it.each(DARK_ONLY_PAIRS)('%s on %s meets AA', (fg, bg) => {
    expect(ratio(dark[fg], dark[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

// The navy-on-white brand text and white-on-navy panels from the spec.
describe('brand surfaces', () => {
  it('navy reads on the light page and white reads on both gradient ends', () => {
    expect(ratio(light.navy, light.background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#ffffff', '#0b1f4b')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#ffffff', '#123a78')).toBeGreaterThanOrEqual(4.5);
    // Muted text inside navy-gradient cards (Card variant="navy").
    expect(ratio(light['navy-muted-foreground'], '#123a78')).toBeGreaterThanOrEqual(4.5);
    // Correct / wrong counts on the Daily card.
    expect(ratio(light['on-navy-success'], '#123a78')).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light['on-navy-danger'], '#123a78')).toBeGreaterThanOrEqual(4.5);
  });
});

// Filled status chips: white text in light mode, page background in dark.
// Orange primary fills carry navy text (--primary-foreground) in both themes.
describe('status fills', () => {
  it.each(['success', 'danger', 'warning'])('text on %s meets AA in both themes', (fill) => {
    expect(ratio('#ffffff', light[fill])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark.background, dark[fill])).toBeGreaterThanOrEqual(4.5);
  });
  it('navy text on primary meets AA in both themes', () => {
    expect(ratio(light['primary-foreground'], light.primary)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark['primary-foreground'], dark.primary)).toBeGreaterThanOrEqual(4.5);
  });
});

// Focus rings need 3:1 against the surfaces they sit on (WCAG 1.4.11).
describe('focus ring', () => {
  it.each([['light', light], ['dark', dark]] as const)('is visible in %s mode', (_name, t) => {
    for (const bg of ['card', 'background', 'navy']) expect(ratio(t.ring, t[bg])).toBeGreaterThanOrEqual(3);
  });
});

// Charts (WCAG 1.4.11): the radar stroke and the top activity step need 3:1 on
// the card they sit on; the activity scale must get steadily stronger from
// --muted (no activity) to --heat-4 (darker in light mode, brighter in dark).
describe('chart colours', () => {
  it.each([['light', light], ['dark', dark]] as const)('stand out on the card in %s mode', (_name, t) => {
    expect(ratio(t['chart-accent'], t.card)).toBeGreaterThanOrEqual(3);
    expect(ratio(t['heat-4'], t.card)).toBeGreaterThanOrEqual(3);
  });
  it.each([['light', light, -1], ['dark', dark, 1]] as const)('activity scale is monotonic in %s mode', (_name, t, dir) => {
    const steps = ['muted', 'heat-1', 'heat-2', 'heat-3', 'heat-4'].map((k) => luminance(t[k]));
    for (let i = 1; i < steps.length; i++) expect(Math.sign(steps[i] - steps[i - 1])).toBe(dir);
  });
});
