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
const STYLES: Record<ToastKind, string> = {
  success: 'border-success/40 bg-success-soft text-success-soft-foreground',
  error: 'border-danger/40 bg-danger-soft text-danger-soft-foreground',
  warning: 'border-warning/40 bg-warning-soft text-warning-soft-foreground',
  info: 'border bg-card text-card-foreground',
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
              className={cn('pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-3 shadow-lg motion-safe:animate-fade-in', STYLES[t.kind])}
            >
              <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
              <p className="flex-1 text-sm font-medium">{t.message}</p>
              <button type="button" onClick={() => dismiss(t.id)} className="-m-1 rounded p-1 opacity-70 hover:opacity-100" aria-label="Dismiss">
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
