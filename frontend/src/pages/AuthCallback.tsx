import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { XCircle } from 'lucide-react';
import { AptricMark } from '@/components/brand/AptricMark';
import { AuthCard, AuthPage } from '@/components/layout/AuthCard';
import { Button } from '@/components/ui/button';
import { safeNext, verifyLink, type LinkType } from '@/lib/auth';
import { authErrorMessage } from '@/lib/errors';

const LINK_TYPES = new Set<LinkType>(['signup', 'magiclink', 'recovery', 'oauth']);

/**
 * Landing page for every link the API sends back:
 *   ?token=…&type=signup|magiclink|recovery&next=…  email links (confirm sign-up, sign in, reset password)
 *   ?token=…&type=oauth&next=…                      after Google sign-in
 *   ?error_description=…                            cancelled consent, expired attempt, …
 * The single-use token is traded for a session with POST /auth/verify.
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Email tokens are single-use; StrictMode would otherwise verify twice.
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const next = safeNext(params.get('next'));

    const finish = async () => {
      const linkError = params.get('error_description');
      if (linkError) {
        setError(linkError);
        return;
      }
      const token = params.get('token');
      const type = params.get('type') as LinkType | null;
      if (!token || !type || !LINK_TYPES.has(type)) {
        setError('This link is invalid or has expired.');
        return;
      }
      try {
        await verifyLink(token, type);
      } catch (err) {
        setError(authErrorMessage(err));
        return;
      }
      navigate(type === 'recovery' ? '/auth/reset-password' : next, { replace: true });
    };
    finish().catch(() => setError("We couldn't reach the sign-in service. Check your connection and try again."));
  }, [navigate]);

  if (error) {
    return (
      <AuthCard
        title="That link didn't work"
        description="Links work once and expire after an hour."
        icon={<XCircle className="mt-0.5 size-6 shrink-0 text-chrome-accent" aria-hidden />}
      >
        <p role="alert" className="rounded-md border-l-4 border-danger bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger-soft-foreground">{error}</p>
        <p className="mt-4 text-sm text-muted-foreground">Sign in again or ask for a new link from the home page.</p>
        <Button asChild size="lg" className="mt-5 w-full"><Link to="/">Back to the home page</Link></Button>
      </AuthCard>
    );
  }

  return (
    <AuthPage>
      <div role="status" className="flex flex-col items-center gap-5 text-center">
        <AptricMark className="h-16 motion-safe:animate-breathe" />
        <h1 className="font-display text-xl font-extrabold tracking-tight text-heading">Signing you in…</h1>
        <div aria-hidden className="h-1 w-40 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-full bg-[linear-gradient(90deg,transparent,var(--primary),transparent)] motion-safe:animate-shimmer" />
        </div>
      </div>
    </AuthPage>
  );
};

export default AuthCallback;
