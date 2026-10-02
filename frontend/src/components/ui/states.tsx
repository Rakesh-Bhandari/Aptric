import type { ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { Button } from './button';

export const EmptyState = ({ icon, title, children, action, className }: {
  icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string;
}) => (
  <div className={cn('flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card/60 px-6 py-10 text-center', className)}>
    {icon && <div className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground [&_svg]:size-6">{icon}</div>}
    <div className="space-y-1">
      <h3 className="font-bold tracking-tight text-heading">{title}</h3>
      {children && <div className="max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
    {action}
  </div>
);

/** Inline error for a failed query, with a retry button. */
export const ErrorState = ({ error, onRetry, title = "We couldn't load this", className }: {
  error: unknown; onRetry?: () => void; title?: string; className?: string;
}) => (
  <div role="alert" className={cn('flex flex-col items-center gap-3 rounded-lg border border-danger/25 bg-danger-soft px-6 py-8 text-center text-danger-soft-foreground', className)}>
    <AlertTriangle className="size-6" aria-hidden />
    <div className="space-y-1">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm">{friendlyError(error)}</p>
    </div>
    {onRetry && (
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw /> Try again
      </Button>
    )}
  </div>
);
