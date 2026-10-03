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
 * The auth dialog's look as a page: a card whose navy-gradient header holds the
 * Aptric mark and the title. `icon` sits beside the title (e.g. an error glyph).
 */
export const AuthCard = ({ title, description, icon, children }: {
  title: ReactNode; description?: ReactNode; icon?: ReactNode; children?: ReactNode;
}) => (
  <AuthPage>
    <div className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-lg">
      <div className="relative overflow-hidden bg-gradient-navy px-5 py-6 text-chrome-foreground [--ring:var(--ring-on-navy)] sm:px-6">
        {/* Soft violet and blue glows, as in the auth dialog. Decorative. */}
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-44 rounded-full bg-violet/30 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-20 left-1/4 size-40 rounded-full bg-primary/20 blur-3xl" />
        <AptricMark variant="onDark" className="relative mb-3 h-9" />
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
