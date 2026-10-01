import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../../components/Auth/Auth.css';
import './AuthCallback.css';
import { supabase, safeNext } from '../../lib/supabase';
import { authErrorMessage } from '../../utils/password';

const EMAIL_OTP_TYPES = new Set(['email', 'signup', 'magiclink', 'recovery', 'invite', 'email_change']);

// Where to go afterwards: `next` directly, or the `next` inside `redirect_to`
// (the email templates pass {{ .RedirectTo }} through as redirect_to).
const readNext = (params) => {
    if (params.has('next')) return safeNext(params.get('next'));
    try {
        const redirectTo = new URL(params.get('redirect_to'));
        return safeNext(redirectTo.searchParams.get('next'));
    } catch {
        return safeNext(null);
    }
};

// Landing page for every link Supabase Auth sends back to the app:
//   ?token_hash=…&type=…  email links (confirm signup, magic link, reset, email change)
//   ?code=…               OAuth (Google) and default-template PKCE links; supabase-js
//                         exchanges it automatically on load (detectSessionInUrl)
//   ?error_description=…  provider/link errors (expired link, cancelled consent, …)
const AuthCallback = () => {
    const navigate = useNavigate();
    const started = useRef(false);
    const [error, setError] = useState(null);

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
            if (tokenHash && EMAIL_OTP_TYPES.has(type)) {
                const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
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

        finish().catch((err) => {
            console.error('Auth callback failed:', err);
            setError('Could not reach the authentication server.');
        });
    }, [navigate]);

    return (
        <div className="auth-page">
            <div className="auth-modal activation-container">
                <div className="auth-header">
                    <span className="auth-subtitle">SYSTEM_CLEARANCE</span>
                    <h1 className="auth-title">{error ? 'LINK_REJECTED' : 'VERIFYING'}</h1>
                </div>

                <div className="terminal-status-box">
                    <p className={`status-text ${error ? 'error' : 'verifying'}`}>
                        {!error && <span className="status-dot"></span>}
                        {error || 'VERIFYING_IDENTITY_TOKEN...'}
                    </p>
                </div>

                <div className="support-section">
                    {error ? (
                        <>
                            <p className="helper-text">
                                Links work once and expire after an hour. Sign in again or request a new link.
                            </p>
                            <Link to="/" className="modal-submit-btn return-btn">RETURN_TO_BASE</Link>
                        </>
                    ) : (
                        <p className="helper-text">DO_NOT_CLOSE_TERMINAL</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuthCallback;
