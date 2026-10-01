import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../../components/Auth/Auth.css';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../context/SessionContext';
import { useAuthModal } from '../../context/AuthModalContext';
import { useToast } from '../../context/ToastContext';
import { authErrorMessage, getPasswordStrength } from '../../utils/password';
import PasswordStrength from '../../components/Auth/PasswordStrength';

// Reached from the reset-password email via /auth/callback, which has already
// signed the user in with a short-lived recovery session.
const ResetPassword = () => {
    const { status } = useSession();
    const { openAuth } = useAuthModal();
    const navigate = useNavigate();
    const toast = useToast();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [busy, setBusy] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast.error('Access keys do not match.');
            return;
        }
        if (getPasswordStrength(password)?.level < 2) {
            toast.error('Password too weak. Must be at least HARD strength.');
            return;
        }
        setBusy(true);
        const { error } = await supabase.auth.updateUser({ password });
        setBusy(false);
        if (error) {
            toast.error(authErrorMessage(error));
            return;
        }
        toast.success('Access key updated.');
        navigate('/practice', { replace: true });
    };

    if (status === 'loading') return null;

    return (
        <div className="auth-page">
            <div className="auth-modal">
                <div className="auth-header">
                    <span className="auth-subtitle">ACCESS CONTROL</span>
                    <h1 className="auth-title">NEW ACCESS KEY</h1>
                </div>

                {status === 'signed_out' ? (
                    <div className="auth-form">
                        <p className="auth-sent-message">
                            Your reset link has expired or was already used. Request a new one from the sign-in screen.
                        </p>
                        <button type="button" className="modal-submit-btn" onClick={() => openAuth()}>SIGN IN</button>
                        <div className="auth-switch"><Link to="/">Return home</Link></div>
                    </div>
                ) : (
                    <form className="auth-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label className="form-label" htmlFor="reset-password">New Access Key</label>
                            <div className="password-input-wrapper">
                                <input
                                    id="reset-password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="form-input password-field"
                                    placeholder="NEW_PASSWORD"
                                    minLength={8}
                                    required
                                />
                                <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)}>
                                    {showPassword ? 'HIDE' : 'SHOW'}
                                </button>
                            </div>
                            <PasswordStrength password={password} />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="reset-confirm">Confirm Access Key</label>
                            <input
                                id="reset-confirm"
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                className="form-input"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        <button type="submit" className="modal-submit-btn" disabled={busy}>
                            {busy ? 'TRANSMITTING...' : 'AUTHORIZE_RESET'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ResetPassword;
