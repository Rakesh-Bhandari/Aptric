import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import '../../components/Auth/Auth.css';
import { supabase, safeNext } from '../../lib/supabase';
import { useSession } from '../../context/SessionContext';
import { useToast } from '../../context/ToastContext';

const HANDLE_RE = /^[a-z0-9_]{3,24}$/;

// Starting suggestion from the Google name or the email's local part.
const suggestHandle = (user) => {
    const source = user?.user_metadata?.user_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';
    const cleaned = source.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 24);
    return cleaned.length >= 3 ? cleaned : '';
};

// Shown (via OnboardingGate) to signed-in users whose profile has no handle yet.
// Rendered inside RequireAuth, so user and profile are loaded.
const Onboarding = () => {
    const { user, profile, setProfile } = useSession();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const toast = useToast();
    const next = safeNext(params.get('next'));

    const [handle, setHandle] = useState(() => suggestHandle(user));
    const [displayName, setDisplayName] = useState(
        () => profile?.display_name || user?.user_metadata?.full_name || ''
    );
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    if (profile?.handle) return <Navigate to={next} replace />;

    const handleSubmit = async (e) => {
        e.preventDefault();
        const value = handle.trim().toLowerCase();
        if (!HANDLE_RE.test(value)) {
            setError('3–24 characters: lowercase letters, digits and underscores.');
            return;
        }
        setBusy(true);
        setError('');
        const { data, error: updateError } = await supabase
            .from('profiles')
            .update({ handle: value, display_name: displayName.trim() || null })
            .eq('id', user.id)
            .select('id, handle, display_name, avatar_url, role')
            .single();
        setBusy(false);

        if (updateError) {
            if (updateError.code === '23505') setError('That handle is taken. Try another.');
            else if (updateError.code === '23514') setError('That handle or name is not allowed.');
            else toast.error('Could not save your profile. Please try again.');
            return;
        }
        setProfile(data);
        toast.success(`Welcome aboard, @${data.handle}.`);
        navigate(next, { replace: true });
    };

    return (
        <div className="auth-page">
            <div className="auth-modal">
                <div className="auth-header">
                    <span className="auth-subtitle">ONBOARDING</span>
                    <h1 className="auth-title">CHOOSE YOUR HANDLE</h1>
                </div>
                <form className="auth-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="onboarding-handle">Handle</label>
                        <input
                            id="onboarding-handle"
                            type="text"
                            autoComplete="username"
                            value={handle}
                            onChange={e => { setHandle(e.target.value.toLowerCase()); setError(''); }}
                            className="form-input"
                            placeholder="operative_7"
                            maxLength={24}
                            aria-invalid={!!error}
                            aria-describedby="onboarding-handle-hint"
                            required
                        />
                        <span id="onboarding-handle-hint" className="form-hint" role={error ? 'alert' : undefined}>
                            {error || 'Shown on leaderboards. 3–24 lowercase letters, digits or _.'}
                        </span>
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="onboarding-name">Display Name (optional)</label>
                        <input
                            id="onboarding-name"
                            type="text"
                            autoComplete="name"
                            value={displayName}
                            onChange={e => setDisplayName(e.target.value)}
                            className="form-input"
                            maxLength={64}
                        />
                    </div>
                    <button type="submit" className="modal-submit-btn" disabled={busy}>
                        {busy ? 'TRANSMITTING...' : 'CONTINUE'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Onboarding;
