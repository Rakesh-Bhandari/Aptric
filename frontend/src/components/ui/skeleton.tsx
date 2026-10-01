import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Placeholder block. Pulses unless the player prefers reduced motion. */
export const Skeleton = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div aria-hidden className={cn('rounded-md bg-muted motion-safe:animate-pulse', className)} {...props} />
);

/** Wrap a page's skeleton so screen readers hear one "Loading" instead of nothing. */
export const LoadingRegion = ({ label = 'Loading', className, children }: { label?: string; className?: string; children: React.ReactNode }) => (
  <div role="status" aria-live="polite" aria-busy="true" className={className}>
    <span className="sr-only">{label}…</span>
    {children}
  </div>
);
