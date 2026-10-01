import { useEffect } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogIn, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthDialog } from '@/context/AuthDialogContext';
import { useSession } from '@/context/SessionContext';
import { PageSkeleton } from './PageSkeleton';

/** Layout route for signed-in-only pages. Also sends unfinished sign-ups to /onboarding. */
export const RequireAuth = ({ allowOnboarding = false }: { allowOnboarding?: boolean }) => {
  const { status, profileError, refreshProfile, needsOnboarding } = useSession();
  const { openAuth } = useAuthDialog();
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (status === 'signed_out') openAuth({ mode: 'signin', next: `${pathname}${search}` });
  }, [status, openAuth, pathname, search]);

  if (status === 'loading') return <PageSkeleton />;
  if (status === 'signed_out') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">Sign in to continue</h1>
        <p className="text-muted-foreground">You need an account to see this page. It's free.</p>
        <div className="flex gap-2">
          <Button onClick={() => openAuth({ mode: 'signin', next: `${pathname}${search}` })}><LogIn /> Sign in</Button>
          <Button variant="outline" asChild><Link to="/">Home</Link></Button>
        </div>
      </div>
    );
  }
  if (profileError) {
    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">We couldn't load your account</h1>
        <p className="text-muted-foreground">Check your connection and try again.</p>
        <Button onClick={() => void refreshProfile()}><RotateCcw /> Try again</Button>
      </div>
    );
  }
  if (needsOnboarding && !allowOnboarding) {
    return <Navigate to={`/onboarding?next=${encodeURIComponent(`${pathname}${search}`)}`} replace />;
  }
  return <Outlet />;
};
