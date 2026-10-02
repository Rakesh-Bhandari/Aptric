import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface AptricMarkProps {
  className?: string;
  /** Accessible name. Without one the mark is decorative (aria-hidden). */
  title?: string;
  /**
   * `default` follows the theme (the navy leg lifts in dark mode); `onDark` always
   * lifts it, for navy surfaces; `onLight` never does, for fixed white surfaces.
   */
  variant?: 'default' | 'onDark' | 'onLight';
}

/*
 * The ribbon "A": a navy left leg, an orange right leg, and an orange ribbon
 * that sweeps up from under the navy leg, over the right leg, and down to its
 * foot. Paths are traced from the source artwork (public/brand/aptric-mark.jpg)
 * in its 840×715 pixel space. Layer order: ribbon, navy leg (covers the
 * ribbon's tail), right leg (folds over the navy leg at the top).
 * Brand artwork, so the colours are literal values rather than theme tokens.
 */
const RIBBON =
  'M150 688L165 640L484 425C525 394 600 386 650 404C684 416 703 441 719 474L790 627C806 660 794 688 760 688H652C630 688 616 678 606 660L553 553C543 538 525 536 505 551L380 630C330 661 280 688 205 688Z';
const NAVY_LEG =
  'M330 104C342 84 358 78 380 78H490C512 78 527 90 536 108L592 240L416 290L244 615C228 648 212 688 168 688H104C66 688 44 660 56 628Z';
const RIGHT_LEG =
  'M416 292C430 240 462 188 522 186C555 186 578 205 590 228L716 478C700 445 680 422 650 410C600 392 525 400 484 425Z';

export const AptricMark = ({ className, title, variant = 'default' }: AptricMarkProps) => {
  const id = useId().replace(/:/g, '');
  const onDark = variant === 'onDark';
  // Light-mode navy stops; `default` reads them through CSS vars so dark mode can lift them.
  const navy = (n: 'a' | 'b' | 'c', hex: string) => (variant === 'onLight' ? hex : `var(--mark-navy-${n}, ${hex})`);
  return (
    <svg
      viewBox="40 70 780 630"
      className={cn('h-8 w-auto shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <defs>
        {/* The navy leg reads from --mark-navy-* so it lifts automatically in dark mode. */}
        <linearGradient id={`${id}-navy`} gradientUnits="userSpaceOnUse" x1="120" y1="420" x2="420" y2="420">
          <stop offset="0" style={{ stopColor: onDark ? '#2c55ad' : navy('a', '#0d2662') }} />
          <stop offset="0.55" style={{ stopColor: onDark ? '#22468f' : navy('b', '#0b1f4b') }} />
          <stop offset="1" style={{ stopColor: onDark ? '#1b3a78' : navy('c', '#081a42') }} />
        </linearGradient>
        <linearGradient id={`${id}-leg`} gradientUnits="userSpaceOnUse" x1="440" y1="330" x2="660" y2="230">
          <stop offset="0" stopColor="#e85400" />
          <stop offset="0.5" stopColor="#ff7400" />
          <stop offset="1" stopColor="#ff9a2a" />
        </linearGradient>
        <linearGradient id={`${id}-ribbon`} gradientUnits="userSpaceOnUse" x1="250" y1="560" x2="800" y2="640">
          <stop offset="0" stopColor="#ff8000" />
          <stop offset="0.42" stopColor="#ff9a3d" />
          <stop offset="0.72" stopColor="#ff7200" />
          <stop offset="1" stopColor="#ff5a00" />
        </linearGradient>
      </defs>
      <path d={RIBBON} fill={`url(#${id}-ribbon)`} />
      <path d={NAVY_LEG} fill={`url(#${id}-navy)`} />
      <path d={RIGHT_LEG} fill={`url(#${id}-leg)`} />
    </svg>
  );
};
