import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import './ActivateAccount.css';
import API_BASE_URL from '../../utils/config';

const ActivateAccount = ({ setIsAuthenticated }) => {
    const { token } = useParams();
    const navigate = useNavigate();
    const hasCalledProvider = useRef(false);

    const [status, setStatus] = useState('verifying');
    const [message, setMessage] = useState('VERIFYING_IDENTITY_TOKEN...');

    useEffect(() => {
        if (hasCalledProvider.current) return;
        hasCalledProvider.current = true;

        let redirectTimer;

        const verify = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/auth/verify/${token}`, {
                    credentials: 'include'
                });
                const data = await res.json();

                if (!res.ok) {
                    setStatus('error');
                    setMessage(data.error || 'VERIFICATION_FAILED');
                    return;
                }

                // Account verified and logged in
                setIsAuthenticated(true);
                setStatus('complete');
                setMessage('IDENTITY_CONFIRMED. ACCESS_GRANTED.');
                redirectTimer = setTimeout(() => navigate('/practice'), 1500);
            } catch (err) {
                console.error("Verification Error:", err);
                setStatus('error');
                setMessage('COMMUNICATION_FAILURE: SERVER_UNREACHABLE.');
            }
        };

        verify();

        return () => clearTimeout(redirectTimer);
    }, [token, navigate, setIsAuthenticated]);

    return (
        <div className="modal-overlay">
            <div className="auth-modal activation-container">
                <div className="auth-header">
                    <span className="auth-subtitle">SYSTEM_CLEARANCE</span>
                    <h1 className="auth-title">ACCOUNT_ACTIVATION</h1>
                </div>

                <div className="terminal-status-box">
                    <p className={`status-text ${status}`}>
                        {status === 'verifying' && <span className="status-dot"></span>}
                        {message}
                    </p>

                    {status === 'complete' && (
                        <div className="success-icon">✓</div>
                    )}
                </div>

                <div className="support-section">
                    {status === 'error' ? (
                        <>
                            <p className="helper-text">
                                Troubleshooting: Link may be invalid, expired or already used.
                                Log in to request a new activation email.
                            </p>
                            <Link to="/" className="modal-submit-btn return-btn">
                                RETURN_TO_BASE
                            </Link>
                        </>
                    ) : (
                        <p className="helper-text">
                            {status === 'complete'
                                ? 'REDIRECTING_TO_TRAINING_MODULE...'
                                : 'DO_NOT_CLOSE_TERMINAL'}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ActivateAccount;
