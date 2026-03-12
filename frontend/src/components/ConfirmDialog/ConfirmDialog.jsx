import React, { useEffect } from 'react';
import './ConfirmDialog.css';

const ConfirmDialog = ({ dialog, onConfirm, onCancel }) => {
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') onCancel();
            if (e.key === 'Enter') onConfirm();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onConfirm, onCancel]);

    if (!dialog) return null;

    const { message, confirmText = 'Confirm', cancelText = 'Cancel', variant = 'danger' } = dialog;

    return (
        <div className="cd-overlay" onClick={onCancel}>
            <div className="cd-box" onClick={(e) => e.stopPropagation()}>
                <div className={`cd-icon cd-icon-${variant}`}>
                    {variant === 'danger' ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                    ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                    )}
                </div>
                <p className="cd-message">{message}</p>
                <div className="cd-actions">
                    <button className={`cd-btn cd-btn-${variant}`} onClick={onConfirm} autoFocus>
                        {confirmText}
                    </button>
                    <button className="cd-btn cd-btn-cancel" onClick={onCancel}>
                        {cancelText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
