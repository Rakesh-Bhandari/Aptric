import type { CSSProperties } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { prefersReducedMotion } from '@/hooks/useReveal';
import { cn } from '@/lib/utils';

/** White-outline pill for navy surfaces ("Learn More" in the spec). */
export const outlineOnNavy = cn(
  buttonVariants({ variant: 'ghost', size: 'lg' }),
  'border-2 border-chrome-foreground/80 px-7 text-chrome-foreground hover:border-chrome-foreground hover:bg-chrome-foreground hover:text-brand-navy',
);

/** Stagger for scroll-reveal children (read by the data-reveal transition in index.css). */
export const delay = (i: number) => ({ '--reveal-delay': `${i * 80}ms` }) as CSSProperties;

/**
 * Scrolls a landing section into view (smoothly unless motion is reduced) and moves
 * focus to it, so keyboard and screen reader users land where the page moved.
 */
export const scrollToSection = (id: string, smooth = true) => {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto', block: 'start' });
  target.focus({ preventScroll: true });
};
