import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import Toast from '../components/Toast/Toast';
import ConfirmDialog from '../components/ConfirmDialog/ConfirmDialog';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);
    const [dialog, setDialog] = useState(null);
    const resolverRef = useRef(null);

    const addToast = useCallback((message, type = 'info') => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

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
