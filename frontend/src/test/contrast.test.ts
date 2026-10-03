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
  ['accent-text', 'card'], ['accent-text', 'background'], ['accent-text', 'primary-soft'], ['accent-text', 'muted'],
  // Secondary button (rest and hover) and violet fills (achievement CTAs, soft badges).
  ['primary-soft-hover-foreground', 'primary-soft-hover'],
  ['violet-foreground', 'violet'], ['violet-foreground', 'violet-strong'], ['violet-soft-foreground', 'violet-soft'],
  ['violet-text', 'card'], ['violet-text', 'background'], ['violet-text', 'muted'],
  // Card variant="soft": text on the Soft Purple section fill.
  ['foreground', 'violet-soft'], ['heading', 'violet-soft'], ['muted-foreground', 'violet-soft'],
  // Outline button hover: blue text on the pale wash.
  ['accent-text', 'primary-wash'],
  ['success-soft-foreground', 'success-soft'], ['danger-soft-foreground', 'danger-soft'], ['warning-soft-foreground', 'warning-soft'],
  ['success', 'card'], ['danger', 'card'],
  // Selected onboarding goal cards: title and hint on the soft-blue fill.
  ['heading', 'primary-soft'], ['muted-foreground', 'primary-soft'],
  // League tier names and icons on cards.
  ['tier-bronze', 'card'], ['tier-silver', 'card'], ['tier-gold', 'card'], ['tier-platinum', 'card'], ['tier-diamond', 'card'],
  // Rank 1–3 medals (league, leaderboards, contest standings): navy numbers on metal fills.
  ['medal-foreground', 'medal-gold'], ['medal-foreground', 'medal-silver'], ['medal-foreground', 'medal-bronze'],
  // Text on the navy-gradient hero (Daily card, placement intro): both gradient stops.
  ['navy-foreground', 'brand-navy'], ['navy-muted-foreground', 'brand-navy'], ['on-navy-success', 'brand-navy'], ['on-navy-danger', 'brand-navy'],
  // App header: white in light mode, midnight in dark mode.
  ['header-foreground', 'header'], ['header-muted-foreground', 'header'],
  // Navy chrome: footer, auth banner, dark tab bar. Light Blue is the link and icon colour there.
  ['chrome-foreground', 'chrome'], ['chrome-foreground', 'chrome-deep'],
  ['chrome-muted-foreground', 'chrome'], ['chrome-muted-foreground', 'chrome-deep'],
  ['chrome-accent', 'chrome'], ['chrome-accent', 'chrome-deep'],
  ['sky', 'navy'], ['sky', 'navy-strong'], ['sky', 'chrome'], ['sky', 'brand-navy'],
  // Admin sidebar: active item on the raised navy step.
  ['chrome-foreground', 'chrome-raised'], ['chrome-muted-foreground', 'chrome-raised'],
];

// Blue (--primary) is a fill with white text in both themes; blue *text* uses
// --accent-text (checked above). On the dark surfaces of dark mode, Light Blue
// (--sky) is fine as text and icon colour. The tab bar sits on --chrome in dark
// mode, with muted and accent labels.
const DARK_ONLY_PAIRS: [string, string][] = [
  ['sky', 'card'], ['sky', 'background'], ['muted-foreground', 'chrome'], ['accent-text', 'chrome'],
];

describe.each([['light', light], ['dark', dark]] as const)('%s theme contrast', (_name, tokens) => {
  it.each(TEXT_PAIRS)('%s on %s meets AA', (fg, bg) => {
    expect(tokens[fg], `missing --${fg}`).toBeDefined();
    expect(tokens[bg], `missing --${bg}`).toBeDefined();
    expect(ratio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('dark theme light-blue text', () => {
  it.each(DARK_ONLY_PAIRS)('%s on %s meets AA', (fg, bg) => {
    expect(ratio(dark[fg], dark[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

// The navy-on-white brand text and white-on-navy panels from the spec.
describe('brand surfaces', () => {
  it('navy reads on the light page and white reads on both gradient ends', () => {
    expect(ratio(light.navy, light.background)).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#ffffff', '#0a2540')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#ffffff', '#1e3a8a')).toBeGreaterThanOrEqual(4.5);
    // Muted text inside navy-gradient cards (Card variant="navy").
    expect(ratio(light['navy-muted-foreground'], '#1e3a8a')).toBeGreaterThanOrEqual(4.5);
    // Correct / wrong counts on the Daily card.
    expect(ratio(light['on-navy-success'], '#1e3a8a')).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light['on-navy-danger'], '#1e3a8a')).toBeGreaterThanOrEqual(4.5);
    // Light Blue links and icons on both navy-gradient stops.
    expect(ratio(light.sky, '#0a2540')).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light.sky, '#1e3a8a')).toBeGreaterThanOrEqual(4.5);
  });
  it('the primary gradient carries white text at both stops, at rest and on hover', () => {
    for (const stop of ['#2563eb', '#7c3aed', '#1d4ed8', '#6d28d9']) expect(ratio('#ffffff', stop)).toBeGreaterThanOrEqual(4.5);
  });
  it('display gradient text reaches 3:1 at both stops', () => {
    // Light: the primary gradient on the light page; dark: Light Blue → soft violet on midnight.
    for (const stop of ['#2563eb', '#7c3aed']) expect(ratio(stop, light.background)).toBeGreaterThanOrEqual(3);
    for (const stop of ['#38bdf8', '#a78bfa']) expect(ratio(stop, dark.background)).toBeGreaterThanOrEqual(3);
  });
});

// Filled status chips: --status-foreground (white in light mode, Dark Navy in dark).
// Blue primary fills carry white text (--primary-foreground) in both themes.
describe('status fills', () => {
  it.each(['success', 'danger', 'warning'])('text on %s meets AA in both themes', (fill) => {
    expect(ratio(light['status-foreground'], light[fill])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark['status-foreground'], dark[fill])).toBeGreaterThanOrEqual(4.5);
  });
  it('white text on primary and violet meets AA in both themes', () => {
    for (const t of [light, dark]) {
      expect(t['primary-foreground']).toBe('#ffffff');
      expect(ratio(t['primary-foreground'], t.primary)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['primary-foreground'], t['primary-strong'])).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t['violet-foreground'], t.violet)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// Focus rings need 3:1 against the surfaces they sit on (WCAG 1.4.11).
describe('focus ring', () => {
  it.each([['light', light], ['dark', dark]] as const)('is visible in %s mode', (_name, t) => {
    // Includes the navy header/footer and muted fills, so the ring shows on navy surfaces too.
    for (const bg of ['card', 'background', 'muted', 'navy', 'chrome', 'chrome-deep', 'primary-soft', 'header']) expect(ratio(t.ring, t[bg])).toBeGreaterThanOrEqual(3);
    // Navy surfaces switch to --ring-on-navy (Card variant="navy", footer, auth banner).
    for (const bg of ['navy', 'navy-strong', 'chrome', 'chrome-deep', 'chrome-raised', 'brand-navy']) expect(ratio(t['ring-on-navy'], t[bg])).toBeGreaterThanOrEqual(3);
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
