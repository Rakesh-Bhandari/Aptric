import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const SessionContext = createContext(null);

const PROFILE_COLUMNS = 'id, handle, display_name, avatar_url, role';

// Single source of truth for "who is signed in". Wraps supabase.auth (which
// persists the session, refreshes tokens and syncs tabs) and loads the
// matching public.profiles row so guards can check handle/role.
export const SessionProvider = ({ children }) => {
    const navigate = useNavigate();
    // undefined until supabase.auth reports INITIAL_SESSION.
    const [session, setSession] = useState(undefined);
    const [profile, setProfile] = useState(null);
    const [profileError, setProfileError] = useState(null);

    useEffect(() => {
        // Keep this callback synchronous: awaiting other supabase calls inside
        // onAuthStateChange can deadlock the auth client.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
            setSession(next);
            if (event === 'PASSWORD_RECOVERY') navigate('/auth/reset-password', { replace: true });
        });
        return () => subscription.unsubscribe();
    }, [navigate]);

    const userId = session?.user?.id ?? null;

    const fetchProfile = useCallback(async (id) => {
        const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).single();
        if (error) throw error;
        return data;
    }, []);

    useEffect(() => {
        if (!userId) {
            setProfile(null);
            setProfileError(null);
            return;
        }
        let cancelled = false;
        setProfileError(null);
        fetchProfile(userId)
            .then((data) => { if (!cancelled) setProfile(data); })
            .catch((err) => { if (!cancelled) setProfileError(err); });
        return () => { cancelled = true; };
    }, [userId, fetchProfile]);

    const refreshProfile = useCallback(async () => {
        if (!userId) return null;
        setProfileError(null);
        try {
            const data = await fetchProfile(userId);
            setProfile(data);
            return data;
        } catch (err) {
            setProfileError(err);
            return null;
        }
    }, [userId, fetchProfile]);

    // Ends this device's session only; other devices stay signed in.
    const signOut = useCallback(() => supabase.auth.signOut({ scope: 'local' }), []);

    const value = useMemo(() => {
        const currentProfile = profile && profile.id === userId ? profile : null;
        let status = 'loading';
        if (session === null) status = 'signed_out';
        else if (session) status = currentProfile || profileError ? 'signed_in' : 'loading';
        return {
            status,
            session: session ?? null,
            user: session?.user ?? null,
            profile: currentProfile,
            profileError,
            isAuthenticated: !!session,
            needsOnboarding: !!currentProfile && !currentProfile.handle,
            isAdmin: currentProfile?.role === 'admin',
            setProfile,
            refreshProfile,
            signOut,
        };
    }, [session, userId, profile, profileError, refreshProfile, signOut]);

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = () => {
    const ctx = useContext(SessionContext);
    if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
    return ctx;
};
