import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Auth.css';
import { supabase, authRedirectUrl } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { authErrorMessage, generatePassword, getPasswordStrength } from '../../utils/password';
import PasswordStrength from './PasswordStrength';

// Modes: 'signin' (password), 'signup', 'magic' (email link), 'forgot', 'sent' (check your inbox).
const TITLES = {
    signin: 'IDENTITY VERIFY',
    signup: 'NEW OPERATIVE',
    magic: 'MAGIC LINK',
    forgot: 'RESTORE ACCESS',
    sent: 'CHECK INBOX',
};

// `next` is where to land after the user follows an email/OAuth link.
// `redirectOnLogin` controls in-place password sign-in: false keeps the user
// on the protected page that opened the modal.
const Auth = ({ isOpen, onClose, next = '/practice', redirectOnLogin = true }) => {
    const [mode, setMode] = useState('signin');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);
    const [sentMessage, setSentMessage] = useState('');
    // Set when a password sign-in fails because the email isn't confirmed yet.
    const [needsVerification, setNeedsVerification] = useState(false);

    const navigate = useNavigate();
    const toast = useToast();

    const switchMode = (nextMode) => {
        setMode(nextMode);
        setPassword('');
        setConfirmPassword('');
        setNeedsVerification(false);
    };

    const showSent = (message) => {
        setSentMessage(message);
        setMode('sent');
    };

    const handleGeneratePassword = useCallback(() => {
        setPassword(generatePassword());
        setShowPassword(true);
        setCopied(false);
    }, []);

    const handleCopyPassword = useCallback(() => {
        if (!password) return;
        navigator.clipboard.writeText(password).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [password]);

    // Wraps a submit handler with the busy flag so buttons can't double-send emails.
    const run = (fn) => async (e) => {
        e?.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
            await fn();
        } catch (err) {
            console.error('Auth error:', err);
            toast.error(authErrorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const handleSignIn = run(async () => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            setNeedsVerification(error.code === 'email_not_confirmed');
            toast.error(authErrorMessage(error));
            return;
        }
        onClose();
        if (redirectOnLogin) navigate(next);
    });

    const handleSignUp = run(async () => {
        if (password !== confirmPassword) {
            toast.error('Access keys do not match.');
            return;
        }
        if (getPasswordStrength(password)?.level < 2) {
            toast.error('Password too weak. Must be at least HARD strength.');
            return;
        }
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: authRedirectUrl(next),
                data: { display_name: name.trim() || undefined },
            },
        });
        if (error) throw error;
        // With "Confirm email" on, no session is returned until the link is clicked.
        // Supabase answers the same way for already-registered emails, so this
        // message is shown either way to avoid leaking which emails exist.
        showSent(`If ${email} can be registered, a confirmation link is on its way. Open it to activate your account.`);
    });

    const handleMagicLink = run(async () => {
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: authRedirectUrl(next), shouldCreateUser: true },
        });
        if (error) throw error;
        showSent(`A sign-in link has been sent to ${email}. It works once and expires in an hour.`);
    });

    const handleForgotPassword = run(async () => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: authRedirectUrl('/auth/reset-password'),
        });
        if (error) throw error;
        showSent(`If an account exists for ${email}, a password reset link is on its way.`);
    });

    const handleResendVerification = run(async () => {
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email,
            options: { emailRedirectTo: authRedirectUrl(next) },
        });
        if (error) throw error;
        setNeedsVerification(false);
        toast.success('Activation email sent — check your inbox.');
    });

    const handleGoogle = run(async () => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: authRedirectUrl(next) },
        });
        // On success the browser is already navigating to Google.
        if (error) throw error;
    });

    if (!isOpen) return null;

    const emailField = (
        <div className="form-group">
            <label className="form-label" htmlFor="auth-email">Email Designation</label>
            <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setNeedsVerification(false); }}
                className="form-input"
                placeholder="user@system.com"
                required
            />
        </div>
    );

    const passwordToolbar = (
        <div className="pw-generator-bar">
            <button type="button" className="pw-gen-btn" onClick={handleGeneratePassword} title="Generate a strong random password">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                GENERATE
            </button>
            {password && (
                <button type="button" className="pw-copy-btn" onClick={handleCopyPassword} title="Copy password">
                    {copied ? 'COPIED!' : 'COPY'}
                </button>
            )}
        </div>
    );

    const passwordField = (
        <div className="form-group">
            <div className="form-label-row">
                <label className="form-label" htmlFor="auth-password">Access Key</label>
                {mode === 'signup' && passwordToolbar}
            </div>
            <div className="password-input-wrapper">
                <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="form-input password-field"
                    placeholder="••••••••"
                    minLength={mode === 'signup' ? 8 : undefined}
                    required
                />
                <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? 'HIDE' : 'SHOW'}
                </button>
            </div>
            {mode === 'signup' && <PasswordStrength password={password} />}
        </div>
    );

    const submit = (label) => (
        <button type="submit" className="modal-submit-btn" disabled={busy}>
            {busy ? 'TRANSMITTING...' : label}
        </button>
    );

    const backToSignIn = (
        <div className="auth-switch">
            Changed your mind?
            <span onClick={() => switchMode('signin')}>Return to Login</span>
        </div>
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="auth-modal" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>

                <div className="auth-header">
                    <span className="auth-subtitle">ACCESS CONTROL</span>
                    <h1 className="auth-title">{TITLES[mode]}</h1>
                </div>

                {(mode === 'signin' || mode === 'signup') && (
                    <>
                        <button type="button" className="social-button" onClick={handleGoogle} disabled={busy}>
                            <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg" alt="" style={{ width: '18px' }} />
                            <span>Authenticate via Google</span>
                        </button>
                        <div className="social-divider"><span>or standard login</span></div>
                    </>
                )}

                {mode === 'signin' && (
                    <form className="auth-form" onSubmit={handleSignIn}>
                        {emailField}
                        {passwordField}
                        <div className="forgot-pw-link" onClick={() => switchMode('forgot')}>Forgot Access Key?</div>
                        {needsVerification && (
                            <div className="forgot-pw-link" onClick={handleResendVerification}>Resend activation email</div>
                        )}
                        {submit('INITIALIZE SESSION')}
                        <div className="auth-switch">
                            Prefer no password?
                            <span onClick={() => switchMode('magic')}>Email me a link</span>
                        </div>
                        <div className="auth-switch">
                            No clearance?
                            <span onClick={() => switchMode('signup')}>Request Access</span>
                        </div>
                    </form>
                )}

                {mode === 'signup' && (
                    <form className="auth-form" onSubmit={handleSignUp}>
                        <div className="form-group">
                            <label className="form-label" htmlFor="auth-name">Display Name</label>
                            <input
                                id="auth-name"
                                type="text"
                                autoComplete="name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="form-input"
                                placeholder="e.g. Operative_7"
                                maxLength={64}
                            />
                        </div>
                        {emailField}
                        {passwordField}
                        <div className="form-group">
                            <label className="form-label" htmlFor="auth-confirm">Confirm Access Key</label>
                            <input
                                id="auth-confirm"
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                className="form-input"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        {submit('REGISTER ID')}
                        <div className="auth-switch">
                            Already verified?
                            <span onClick={() => switchMode('signin')}>Login</span>
                        </div>
                    </form>
                )}

                {mode === 'magic' && (
                    <form className="auth-form" onSubmit={handleMagicLink}>
                        {emailField}
                        {submit('SEND LINK')}
                        {backToSignIn}
                    </form>
                )}

                {mode === 'forgot' && (
                    <form className="auth-form" onSubmit={handleForgotPassword}>
                        {emailField}
                        {submit('SEND RESET LINK')}
                        {backToSignIn}
                    </form>
                )}

                {mode === 'sent' && (
                    <div className="auth-form">
                        <p className="auth-sent-message">{sentMessage}</p>
                        <p className="auth-sent-message">Didn&apos;t get it? Check spam, or wait a minute and try again.</p>
                        {backToSignIn}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Auth;
