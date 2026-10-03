import { cn } from '@/lib/utils';

export interface AptricWordmarkProps {
  className?: string;
  /** `default` follows the theme (wordmark navy, or white in dark mode); `onDark` is always white; `onLight` always navy. */
  variant?: 'default' | 'onDark' | 'onLight';
}

/**
 * "APTRIC" in the brand face: heavy, wide-tracked caps in the wordmark navy
 * (#0A1633). The first "A" has no crossbar and holds a small Light Blue
 * triangle, so it is drawn as an SVG glyph (traced from
 * public/brand/aptric-logo-wordmark.jpg) sized to the font's cap height.
 * Scales with font-size (set it via className).
 */
export const AptricWordmark = ({ className, variant = 'default' }: AptricWordmarkProps) => (
  <span
    className={cn(
      'inline-flex items-baseline font-display font-extrabold uppercase leading-none tracking-[0.14em]',
      { default: 'text-brand-navy dark:text-heading', onDark: 'text-navy-foreground', onLight: 'text-brand-navy' }[variant],
      className,
    )}
  >
    <span className="sr-only">Aptric</span>
    <span aria-hidden className="inline-flex items-baseline">
      <svg viewBox="0 0 141 100" className="mr-[0.14em] h-[0.72em] w-auto overflow-visible" focusable="false">
        <path d="M0 100L52.6 3.4C53.8 1.3 56 0 58.4 0H82.6C85 0 87.2 1.3 88.4 3.4L141 100H108L70.5 33L33 100Z" fill="currentColor" />
        {/* Light Blue reads on white and on navy, so it stays the same in every variant. */}
        <path d="M70.5 62L93 100H48Z" className="fill-sky" />
      </svg>
      PTRIC
    </span>
  </span>
);
