import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'warning' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string }
interface ConfirmOptions { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean }

export interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
  /** Resolves true if the player confirms. */
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
// A card with a coloured left accent; the icon carries the same colour.
const STYLES: Record<ToastKind, { accent: string; icon: string }> = {
  success: { accent: 'border-l-success', icon: 'text-success' },
  error: { accent: 'border-l-danger', icon: 'text-danger' },
  warning: { accent: 'border-l-warning', icon: 'text-warning' },
  info: { accent: 'border-l-primary', icon: 'text-accent-text' },
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4500);
  }, [dismiss]);

  const confirm = useCallback((options: ConfirmOptions | string) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setDialog(typeof options === 'string' ? { message: options } : options);
  }), []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setDialog(null);
  };

  const api = useMemo<ToastApi>(() => ({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    warning: (m) => push('warning', m),
    info: (m) => push('info', m),
    confirm,
  }), [push, confirm]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-3 sm:bottom-4 sm:top-auto sm:items-end sm:p-4"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-l-4 bg-card py-3 pl-3.5 pr-3 text-card-foreground shadow-lg motion-safe:animate-fade-in dark:border-y-white/10 dark:border-r-white/10',
                STYLES[t.kind].accent,
              )}
            >
              <Icon className={cn('mt-0.5 size-5 shrink-0', STYLES[t.kind].icon)} aria-hidden />
              <p className="flex-1 text-sm font-medium">{t.message}</p>
              <button
                type="button" onClick={() => dismiss(t.id)}
                className="-m-1 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
      <Dialog open={!!dialog} onOpenChange={(open) => { if (!open) close(false); }}>
        {dialog && (
          <DialogContent title={dialog.title ?? 'Are you sure?'} description={dialog.message}>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => close(false)}>{dialog.cancelText ?? 'Cancel'}</Button>
              <Button variant={dialog.danger ? 'danger' : 'default'} onClick={() => close(true)} autoFocus>
                {dialog.confirmText ?? 'Confirm'}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};
