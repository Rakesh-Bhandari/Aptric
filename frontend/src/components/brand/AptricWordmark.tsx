import { cn } from '@/lib/utils';

export interface AptricWordmarkProps {
  className?: string;
  /** `default` follows the theme (navy, or white in dark mode); `onDark` is always white; `onLight` always navy. */
  variant?: 'default' | 'onDark' | 'onLight';
}

/**
 * "APTRIC" in the brand face: heavy, wide-tracked caps. The first "A" has no
 * crossbar and holds a small orange triangle, so it is drawn as an SVG glyph
 * sized to the font's cap height. Scales with font-size (set it via className).
 */
export const AptricWordmark = ({ className, variant = 'default' }: AptricWordmarkProps) => (
  <span
    className={cn(
      'inline-flex items-baseline font-display font-extrabold uppercase leading-none tracking-[0.16em]',
      { default: 'text-heading', onDark: 'text-navy-foreground', onLight: 'text-brand-navy' }[variant],
      className,
    )}
  >
    <span className="sr-only">Aptric</span>
    <span aria-hidden className="inline-flex items-baseline">
      <svg viewBox="0 0 140 100" className="mr-[0.16em] h-[0.72em] w-auto overflow-visible" focusable="false">
        <path d="M0 100L51 3C52 1 54 0 56 0H84C86 0 88 1 89 3L140 100H111L70 22L29 100Z" fill="currentColor" />
        <path d="M52 100L70 64L88 100Z" className="fill-primary" />
      </svg>
      PTRIC
    </span>
  </span>
);
