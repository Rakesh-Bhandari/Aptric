import { useId } from 'react';
import { cn } from '@/lib/utils';

/*
 * The peak from the brand spec's usage example: layered blue and violet ranges,
 * a pine treeline, a glowing Light Blue path winding up to the summit and a small
 * violet flag on top. One SVG serves both themes: every colour reads a --mtn-*
 * variable from the .hero-art block in index.css (misty blue-lavender in light
 * mode, deep navy, blue and violet in dark mode). Fixed width/height attributes
 * keep the box stable before CSS loads (no layout shift).
 */

/** A pine silhouette: two stacked tiers and a short trunk, standing on baseY. */
const pine = (x: number, baseY: number, h: number) => {
  const w = h * 0.42;
  const mid = baseY - h * 0.5;
  return (
    `M${x} ${baseY - h}L${x + w * 0.42} ${mid + h * 0.06}L${x + w * 0.22} ${mid + h * 0.06}` +
    `L${x + w * 0.55} ${baseY - h * 0.08}L${x + 1.5} ${baseY - h * 0.08}L${x + 1.5} ${baseY}` +
    `L${x - 1.5} ${baseY}L${x - 1.5} ${baseY - h * 0.08}L${x - w * 0.55} ${baseY - h * 0.08}` +
    `L${x - w * 0.22} ${mid + h * 0.06}L${x - w * 0.42} ${mid + h * 0.06}Z`
  );
};

// Treelines, generated once: [x, height] pairs along two rows at the foot.
const BACK_TREES = [
  [16, 34], [40, 44], [62, 30], [86, 48], [110, 36], [418, 34], [446, 46], [470, 32], [500, 52], [528, 38], [556, 58], [584, 42], [612, 54], [636, 40],
].map(([x, h]) => pine(x, 468, h)).join('');
const FRONT_TREES = [
  [4, 52], [30, 66], [54, 48], [80, 74], [106, 56], [130, 44], [470, 50], [494, 68], [520, 54], [546, 80], [572, 62], [598, 88], [624, 70], [648, 58],
].map(([x, h]) => pine(x, 518, h)).join('');

// The winding path, from the foot of the main peak to the summit.
const TRAIL =
  'M286 506C330 494 382 482 372 458C362 434 300 432 318 404C336 378 404 380 398 350C392 322 346 318 360 290' +
  'C374 264 414 262 406 236C398 212 370 206 382 182C392 160 412 150 404 128C400 116 400 106 400 96';

const stop = (offset: number, color: string, opacity?: string) => (
  <stop offset={offset} style={{ stopColor: `var(${color})`, stopOpacity: opacity ? `var(${opacity})` : undefined }} />
);

export const HeroMountain = ({ className }: { className?: string }) => {
  const id = useId().replace(/:/g, '');
  const u = (name: string) => `url(#${id}-${name})`;
  const fill = (v: string) => ({ fill: `var(${v})` });
  return (
    <svg
      viewBox="0 0 640 520" width="640" height="520"
      className={cn('hero-art h-auto w-full', className)}
      aria-hidden focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-glow-violet`} cx="420" cy="230" r="190" gradientUnits="userSpaceOnUse">
          {stop(0, '--mtn-glow-violet', '--mtn-glow-opacity')}
          {stop(1, '--mtn-glow-violet', '--mtn-zero')}
        </radialGradient>
        <radialGradient id={`${id}-glow-blue`} cx="270" cy="350" r="165" gradientUnits="userSpaceOnUse">
          {stop(0, '--mtn-glow-blue', '--mtn-glow-opacity')}
          {stop(1, '--mtn-glow-blue', '--mtn-zero')}
        </radialGradient>
        <linearGradient id={`${id}-far`} x1="0" y1="200" x2="0" y2="470" gradientUnits="userSpaceOnUse">
          {stop(0, '--mtn-far-top')}
          {stop(1, '--mtn-far-bottom')}
        </linearGradient>
        <linearGradient id={`${id}-mid`} x1="0" y1="170" x2="0" y2="500" gradientUnits="userSpaceOnUse">
          {stop(0, '--mtn-mid-top')}
          {stop(1, '--mtn-mid-bottom')}
        </linearGradient>
        <linearGradient id={`${id}-lit`} x1="330" y1="90" x2="250" y2="500" gradientUnits="userSpaceOnUse">
          {stop(0, '--mtn-lit-top')}
          {stop(1, '--mtn-lit-bottom')}
        </linearGradient>
        <linearGradient id={`${id}-shade`} x1="420" y1="90" x2="560" y2="500" gradientUnits="userSpaceOnUse">
          {stop(0, '--mtn-shade-top')}
          {stop(1, '--mtn-shade-bottom')}
        </linearGradient>
        <linearGradient id={`${id}-mist`} x1="0" y1="380" x2="0" y2="520" gradientUnits="userSpaceOnUse">
          {stop(0, '--mtn-mist', '--mtn-zero')}
          {stop(0.55, '--mtn-mist', '--mtn-mist-opacity')}
          {stop(1, '--mtn-mist')}
        </linearGradient>
        <filter id={`${id}-blur`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id={`${id}-cloud`} x="-30%" y="-60%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* Soft blue and violet glows behind the range, and faint stars (dark mode only). */}
      <rect width="640" height="520" fill={u('glow-violet')} />
      <rect width="640" height="520" fill={u('glow-blue')} />
      <g style={{ ...fill('--mtn-star'), opacity: 'var(--mtn-star-opacity)' }}>
        <circle cx="96" cy="70" r="1.5" />
        <circle cx="190" cy="34" r="1" />
        <circle cx="560" cy="60" r="1.5" />
        <circle cx="612" cy="150" r="1" />
        <circle cx="500" cy="24" r="1" />
        <circle cx="270" cy="110" r="1" />
      </g>

      {/* Far misty range. */}
      <path d="M0 470V330L60 282L112 316L176 246L238 300L282 268L330 310L470 236L530 278L580 228L640 270V470Z" fill={u('far')} />

      {/* Mid ranges either side of the main peak. */}
      <path d="M0 500V378L56 330L118 262L168 312L214 350L300 500Z" fill={u('mid')} />
      <path d="M420 500L500 300L560 196L600 252L640 288V500Z" fill={u('mid')} />
      <path d="M560 196L540 236L520 290L552 262L566 222Z" style={{ ...fill('--mtn-ridge'), opacity: 0.45 }} />

      {/* Main peak: lit left face, violet-shaded right face, a pale rim on the ridge. */}
      <path d="M110 520L210 400L270 318L320 224L362 148L400 90L438 150L476 214L520 290L566 370L640 470V520Z" fill={u('lit')} />
      <path d="M400 90L438 150L476 214L520 290L566 370L640 470V520H420L432 440L404 360L428 286L404 210L414 146Z" fill={u('shade')} />
      <path d="M400 90L362 148L320 224L270 318L210 400" fill="none" style={{ stroke: 'var(--mtn-ridge)' }} strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M400 90L414 146L404 210L428 286" fill="none" style={{ stroke: 'var(--mtn-ridge)' }} strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* The glowing path: a blurred Light Blue halo under a bright core. */}
      <path d={TRAIL} fill="none" stroke="#38bdf8" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" filter={u('blur')} style={{ opacity: 'var(--mtn-trail-glow)' }} />
      <path d={TRAIL} fill="none" stroke="#38bdf8" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={TRAIL} fill="none" stroke="#e0f2fe" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="400" cy="92" r="14" fill="#38bdf8" opacity="0.45" filter={u('blur')} />

      {/* Violet flag on the summit. */}
      <path d="M400 92V46" style={{ stroke: 'var(--mtn-pole)' }} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M401 47L436 56L401 67Z" style={fill('--mtn-flag')} />

      {/* Treelines and the low mist / clouds that soften the foot. */}
      <path d={BACK_TREES} style={{ ...fill('--mtn-tree-back'), opacity: 'var(--mtn-tree-back-opacity)' }} />
      <rect y="380" width="640" height="140" fill={u('mist')} />
      <g filter={u('cloud')} style={{ ...fill('--mtn-cloud'), opacity: 'var(--mtn-cloud-opacity)' }}>
        <ellipse cx="520" cy="470" rx="150" ry="30" />
        <ellipse cx="610" cy="430" rx="90" ry="22" />
        <ellipse cx="300" cy="496" rx="160" ry="26" />
        <ellipse cx="120" cy="462" rx="110" ry="20" />
      </g>
      <path d={FRONT_TREES} style={fill('--mtn-tree')} />
    </svg>
  );
};
