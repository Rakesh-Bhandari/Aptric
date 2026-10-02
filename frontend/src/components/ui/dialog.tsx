import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AptricMark } from '@/components/brand/AptricMark';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

interface DialogContentProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  hideClose?: boolean;
  /** `brand`: a navy-gradient header strip with the Aptric mark (auth and other branded moments). */
  variant?: 'default' | 'brand';
}

const BrandDialogContent = ({ title, description, children, className, hideClose }: DialogContentProps) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-strong/60 backdrop-blur-[2px] motion-safe:animate-fade-in dark:bg-black/60" />
    <DialogPrimitive.Content
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-card text-card-foreground shadow-lg motion-safe:animate-fade-in',
        'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg',
        'dark:border dark:border-white/10',
        className,
      )}
    >
      <div className="relative overflow-hidden bg-gradient-navy px-5 pb-6 pt-6 text-chrome-foreground sm:px-6">
        {/* Soft orange glow, echoing the spec's hero. Decorative. */}
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-44 rounded-full bg-primary/25 blur-3xl" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="space-y-3">
            <AptricMark variant="onDark" className="h-9" />
            <div className="space-y-1">
              <DialogPrimitive.Title className="font-display text-xl font-extrabold leading-tight tracking-tight">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-sm text-chrome-muted-foreground">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
          </div>
          {!hideClose && (
            <DialogPrimitive.Close
              className="-m-3 rounded-full p-3 text-chrome-muted-foreground transition-colors hover:bg-white/10 hover:text-chrome-foreground"
              aria-label="Close"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          )}
        </div>
      </div>
      <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">{children}</div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
);

const PlainDialogContent = ({ title, description, children, className, hideClose }: DialogContentProps) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-strong/60 backdrop-blur-[2px] motion-safe:animate-fade-in" />
    <DialogPrimitive.Content
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl border bg-card p-5 pb-safe text-card-foreground shadow-lg motion-safe:animate-fade-in',
        'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6',
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <DialogPrimitive.Title className="text-lg font-bold leading-tight tracking-tight text-heading">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
        </div>
        {!hideClose && (
          <DialogPrimitive.Close className="-m-3 rounded-full p-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="size-5" />
          </DialogPrimitive.Close>
        )}
      </div>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
);

/** Centered on desktop, a bottom sheet on phones. Focus is trapped and Esc closes. */
export const DialogContent = ({ variant = 'default', ...props }: DialogContentProps) =>
  variant === 'brand' ? <BrandDialogContent {...props} /> : <PlainDialogContent {...props} />;
