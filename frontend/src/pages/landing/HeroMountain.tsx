import { useId } from 'react';
import { cn } from '@/lib/utils';

/*
 * The glowing peak from the brand spec's usage example: layered navy ranges, an
 * orange rim light on the main ridge and a soft glow behind the summit, so the
 * peak reads as the "A" of the mark. Brand artwork on a surface that is navy in
 * both themes, so the colours are literal values rather than theme tokens.
 * Fixed width/height attributes keep the box stable before CSS loads (no layout shift).
 */
export const HeroMountain = ({ className }: { className?: string }) => {
  const id = useId().replace(/:/g, '');
  const u = (name: string) => `url(#${id}-${name})`;
  return (
    <svg
      viewBox="0 0 640 520" width="640" height="520"
      className={cn('h-auto w-full', className)}
      aria-hidden focusable="false"
    >
      <defs>
        <radialGradient id={`${id}-glow`} cx="360" cy="200" r="190" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff7800" stopOpacity="0.5" />
          <stop offset="0.4" stopColor="#ff7800" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ff7800" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-main`} x1="0" y1="70" x2="0" y2="520" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1a4590" />
          <stop offset="0.45" stopColor="#0e2552" />
          <stop offset="1" stopColor="#06132f" />
        </linearGradient>
        <linearGradient id={`${id}-side`} x1="0" y1="190" x2="0" y2="520" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#163c7c" />
          <stop offset="1" stopColor="#06132f" />
        </linearGradient>
        <linearGradient id={`${id}-lit`} x1="300" y1="70" x2="250" y2="390" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffb766" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#ff7800" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ff5a00" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="360" y1="70" x2="180" y2="390" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe0bd" />
          <stop offset="0.35" stopColor="#ff9a3d" />
          <stop offset="1" stopColor="#ff7800" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-blur`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* Glow behind the summit, and a few faint stars. */}
      <circle cx="360" cy="200" r="190" fill={u('glow')} />
      <g fill="#ffffff">
        <circle cx="96" cy="88" r="1.5" opacity="0.5" />
        <circle cx="180" cy="40" r="1" opacity="0.4" />
        <circle cx="560" cy="70" r="1.5" opacity="0.45" />
        <circle cx="610" cy="160" r="1" opacity="0.35" />
        <circle cx="470" cy="30" r="1" opacity="0.4" />
      </g>

      {/* Far range. */}
      <path d="M0 520V350L70 290L120 322L180 258L240 318L300 270L360 330L430 280L500 320L560 258L640 300V520Z" fill="#0e2552" opacity="0.85" />

      {/* Second peak, lit on its left ridge. */}
      <path d="M380 520L470 300L520 190L560 250L600 290L640 330V520Z" fill={u('side')} />
      <path d="M520 190L470 300L440 372L478 350L500 288L514 236Z" fill={u('lit')} opacity="0.75" />
      <path d="M520 190L470 300L440 372" fill="none" stroke={u('rim')} strokeWidth="2" strokeLinecap="round" />

      {/* Main peak: navy body, shadowed right face, orange-lit left face. */}
      <path d="M90 520L180 380L232 318L280 228L318 150L360 70L398 140L430 196L470 262L512 340L580 520Z" fill={u('main')} />
      <path d="M360 70L398 140L430 196L470 262L512 340L580 520H380L392 420L372 330L388 250L370 160Z" fill="#06132f" opacity="0.45" />
      <path d="M360 70L318 150L280 228L232 318L180 380L230 370L276 330L300 350L330 290L352 300L370 160Z" fill={u('lit')} />
      <path d="M360 70L370 160L352 300" fill="none" stroke="#ffc27a" strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round" />
      {/* Rim light along the ridge, blurred underneath for the glow. */}
      <path d="M360 70L318 150L280 228L232 318L180 380" fill="none" stroke={u('rim')} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" filter={u('blur')} opacity="0.8" />
      <path d="M360 70L318 150L280 228L232 318L180 380" fill="none" stroke={u('rim')} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="360" cy="70" r="10" fill="#ff9a3d" opacity="0.35" filter={u('blur')} />
      <circle cx="360" cy="71" r="2.5" fill="#fff1e6" />

      {/* Foreground hills. */}
      <path d="M0 520V440L80 410L150 438L240 404L330 446L420 418L520 448L640 420V520Z" fill="#06132f" />
    </svg>
  );
};
