import { cn } from '@/lib/utils';
import { AptricMark } from './AptricMark';
import { AptricWordmark } from './AptricWordmark';

export interface AptricLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Mark above the wordmark (landing hero, footer) instead of side by side (nav bars). */
  stacked?: boolean;
  /**
   * `default` follows the theme. `onDark` for navy surfaces in either theme (white
   * wordmark, lifted navy leg); `onLight` for surfaces that stay white in dark mode.
   */
  variant?: 'default' | 'onDark' | 'onLight';
  /** Hide the wordmark and show the mark alone. */
  markOnly?: boolean;
}

const INLINE = {
  sm: { mark: 'h-6', text: 'text-sm', gap: 'gap-2' },
  md: { mark: 'h-8', text: 'text-lg', gap: 'gap-2.5' },
  lg: { mark: 'h-11', text: 'text-2xl', gap: 'gap-3' },
} as const;

const STACKED = {
  sm: { mark: 'h-12', text: 'text-base', gap: 'gap-2' },
  md: { mark: 'h-20', text: 'text-2xl', gap: 'gap-3' },
  lg: { mark: 'h-32', text: 'text-4xl', gap: 'gap-5' },
} as const;

/** The Aptric mark and wordmark together. Reads as "Aptric" to screen readers. */
export const AptricLogo = ({ className, size = 'md', stacked = false, variant = 'default', markOnly = false }: AptricLogoProps) => {
  const s = (stacked ? STACKED : INLINE)[size];
  return (
    <span className={cn('inline-flex items-center', stacked && 'flex-col', s.gap, className)}>
      <AptricMark className={s.mark} variant={variant} title={markOnly ? 'Aptric' : undefined} />
      {!markOnly && <AptricWordmark className={s.text} variant={variant} />}
    </span>
  );
};
