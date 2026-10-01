import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Auth from '../components/Auth/Auth';

const AuthModalContext = createContext(null);

// Lets any component (navbar, route guards, CTAs) open the sign-in modal.
export const AuthModalProvider = ({ children }) => {
    const location = useLocation();
    const [state, setState] = useState({ open: false, stay: false });

    // stay=true: opened by a protected route — keep the user on that page after sign-in.
    const openAuth = useCallback(({ stay = false } = {}) => setState({ open: true, stay }), []);
    const closeAuth = useCallback(() => setState((s) => ({ ...s, open: false })), []);

    const value = useMemo(() => ({ openAuth, closeAuth }), [openAuth, closeAuth]);
    const next = state.stay ? `${location.pathname}${location.search}` : '/practice';

    return (
        <AuthModalContext.Provider value={value}>
            {children}
            <Auth isOpen={state.open} onClose={closeAuth} next={next} redirectOnLogin={!state.stay} />
        </AuthModalContext.Provider>
    );
};

export const useAuthModal = () => {
    const ctx = useContext(AuthModalContext);
    if (!ctx) throw new Error('useAuthModal must be used inside <AuthModalProvider>');
    return ctx;
};
