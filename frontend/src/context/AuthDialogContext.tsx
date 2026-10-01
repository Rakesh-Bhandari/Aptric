import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type AuthMode = 'signin' | 'signup' | 'magic' | 'forgot';

interface OpenOptions {
  mode?: AuthMode;
  /** Where to land after an email/OAuth link. Defaults to the current page. */
  next?: string;
}

interface AuthDialogValue {
  openAuth: (options?: OpenOptions) => void;
  closeAuth: () => void;
}

const AuthDialog = lazy(() => import('@/components/layout/AuthDialog'));
const AuthDialogContext = createContext<AuthDialogValue | null>(null);

export const AuthDialogProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<(OpenOptions & { open: boolean; key: number }) | null>(null);

  const openAuth = useCallback((options: OpenOptions = {}) => {
    setState((s) => ({
      open: true,
      key: (s?.key ?? 0) + 1,
      mode: options.mode ?? 'signin',
      next: options.next ?? `${window.location.pathname}${window.location.search}`,
    }));
  }, []);
  const closeAuth = useCallback(() => setState((s) => (s ? { ...s, open: false } : s)), []);
  const value = useMemo(() => ({ openAuth, closeAuth }), [openAuth, closeAuth]);

  return (
    <AuthDialogContext.Provider value={value}>
      {children}
      {state && (
        <Suspense fallback={null}>
          <AuthDialog key={state.key} open={state.open} onClose={closeAuth} initialMode={state.mode ?? 'signin'} next={state.next ?? '/'} />
        </Suspense>
      )}
    </AuthDialogContext.Provider>
  );
};

export const useAuthDialog = () => {
  const ctx = useContext(AuthDialogContext);
  if (!ctx) throw new Error('useAuthDialog must be used inside <AuthDialogProvider>');
  return ctx;
};
