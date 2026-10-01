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
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {description && <p className="text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export const StatTile = ({ label, value, hint, icon, className }: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; className?: string;
}) => (
  <div className={cn('rounded-lg border bg-card p-3 sm:p-4', className)}>
    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-4">
      {icon}
      <span>{label}</span>
    </div>
    <div className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{value}</div>
    {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
  </div>
);
