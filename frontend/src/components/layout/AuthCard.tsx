import type { ReactNode } from 'react';
import { AptricMark } from '@/components/brand/AptricMark';
import { cn } from '@/lib/utils';

/** Off-white page area that centres its content (auth callback, reset password). */
export const AuthPage = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('flex min-h-[70dvh] items-start justify-center bg-background px-4 py-10 sm:items-center sm:py-16', className)}>
    <div className="w-full max-w-md">{children}</div>
  </div>
);

/**
 * The auth dialog's look as a page: the Aptric mark above a card whose navy-gradient
 * header holds the title. `icon` sits beside the title (e.g. an error glyph).
 */
export const AuthCard = ({ title, description, icon, children }: {
  title: ReactNode; description?: ReactNode; icon?: ReactNode; children?: ReactNode;
}) => (
  <AuthPage>
    <AptricMark className="mx-auto mb-6 h-12" />
    <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-lg dark:border-white/10">
      <div className="relative overflow-hidden bg-gradient-navy px-5 py-6 text-chrome-foreground sm:px-6">
        {/* Soft orange glow, as in the auth dialog. Decorative. */}
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-44 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative flex items-start gap-3">
          {icon}
          <div className="space-y-1">
            <h1 className="font-display text-xl font-extrabold leading-tight tracking-tight">{title}</h1>
            {description && <p className="text-sm text-chrome-muted-foreground">{description}</p>}
          </div>
        </div>
      </div>
      {children && <div className="p-5 sm:p-6">{children}</div>}
    </div>
  </AuthPage>
);
