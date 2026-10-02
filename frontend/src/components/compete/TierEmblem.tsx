import { useId } from 'react';
import { cn } from '@/lib/utils';

const METALS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
type Metal = (typeof METALS)[number];

const metalOf = (slug: string | null | undefined, tier?: number): Metal => {
  if (METALS.includes(slug as Metal)) return slug as Metal;
  // Unknown slug: fall back on the tier number (1 = bronze … 5 = diamond).
  return METALS[Math.min(METALS.length, Math.max(1, tier ?? 1)) - 1];
};

/**
 * League tier emblem: a shield for Bronze, Silver and Gold, a cut gem for
 * Platinum and Diamond, filled with the tier's metal gradient. Decorative unless
 * `label` is given.
 */
export const TierEmblem = ({ slug, tier, className, label }: { slug?: string | null; tier?: number; className?: string; label?: string }) => {
  const id = useId().replace(/:/g, '');
  const metal = metalOf(slug, tier);
  const gem = metal === 'platinum' || metal === 'diamond';
  const hi = `var(--metal-${metal}-hi)`;
  const lo = `var(--metal-${metal}-lo)`;
  return (
    <svg
      viewBox="0 0 64 72"
      className={cn('h-14 w-auto shrink-0 drop-shadow-[0_6px_14px_rgb(0_0_0/0.25)]', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: hi }} />
          <stop offset="1" style={{ stopColor: lo }} />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0.55" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      {gem ? (
        <g>
          {/* Brilliant-cut gem: table, crown facets and pavilion. */}
          <path d="M16 8h32l14 18-30 42L2 26Z" fill={`url(#${id}-fill)`} />
          <path d="M16 8h32l14 18H2Z" fill={`url(#${id}-shine)`} />
          <path d="M2 26h60M16 8l8 18 8-18 8 18 8-18M24 26l8 42 8-42" fill="none" stroke={lo} strokeOpacity="0.55" strokeWidth="1.6" strokeLinejoin="round" />
          {metal === 'diamond' && <path d="M50 4l1.6 3.4L55 9l-3.4 1.6L50 14l-1.6-3.4L45 9l3.4-1.6Z" fill="white" />}
        </g>
      ) : (
        <g>
          {/* Heater shield with an inner border and a star. */}
          <path d="M32 2 60 11v22c0 17-12 30-28 37C16 63 4 50 4 33V11Z" fill={`url(#${id}-fill)`} />
          <path d="M32 9 53 16v17c0 13-9 23-21 29-12-6-21-16-21-29V16Z" fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="2" />
          <path d="M32 2 60 11v14H4V11Z" fill={`url(#${id}-shine)`} />
          <path
            d="m32 22 4.4 9 9.9 1.4-7.2 7 1.7 9.8L32 44.6l-8.8 4.6 1.7-9.8-7.2-7 9.9-1.4Z"
            fill="white" fillOpacity={metal === 'gold' ? 0.95 : 0.85}
          />
        </g>
      )}
    </svg>
  );
};
