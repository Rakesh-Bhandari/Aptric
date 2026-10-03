import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Placeholder block: slate tint with a soft shimmer, still when the player prefers reduced motion. */
export const Skeleton = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    aria-hidden
    className={cn(
      'relative overflow-hidden rounded-md bg-border dark:bg-muted',
      'before:absolute before:inset-0 before:-translate-x-full before:bg-linear-to-r before:from-transparent before:via-white/60 before:to-transparent motion-safe:before:animate-shimmer dark:before:via-white/[0.07]',
      className,
    )}
    {...props}
  />
);

/** Wrap a page's skeleton so screen readers hear one "Loading" instead of nothing. */
export const LoadingRegion = ({ label = 'Loading', className, children }: { label?: string; className?: string; children: React.ReactNode }) => (
  <div role="status" aria-live="polite" aria-busy="true" className={className}>
    <span className="sr-only">{label}…</span>
    {children}
  </div>
);
