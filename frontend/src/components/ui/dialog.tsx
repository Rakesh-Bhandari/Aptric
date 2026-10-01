import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
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
}

/** Centered on desktop, a bottom sheet on phones. Focus is trapped and Esc closes. */
export const DialogContent = ({ title, description, children, className, hideClose }: DialogContentProps) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 motion-safe:animate-fade-in" />
    <DialogPrimitive.Content
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-2xl border bg-card p-5 pb-safe text-card-foreground shadow-xl motion-safe:animate-fade-in',
        'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:pb-5',
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <DialogPrimitive.Title className="text-lg font-semibold leading-tight">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
        </div>
        {!hideClose && (
          <DialogPrimitive.Close className="-m-2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="size-5" />
          </DialogPrimitive.Close>
        )}
      </div>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
);
