import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import './ActivateAccount.css';

const ActivateAccount = ({ setIsAuthenticated }) => {
    const { token } = useParams();
    const navigate = useNavigate();
    const hasCalledProvider = useRef(false);
    const pollIntervalRef = useRef(null);
    const timeoutRef = useRef(null);
    
    const [status, setStatus] = useState('verifying');
    const [message, setMessage] = useState('INITIALIZING_VERIFICATION_PROTOCOL...');
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(10);

    useEffect(() => {
        if (hasCalledProvider.current) return;
        hasCalledProvider.current = true;

        const verify = async () => {
            try {
                const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
                
                setMessage('VERIFYING_IDENTITY_TOKEN...');
                
                const res = await fetch(`${API_BASE}/api/auth/verify/${token}`, {
                    credentials: 'include'
                });

                const data = await res.json();

                if (!res.ok) {
                    setStatus('error');
                    setMessage(data.error || 'VERIFICATION_FAILED');
                    return;
                }

                // Account verified and logged in!
                setIsAuthenticated(true);
                setStatus('generating');
                setMessage('IDENTITY_CONFIRMED. GENERATING_QUESTIONS...');

                // Start polling for question generation status
                startPolling(API_BASE);

            } catch (err) {
                console.error("Verification Error:", err);
                setStatus('error');
                setMessage('COMMUNICATION_FAILURE: SERVER_UNREACHABLE.');
            }
        };

        const startPolling = (apiBase) => {
            // Poll every second for status updates
            pollIntervalRef.current = setInterval(async () => {
                try {
                    const statusRes = await fetch(`${apiBase}/api/activation-status`, {
                        credentials: 'include'
                    });

                    if (!statusRes.ok) {
                        console.warn('Status check failed, retrying...');
                        return; // Don't stop polling, just try again
                    }

                    const statusData = await statusRes.json();

                    setProgress(statusData.progress || 0);
                    setTotal(statusData.total || 10);
                    setMessage(statusData.message || 'GENERATING_QUESTIONS...');

                    if (statusData.status === 'complete') {
                        // Success! Questions are ready
                        clearInterval(pollIntervalRef.current);
                        clearTimeout(timeoutRef.current);
                        
                        setStatus('complete');
                        setMessage('ACCESS_GRANTED. QUESTIONS_READY.');
                        
                        // Redirect after brief celebration
                        setTimeout(() => navigate('/practice'), 1500);
                        
                    } else if (statusData.status === 'error') {
                        // Generation failed, but let them proceed
                        clearInterval(pollIntervalRef.current);
                        clearTimeout(timeoutRef.current);
                        
                        setStatus('warning');
                        setMessage('GENERATION_INCOMPLETE. PROCEEDING_ANYWAY...');
                        
                        // Still redirect, Practice page will trigger generation
                        setTimeout(() => navigate('/practice'), 3000);
                    }

                } catch (pollErr) {
                    console.error('Polling error:', pollErr);
                    // Don't stop polling on network hiccups
                }
            }, 1000);

            // Safety timeout: If taking too long (2 minutes), redirect anyway
            timeoutRef.current = setTimeout(() => {
                clearInterval(pollIntervalRef.current);
                
                if (status === 'generating') {
                    setStatus('warning');
                    setMessage('TAKING_LONGER_THAN_EXPECTED. REDIRECTING...');
                    setTimeout(() => navigate('/practice'), 2000);
                }
            }, 120000); // 2 minutes
        };

        verify();

        // Cleanup on unmount
        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [token, navigate, setIsAuthenticated, status]);

    const progressPercent = total > 0 ? Math.round((progress / total) * 100) : 0;

    return (
        <div className="modal-overlay">
            <div className="auth-modal activation-container">
                <div className="auth-header">
                    <span className="auth-subtitle">SYSTEM_CLEARANCE</span>
                    <h1 className="auth-title">ACCOUNT_ACTIVATION</h1>
                </div>

                <div className="terminal-status-box">
                    <p className={`status-text ${status}`}>
                        {(status === 'verifying' || status === 'generating') && 
                            <span className="status-dot"></span>
                        }
                        {message}
                    </p>

                    {status === 'generating' && (
                        <>
                            <div className="activation-loader">
                                <div 
                                    className="bar" 
                                    style={{ width: `${progressPercent}%` }}
                                ></div>
                            </div>
                            <p className="progress-text">
                                {progress}/{total} QUESTIONS - {progressPercent}% COMPLETE
                            </p>
                        </>
                    )}

                    {status === 'complete' && (
                        <div className="success-icon">✓</div>
                    )}
                </div>

                <div className="support-section">
                    {status === 'error' ? (
                        <>
                            <p className="helper-text">
                                Troubleshooting: Link may be invalid or already used.
                            </p>
                            <Link to="/" className="modal-submit-btn return-btn">
                                RETURN_TO_BASE
                            </Link>
                        </>
                    ) : (
                        <p className="helper-text">
                            {status === 'complete'
                                ? 'REDIRECTING_TO_TRAINING_MODULE...'
                                : status === 'warning'
                                ? 'QUESTIONS_WILL_LOAD_SHORTLY...'
                                : 'DO_NOT_CLOSE_TERMINAL - THIS_MAY_TAKE_UP_TO_1_MINUTE'}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ActivateAccount;