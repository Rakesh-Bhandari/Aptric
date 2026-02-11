import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Auth.css';

const Auth = ({ isOpen, onClose, setIsAuthenticated }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [otp, setOtp] = useState('');

    const navigate = useNavigate();
    const API_BASE_URL = 'http://localhost:5000';

    const handleAuth = async (e) => {
        e.preventDefault();

        // Validation for registration
        if (!isLogin && password !== confirmPassword) {
            alert("SECURITY ALERT: Access keys do not match.");
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
                // If it's a signup, the user might need to check email (based on your instructions)
                if (!isLogin) {
                    alert("TRANSMISSION SENT: Check your email to activate account.");
                    setIsLogin(true);
                } else {
                    setIsAuthenticated(true);
                    onClose();
                    navigate('/practice');
                }
            } else {
                alert(data.error || "Authentication failed");
            }
        } catch (err) {
            console.error("Auth error:", err);
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            alert("REQUIRED: Enter Email Designation first.");
            return;
        }
        const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (response.ok) {
            alert("OTP SENT: Check your inbox for reset instructions.");
            // Switch to Reset Mode so the user can see the OTP/New Password fields
            setIsResetting(true);
        } else {
            alert(data.error);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp, newPassword: password })
            });
            const data = await response.json();

            if (response.ok) {
                alert("ACCESS RESTORED: You can now login with your new key.");
                setIsResetting(false);
                setIsLogin(true);
            } else {
                alert(data.error);
            }
        } catch (err) {
            console.error("Reset error:", err);
        }
    };

    if (!isOpen) return null;

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
                            <label className="form-label">New Access Key</label>
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
                            <label className="form-label">Access Key</label>
                            <div className="password-input-wrapper">
                                <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} className="form-input password-field" placeholder="••••••••" required />
                                <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)}>
                                    {showPassword ? "HIDE" : "SHOW"}
                                </button>
                            </div>
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
                            <span onClick={() => { setIsLogin(!isLogin); setConfirmPassword(''); }}>
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