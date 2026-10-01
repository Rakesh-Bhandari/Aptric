import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, XCircle } from 'lucide-react';
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

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-20 text-center">
      {error ? (
        <>
          <XCircle className="size-12 text-danger" aria-hidden />
          <h1 className="text-2xl font-bold">That link didn't work</h1>
          <p role="alert" className="text-muted-foreground">{error}</p>
          <p className="text-sm text-muted-foreground">Links work once and expire after an hour. Sign in again or ask for a new link.</p>
          <Button asChild><Link to="/">Back to the home page</Link></Button>
        </>
      ) : (
        <div role="status" className="flex flex-col items-center gap-4">
          <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
          <h1 className="text-xl font-semibold">Signing you in…</h1>
        </div>
      )}
    </div>
  );
};

export default AuthCallback;
