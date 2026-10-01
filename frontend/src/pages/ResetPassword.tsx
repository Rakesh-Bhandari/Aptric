import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldHint, Input, Label } from '@/components/ui/input';
import { useAuthDialog } from '@/context/AuthDialogContext';
import { useSession } from '@/context/SessionContext';
import { useToast } from '@/context/ToastContext';
import { updatePassword } from '@/lib/auth';
import { authErrorMessage } from '@/lib/errors';
import { passwordStrength } from '@/lib/password';
import { PageSkeleton } from '@/components/layout/PageSkeleton';

// Reached from the reset email via /auth/callback, which has already signed
// the user in with a fresh session (fresh sessions may set a new password).
const ResetPassword = () => {
  const { status } = useSession();
  const { openAuth } = useAuthDialog();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = { pw: useId(), confirm: useId() };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    if (passwordStrength(password).score < 2) { setError('Please choose a stronger password: at least 8 characters, mixing letters and numbers.'); return; }
    setBusy(true);
    setError('');
    try {
      await updatePassword(password);
    } catch (err) {
      setError(authErrorMessage(err));
      return;
    } finally {
      setBusy(false);
    }
    toast.success('Your password has been changed.');
    navigate('/', { replace: true });
  };

  if (status === 'loading') return <PageSkeleton />;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Choose a new password</CardTitle>
          {status === 'signed_out' && <CardDescription>This reset link has expired or was already used.</CardDescription>}
        </CardHeader>
        <CardContent>
          {status === 'signed_out' ? (
            <Button className="w-full" onClick={() => openAuth({ mode: 'forgot', next: '/' })}>Send me a new link</Button>
          ) : (
            <form className="space-y-4" onSubmit={submit}>
              <div className="space-y-1.5">
                <Label htmlFor={ids.pw}>New password</Label>
                <Input id={ids.pw} type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={ids.confirm}>Type it again</Label>
                <Input id={ids.confirm} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              {error && <FieldHint error>{error}</FieldHint>}
              <Button type="submit" size="lg" className="w-full" loading={busy}>Save new password</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
