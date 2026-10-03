import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Page = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn('mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-8', className)}>{children}</div>
);

export const PageHeader = ({ title, description, actions, className }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string;
}) => (
  <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6', className)}>
    <div className="min-w-0 space-y-1">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">{title}</h1>
      {description && <p className="text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

const TONES = {
  navy: 'bg-navy-soft text-navy-soft-foreground',
  blue: 'bg-primary-soft text-primary-soft-foreground',
  violet: 'bg-violet-soft text-violet-soft-foreground',
} as const;

/**
 * Stat tile (Progress KPIs, profile stats): muted label, big heading-ink number
 * and a tinted icon chip. Use tone="violet" for streak/level-style (achievement)
 * stats. `orange` is a deprecated alias of `violet`.
 */
export const StatTile = ({ label, value, hint, icon, tone = 'navy', className }: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: keyof typeof TONES | 'orange'; className?: string;
}) => (
  <div className={cn('flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm sm:p-5', className)}>
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs font-semibold text-muted-foreground sm:text-sm">{label}</span>
      {icon && (
        <span
          className={cn('grid size-8 shrink-0 place-items-center rounded-full [&_svg]:size-4', TONES[tone === 'orange' ? 'violet' : tone])}
          aria-hidden
        >
          {icon}
        </span>
      )}
    </div>
    <span className="text-2xl font-extrabold leading-none tracking-tight text-heading tabular-nums sm:text-3xl">{value}</span>
    {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
  </div>
);
