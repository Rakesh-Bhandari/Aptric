import React, { useEffect, useState } from 'react';
import './Toast.css';

const ICONS = {
    success: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    ),
    error: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    ),
    warning: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    ),
    info: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    ),
};

const DURATION = 4000;

const ToastItem = ({ toast, removeToast }) => {
    const [exiting, setExiting] = useState(false);

    const dismiss = () => {
        setExiting(true);
        setTimeout(() => removeToast(toast.id), 300);
    };

    useEffect(() => {
        const timer = setTimeout(dismiss, DURATION);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className={`toast-item toast-${toast.type} ${exiting ? 'toast-exit' : 'toast-enter'}`}>
            <div className="toast-icon">{ICONS[toast.type]}</div>
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close" onClick={dismiss} aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
            <div className="toast-progress">
                <div className={`toast-progress-bar toast-progress-${toast.type}`} style={{ animationDuration: `${DURATION}ms` }} />
            </div>
        </div>
    );
};

const Toast = ({ toasts, removeToast }) => {
    if (!toasts.length) return null;
    return (
        <div className="toast-container">
            {toasts.map(t => (
                <ToastItem key={t.id} toast={t} removeToast={removeToast} />
            ))}
        </div>
    );
};

export default Toast;
