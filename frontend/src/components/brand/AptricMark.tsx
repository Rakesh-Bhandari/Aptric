import { useId } from 'react';
import { cn } from '@/lib/utils';

export interface AptricMarkProps {
  className?: string;
  /** Accessible name. Without one the mark is decorative (aria-hidden). */
  title?: string;
  /**
   * `default` follows the theme (the navy leg lifts in dark mode); `onDark` always
   * lifts it, for navy and midnight surfaces; `onLight` never does, for fixed white surfaces.
   */
  variant?: 'default' | 'onDark' | 'onLight';
}

/*
 * The ribbon "A", traced from public/brand/aptric-mark.jpg in its 1120×860
 * pixel space:
 * - LEFT_LEG: the deep navy-blue left leg and the apex cap (its right side hides
 *   under the right leg), with a darker diagonal SHADOW from the inner apex down
 *   to the foot, where the crossbar tucks under it.
 * - RIGHT_LEG: a cyan → electric-blue ribbon that folds over the navy leg at the
 *   apex and runs down under the crossbar.
 * - CROSSBAR: a light-blue → blue → violet wave that sweeps up from under the
 *   navy foot, over the right leg and down into the rounded right foot.
 * The bands overlap in a loop (navy under right leg under crossbar under navy
 * foot), so the navy foot is painted twice: in full, then clipped to the foot on
 * top of the crossbar. Brand artwork, so the colours are literal values; only the
 * navy leg reads the --mark-* tokens, so it can lift in dark mode.
 */
const LEFT_LEG =
  'M300 790L127 790C81 790 52 740 75 700L411 121C429 90 463 70 500 70L617 70C654 70 688 90 706 121L827 330L600 330L536 329L310 727C288 766 246 790 201 790Z';
const SHADOW = 'M536 329L19 810L720 810L720 329Z';
const RIGHT_LEG = 'M536 329L590 245C615 207 650 197 688 197C728 197 762 222 784 257L1013 650L723 650Z';
const CROSSBAR =
  'M170 790L300 790C310 789 340 790 360 786C380 782 400 776 420 768C440 760 460 751 480 741C500 731 520 720 540 709C560 698 582 686 600 675C618 664 637 653 650 646C663 639 670 636 678 633C686 630 690 628 696 628C702 628 708 630 711 631L790 765C798 781 815 790 833 790L992 790C1037 790 1065 741 1043 701L949 546C942 538 920 510 905 497C890 484 876 477 860 471C844 465 826 462 810 459C794 456 778 456 762 456C746 456 730 458 714 461C698 464 683 469 668 474C653 479 630 490 622 493L360 646L240 720Z';

/** Navy leg stops: as drawn on white, and lifted for navy and midnight surfaces. */
const LIGHT = { a: '#00227f', b: '#00175f', shadow: '#061640' };
const LIFTED = { a: '#1e40af', b: '#1d3a9e', shadow: '#142a73' };

export const AptricMark = ({ className, title, variant = 'default' }: AptricMarkProps) => {
  const id = useId().replace(/:/g, '');
  const ref = (name: string) => `url(#${id}-${name})`;
  // `default` reads the --mark-* tokens (lifted in dark mode); the fixed variants use literals.
  const leg =
    variant === 'onDark'
      ? LIFTED
      : variant === 'onLight'
        ? LIGHT
        : { a: `var(--mark-leg-a, ${LIGHT.a})`, b: `var(--mark-leg-b, ${LIGHT.b})`, shadow: `var(--mark-shadow, ${LIGHT.shadow})` };
  const navy = (
    <>
      <path d={LEFT_LEG} fill={ref('leg')} />
      <path d={SHADOW} style={{ fill: leg.shadow }} clipPath={ref('leg-clip')} />
    </>
  );
  return (
    <svg
      viewBox="60 64 1000 734"
      className={cn('h-8 w-auto shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`${id}-leg`} gradientUnits="userSpaceOnUse" x1="0" y1="70" x2="0" y2="790">
          <stop offset="0" style={{ stopColor: leg.a }} />
          <stop offset="1" style={{ stopColor: leg.b }} />
        </linearGradient>
        {/* Soft sheen across the upper navy leg. */}
        <radialGradient id={`${id}-sheen`} gradientUnits="userSpaceOnUse" cx="450" cy="270" r="300">
          <stop offset="0" stopColor="#0a5ad6" stopOpacity="0.85" />
          <stop offset="1" stopColor="#0a5ad6" stopOpacity="0" />
        </radialGradient>
        {/* Across the right leg: electric blue on the inner edge to cyan on the outer edge. */}
        <linearGradient id={`${id}-right`} gradientUnits="userSpaceOnUse" x1="537" y1="330" x2="754" y2="205">
          <stop offset="0" stopColor="#0047ff" />
          <stop offset="0.22" stopColor="#0060fd" />
          <stop offset="0.5" stopColor="#009afe" />
          <stop offset="0.75" stopColor="#00cdfe" />
          <stop offset="1" stopColor="#00f0ff" />
        </linearGradient>
        {/* Along the crossbar: light blue, through blue, to violet at the right foot. */}
        <linearGradient id={`${id}-bar`} gradientUnits="userSpaceOnUse" x1="330" y1="0" x2="1000" y2="0">
          <stop offset="0" stopColor="#00b8ff" />
          <stop offset="0.2" stopColor="#08a6fd" />
          <stop offset="0.32" stopColor="#2b97fa" />
          <stop offset="0.42" stopColor="#3e8cf9" />
          <stop offset="0.52" stopColor="#5880fc" />
          <stop offset="0.62" stopColor="#6d67fb" />
          <stop offset="0.72" stopColor="#783dfb" />
          <stop offset="0.85" stopColor="#7d24fe" />
          <stop offset="1" stopColor="#9405fd" />
        </linearGradient>
        {/* Lavender light on the crest of the crossbar. */}
        <radialGradient id={`${id}-crest`} gradientUnits="userSpaceOnUse" cx="740" cy="470" r="160">
          <stop offset="0" stopColor="#9c9cff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#9c9cff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-leg-clip`}>
          <path d={LEFT_LEG} />
        </clipPath>
        <clipPath id={`${id}-foot`}>
          <rect x="0" y="560" width="470" height="300" />
        </clipPath>
      </defs>
      {navy}
      <path d={LEFT_LEG} fill={ref('sheen')} />
      <path d={RIGHT_LEG} fill={ref('right')} />
      <path d={CROSSBAR} fill={ref('bar')} />
      <path d={CROSSBAR} fill={ref('crest')} />
      <g clipPath={ref('foot')}>{navy}</g>
    </svg>
  );
};
