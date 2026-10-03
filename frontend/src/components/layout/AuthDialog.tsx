import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Eye, EyeOff, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Input, Label } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import type { AuthMode } from '@/context/AuthDialogContext';
import { useToast } from '@/context/ToastContext';
import {
  requestPasswordReset, resendConfirmation, sendMagicLink, signInWithGoogle, signInWithPassword, signUp as createAccount,
} from '@/lib/auth';
import { authErrorMessage, errorCode } from '@/lib/errors';
import { passwordStrength } from '@/lib/password';

type Mode = AuthMode | 'sent';

const TITLES: Record<Mode, { title: string; description: string }> = {
  signin: { title: 'Welcome back', description: 'Sign in to keep your streak going.' },
  signup: { title: 'Create your account', description: 'Free forever. Takes under a minute.' },
  magic: { title: 'Sign in with an email link', description: "We'll email you a link. No password needed." },
  forgot: { title: 'Reset your password', description: "Enter your email and we'll send you a reset link." },
  sent: { title: 'Check your inbox', description: 'The link works once and expires in an hour.' },
};

interface Props {
  open: boolean;
  onClose: () => void;
  initialMode: AuthMode;
  /** Where to land after following an email/OAuth link. */
  next: string;
}

const AuthDialog = ({ open, onClose, initialMode, next }: Props) => {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const ids = { name: useId(), email: useId(), password: useId(), error: useId() };
  const strength = passwordStrength(password);

  const switchMode = (m: Mode) => {
    setMode(m);
    setPassword('');
    setError('');
    setNeedsVerification(false);
  };

  // Wraps a submit handler with the busy flag so buttons can't double-send emails.
  const run = (fn: () => Promise<void>) => async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const signIn = run(async () => {
    try {
      await signInWithPassword(email, password);
    } catch (err) {
      setNeedsVerification(errorCode(err) === 'email_not_confirmed');
      throw err;
    }
    onClose();
    if (next.startsWith('/auth/')) navigate('/');
  });

  const signUp = run(async () => {
    if (strength.score < 2) {
      setError('Please choose a stronger password: at least 8 characters, mixing letters and numbers.');
      return;
    }
    await createAccount({ email, password, displayName: name.trim() || undefined, next });
    // The API answers the same way for registered emails, so the message
    // doesn't reveal which emails have accounts.
    setSentMessage(`If ${email} can be registered, we've sent a confirmation link. Open it to finish creating your account.`);
    setMode('sent');
  });

  const magicLink = run(async () => {
    await sendMagicLink(email, next);
    setSentMessage(`We've sent a sign-in link to ${email}.`);
    setMode('sent');
  });

  const forgot = run(async () => {
    await requestPasswordReset(email);
    setSentMessage(`If there's an account for ${email}, a password reset link is on its way.`);
    setMode('sent');
  });

  const resend = run(async () => {
    await resendConfirmation(email, next);
    setNeedsVerification(false);
    toast.success('Confirmation email sent. Check your inbox.');
  });

  // A full-page redirect to Google via the API; it returns to /auth/callback.
  const google = run(async () => {
    signInWithGoogle(next);
  });

  const emailField = (
    <div className="space-y-1.5">
      <Label htmlFor={ids.email}>Email</Label>
      <Input
        id={ids.email} type="email" autoComplete="email" inputMode="email" required value={email}
        onChange={(e) => { setEmail(e.target.value); setNeedsVerification(false); }}
        placeholder="you@example.com" aria-describedby={error ? ids.error : undefined}
      />
    </div>
  );

  const passwordField = (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={ids.password}>Password</Label>
        {mode === 'signin' && (
          <button type="button" className="-my-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline" onClick={() => switchMode('forgot')}>
            Forgot password?
          </button>
        )}
      </div>
      <div className="relative">
        <Input
          id={ids.password} type={showPassword ? 'text' : 'password'} required value={password}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : undefined}
          onChange={(e) => setPassword(e.target.value)} className="pr-11"
          aria-describedby={mode === 'signup' ? `${ids.password}-strength` : undefined}
        />
        <button
          type="button" onClick={() => setShowPassword((s) => !s)}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground"
          aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
        >
          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {mode === 'signup' && password && (
        <div id={`${ids.password}-strength`} className="space-y-1.5 pt-0.5">
          <Progress value={strength.score} max={4} label="Password strength" valueText={strength.label} className="h-1.5" />
          <p className="text-xs text-muted-foreground">
            Password strength: <span className="font-semibold text-heading">{strength.label}</span>
          </p>
        </div>
      )}
    </div>
  );

  const errorNote = error && (
    <p id={ids.error} role="alert" className="flex items-start gap-2 rounded-md border-l-4 border-danger bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger-soft-foreground">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <span>{error}</span>
    </p>
  );

  const googleButton = (
    <>
      <Button
        variant="outline" size="lg"
        className="w-full border-[1.5px] border-input bg-card text-heading hover:border-primary hover:bg-primary-wash hover:text-heading dark:border-input dark:text-heading dark:hover:border-accent-text dark:hover:bg-primary-wash dark:hover:text-heading"
        onClick={() => void google()} disabled={busy}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-5!">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.6 10.6 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
        </svg>
        Continue with Google
      </Button>
      <div className="relative py-1 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span className="relative z-10 bg-card px-3">or use your email</span>
        <span className="absolute inset-x-0 top-1/2 h-px bg-border" aria-hidden />
      </div>
    </>
  );

  const { title, description } = TITLES[mode];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent variant="brand" title={title} description={description}>
        {mode === 'signin' && (
          <form className="space-y-4" onSubmit={signIn} noValidate={false}>
            {googleButton}
            {emailField}
            {passwordField}
            {errorNote}
            {needsVerification && (
              <Button variant="link" onClick={() => void resend()} disabled={busy}>Resend the confirmation email</Button>
            )}
            <Button type="submit" className="w-full" size="lg" loading={busy}>Sign in <ArrowRight aria-hidden /></Button>
            <div className="flex flex-col items-center gap-1 text-sm">
              <button type="button" className="inline-flex min-h-11 items-center font-semibold text-accent-text hover:underline" onClick={() => switchMode('magic')}>
                Email me a sign-in link instead
              </button>
              <p className="text-muted-foreground">
                New here?{' '}
                <button type="button" className="inline-flex min-h-11 items-center font-semibold text-accent-text hover:underline" onClick={() => switchMode('signup')}>Create an account</button>
              </p>
            </div>
          </form>
        )}

        {mode === 'signup' && (
          <form className="space-y-4" onSubmit={signUp}>
            {googleButton}
            <div className="space-y-1.5">
              <Label htmlFor={ids.name}>Your name <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id={ids.name} autoComplete="name" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {emailField}
            {passwordField}
            {errorNote}
            <Button type="submit" className="w-full" size="lg" loading={busy}>Create account <ArrowRight aria-hidden /></Button>
            <p className="text-center text-xs text-muted-foreground">
              By creating an account you agree to our <a className="font-medium text-accent-text underline" href="/terms" target="_blank" rel="noreferrer">terms</a>.
            </p>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <button type="button" className="inline-flex min-h-11 items-center font-semibold text-accent-text hover:underline" onClick={() => switchMode('signin')}>Sign in</button>
            </p>
          </form>
        )}

        {(mode === 'magic' || mode === 'forgot') && (
          <form className="space-y-4" onSubmit={mode === 'magic' ? magicLink : forgot}>
            {emailField}
            {errorNote}
            <Button type="submit" className="w-full" size="lg" loading={busy}>
              {mode === 'magic' ? 'Send me a link' : 'Send reset link'}
            </Button>
            <p className="text-center text-sm">
              <button type="button" className="inline-flex min-h-11 items-center font-semibold text-accent-text hover:underline" onClick={() => switchMode('signin')}>Back to sign in</button>
            </p>
          </form>
        )}

        {mode === 'sent' && (
          <div className="space-y-4 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground ring-8 ring-primary-soft/50">
              <Mail className="size-8" aria-hidden />
            </div>
            <p className="text-heading">{sentMessage}</p>
            <FieldHint>Nothing yet? Check your spam folder, or wait a minute and try again.</FieldHint>
            <Button variant="outline" className="w-full" onClick={() => switchMode('signin')}>Back to sign in</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AuthDialog;
