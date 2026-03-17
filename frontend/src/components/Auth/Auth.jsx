import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Auth.css';
import API_BASE_URL from '../../utils/config';
import { useToast } from '../../context/ToastContext';

// --- Password Strength Logic ---
const getPasswordStrength = (pwd) => {
    if (!pwd) return null;
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 2) return { label: 'SIMPLE', level: 1 };
    if (score === 3) return { label: 'HARD', level: 2 };
    if (score === 4 || score === 5) return { label: 'STRONG', level: 3 };
    return { label: 'VERY STRONG', level: 4 };
};

// --- Random Password Generator ---
const generatePassword = () => {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const all = upper + lower + digits + symbols;
    const length = 16;

    let pwd = [
        upper[Math.floor(Math.random() * upper.length)],
        lower[Math.floor(Math.random() * lower.length)],
        digits[Math.floor(Math.random() * digits.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
    ];
    for (let i = pwd.length; i < length; i++) {
        pwd.push(all[Math.floor(Math.random() * all.length)]);
    }
    return pwd.sort(() => Math.random() - 0.5).join('');
};

const Auth = ({ isOpen, onClose, setIsAuthenticated }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [otp, setOtp] = useState('');
    const [copied, setCopied] = useState(false);

    const navigate = useNavigate();
    const toast = useToast();

    const passwordStrength = getPasswordStrength(password);

    // Show strength checker only on signup and reset forms
    const showStrengthChecker = !isLogin || isResetting;

    const handleGeneratePassword = useCallback(() => {
        const newPwd = generatePassword();
        setPassword(newPwd);
        setShowPassword(true);
        setCopied(false);
    }, []);

    const handleCopyPassword = useCallback(() => {
        if (password) {
            navigator.clipboard.writeText(password).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
        }
    }, [password]);

    const handleAuth = async (e) => {
        e.preventDefault();

        // Validation for registration
        if (!isLogin && password !== confirmPassword) {
            toast.error('Access keys do not match.');
            return;
        }

        // Block signup if password is weaker than "Hard"
        if (!isLogin && passwordStrength && passwordStrength.level < 2) {
            toast.error('Password too weak. Must be at least HARD strength.');
            return;
        }

        try {
            const path = isLogin ? '/auth/login' : '/auth/signup';
            const body = isLogin
                ? { email, password }
                : { name, email, password, confirmPassword };

            const response = await fetch(`${API_BASE_URL}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                credentials: 'include'
            });
            const data = await response.json();

            if (response.ok) {
                if (!isLogin) {
                    toast.success('Check your email to activate your account.');
                    setIsLogin(true);
                } else {
                    setIsAuthenticated(true);
                    onClose();
                    navigate('/practice');
                }
            } else {
                toast.error(data.error || 'Authentication failed');
            }
        } catch (err) {
            console.error("Auth error:", err);
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            toast.warning('Enter your email address first.');
            return;
        }
        const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (response.ok) {
            toast.info('OTP sent — check your inbox for reset instructions.');
            setIsResetting(true);
        } else {
            toast.error(data.error);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        // Block reset if password is weaker than "Hard"
        if (passwordStrength && passwordStrength.level < 2) {
            toast.error('Password too weak. Must be at least HARD strength.');
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp, newPassword: password })
            });
            const data = await response.json();

            if (response.ok) {
                toast.success('Access restored — login with your new password.');
                setIsResetting(false);
                setIsLogin(true);
            } else {
                toast.error(data.error);
            }
        } catch (err) {
            console.error("Reset error:", err);
        }
    };

    if (!isOpen) return null;

    // Reusable password strength UI
    const PasswordStrengthUI = () => (
        passwordStrength && (
            <div className="pw-strength-wrapper">
                <div className="pw-strength-bars">
                    {[1, 2, 3, 4].map((lvl) => (
                        <div
                            key={lvl}
                            className={`pw-strength-bar ${passwordStrength.level >= lvl ? `active level-${passwordStrength.level}` : ''}`}
                        />
                    ))}
                </div>
                <span className={`pw-strength-label level-${passwordStrength.level}`}>
                    {passwordStrength.label}
                </span>
            </div>
        )
    );

    // Reusable password generator toolbar
    const PasswordToolbar = () => (
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
                    {copied ? (
                        <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            COPIED!
                        </>
                    ) : (
                        <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                            COPY
                        </>
                    )}
                </button>
            )}
        </div>
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="auth-modal" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>&times;</button>

                <div className="auth-header">
                    <span className="auth-subtitle">ACCESS CONTROL</span>
                    <h1 className="auth-title">
                        {isResetting ? 'RESTORE ACCESS' : isLogin ? 'IDENTITY VERIFY' : 'NEW OPERATIVE'}
                    </h1>
                </div>

                {/* Only show Google/Divider if not in reset mode */}
                {!isResetting && (
                    <>
                        <a href={`${API_BASE_URL}/auth/google`} className="social-button">
                            <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg" alt="Google" style={{ width: '18px' }} />
                            <span>Authenticate via Google</span>
                        </a>
                        <div className="social-divider"><span>or standard login</span></div>
                    </>
                )}

                {isResetting ? (
                    /* --- PASSWORD RESET FORM --- */
                    <form className="auth-form" onSubmit={handleResetPassword}>
                        <div className="form-group">
                            <label className="form-label">Verification OTP</label>
                            <input
                                type="text"
                                value={otp}
                                onChange={e => setOtp(e.target.value)}
                                className="form-input"
                                placeholder="ENTER_6_DIGIT_CODE"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <div className="form-label-row">
                                <label className="form-label">New Access Key</label>
                                <PasswordToolbar />
                            </div>
                            <div className="password-input-wrapper">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="form-input password-field"
                                    placeholder="NEW_PASSWORD"
                                    required
                                />
                                <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)}>
                                    {showPassword ? "HIDE" : "SHOW"}
                                </button>
                            </div>
                            <PasswordStrengthUI />
                        </div>
                        <button type="submit" className="modal-submit-btn">
                            AUTHORIZE_RESET
                        </button>
                        <div className="auth-switch">
                            Changed your mind?
                            <span onClick={() => setIsResetting(false)}>Return to Login</span>
                        </div>
                    </form>
                ) : (
                    /* --- STANDARD LOGIN/SIGNUP FORM --- */
                    <form className="auth-form" onSubmit={handleAuth}>
                        {!isLogin && (
                            <div className="form-group">
                                <label className="form-label">Display Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="form-input"
                                    placeholder="e.g. Operative_7"
                                    required
                                />
                            </div>
                        )}
                        <div className="form-group">
                            <label className="form-label">Email Designation</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="form-input" placeholder="user@system.com" required />
                        </div>

                        <div className="form-group">
                            <div className="form-label-row">
                                <label className="form-label">Access Key</label>
                                {!isLogin && <PasswordToolbar />}
                            </div>
                            <div className="password-input-wrapper">
                                <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} className="form-input password-field" placeholder="••••••••" required />
                                <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)}>
                                    {showPassword ? "HIDE" : "SHOW"}
                                </button>
                            </div>
                            {!isLogin && <PasswordStrengthUI />}
                        </div>

                        {!isLogin && (
                            <div className="form-group">
                                <label className="form-label">Confirm Access Key</label>
                                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="form-input" placeholder="••••••••" required />
                            </div>
                        )}

                        {isLogin && (
                            <div className="forgot-pw-link" onClick={handleForgotPassword}>
                                Forgot Access Key?
                            </div>
                        )}

                        <button type="submit" className="modal-submit-btn">
                            {isLogin ? 'INITIALIZE SESSION' : 'REGISTER ID'}
                        </button>

                        <div className="auth-switch">
                            {isLogin ? "No clearance?" : "Already verified?"}
                            <span onClick={() => { setIsLogin(!isLogin); setConfirmPassword(''); setPassword(''); }}>
                                {isLogin ? 'Request Access' : 'Login'}
                            </span>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};
export default Auth;