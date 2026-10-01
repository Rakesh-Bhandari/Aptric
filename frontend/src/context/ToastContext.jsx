import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import Toast from '../components/Toast/Toast';
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog';
import API_BASE_URL from '../utils/config';

const ToastContext = createContext(null);

const formatWait = (seconds) => {
    if (!seconds || seconds < 60) return 'a moment';
    const minutes = Math.ceil(seconds / 60);
    return minutes === 1 ? 'a minute' : `${minutes} minutes`;
};

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const [dialog, setDialog] = useState(null);
    const resolverRef = useRef(null);

    const addToast = useCallback((message, type = 'info') => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    // Every page calls fetch() directly, so catch 429s from our API in one place
    // and show a single friendly toast (deduped so a burst doesn't stack them).
    useEffect(() => {
        const originalFetch = window.fetch;
        let lastShown = 0;
        window.fetch = async (...args) => {
            const res = await originalFetch(...args);
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            if (res.status === 429 && url?.startsWith(API_BASE_URL) && Date.now() - lastShown > 5000) {
                lastShown = Date.now();
                const body = await res.clone().json().catch(() => ({}));
                addToast(`Whoa, slow down! You're going a bit fast — please try again in ${formatWait(body.retryAfter)}.`, 'warning');
            }
            return res;
        };
        return () => { window.fetch = originalFetch; };
    }, [addToast]);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Returns a Promise<boolean>. Usage: if (!(await toast.confirm({...}))) return;
    const confirm = useCallback((options) => {
        return new Promise((resolve) => {
            resolverRef.current = resolve;
            setDialog(typeof options === 'string' ? { message: options } : options);
        });
    }, []);

    const handleConfirm = () => {
        resolverRef.current?.(true);
        setDialog(null);
    };

    const handleCancel = () => {
        resolverRef.current?.(false);
        setDialog(null);
    };

    const toast = {
        success: (msg) => addToast(msg, 'success'),
        error: (msg) => addToast(msg, 'error'),
        warning: (msg) => addToast(msg, 'warning'),
        info: (msg) => addToast(msg, 'info'),
        confirm,
    };

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <Toast toasts={toasts} removeToast={removeToast} />
            <ConfirmDialog dialog={dialog} onConfirm={handleConfirm} onCancel={handleCancel} />
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used inside ToastProvider');
    return ctx;
};
