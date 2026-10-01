import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, XCircle } from 'lucide-react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { authErrorMessage } from '@/lib/errors';
import { safeNext, supabase } from '@/lib/supabase';

const EMAIL_OTP_TYPES = new Set(['email', 'signup', 'magiclink', 'recovery', 'invite', 'email_change']);

// Where to go afterwards: `next`, or the `next` inside `redirect_to` (the email
// templates pass {{ .RedirectTo }} through as redirect_to).
const readNext = (params: URLSearchParams) => {
  if (params.has('next')) return safeNext(params.get('next'));
  try {
    return safeNext(new URL(params.get('redirect_to') ?? '').searchParams.get('next'));
  } catch {
    return '/';
  }
};

/**
 * Landing page for every link Supabase Auth sends back:
 *   ?token_hash=…&type=…  email links (confirm sign-up, magic link, reset, email change)
 *   ?code=…               OAuth (Google) and PKCE links; supabase-js exchanges it on load
 *   ?error_description=…  expired link, cancelled consent, …
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
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const next = readNext(params);

    const finish = async () => {
      const linkError = params.get('error_description') || hash.get('error_description');
      if (linkError) {
        setError(linkError);
        return;
      }
      const tokenHash = params.get('token_hash');
      const type = params.get('type');
      if (tokenHash && type && EMAIL_OTP_TYPES.has(type)) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
        if (verifyError) {
          setError(authErrorMessage(verifyError));
          return;
        }
        navigate(type === 'recovery' ? '/auth/reset-password' : next, { replace: true });
        return;
      }
      // getSession() waits for the client to finish exchanging ?code=.
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        setError(sessionError ? authErrorMessage(sessionError) : 'This link is invalid or has expired.');
        return;
      }
      navigate(next, { replace: true });
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
