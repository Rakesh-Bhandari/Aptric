import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session, User } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { fetchProfile } from '@/lib/api';
import { queryClient } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

interface SessionValue {
  status: 'loading' | 'signed_out' | 'signed_in';
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileError: unknown;
  isAuthenticated: boolean;
  /** Signed in but hasn't picked a handle, or hasn't finished goal + placement. */
  needsOnboarding: boolean;
  isAdmin: boolean;
  setProfile: (p: Profile) => void;
  refreshProfile: () => Promise<unknown>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export const profileKey = (id: string | null) => ['profile', id] as const;

// Single source of truth for "who is signed in". Wraps supabase.auth (which
// persists the session, refreshes tokens and syncs tabs) and loads the
// matching public.profiles row so guards can check handle/onboarding/role.
export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  // undefined until supabase.auth reports INITIAL_SESSION.
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    // Keep this callback synchronous: awaiting other supabase calls inside
    // onAuthStateChange can deadlock the auth client.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') queryClient.clear();
      if (event === 'PASSWORD_RECOVERY') navigate('/auth/reset-password', { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const userId = session?.user?.id ?? null;
  const profileQuery = useQuery({
    queryKey: profileKey(userId),
    queryFn: () => fetchProfile(userId as string),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const setProfile = useCallback((p: Profile) => queryClient.setQueryData(profileKey(p.id), p), []);
  const { refetch } = profileQuery;
  const refreshProfile = useCallback(() => refetch(), [refetch]);
  // Ends this device's session only; other devices stay signed in.
  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  const value = useMemo<SessionValue>(() => {
    const profile = profileQuery.data && profileQuery.data.id === userId ? profileQuery.data : null;
    let status: SessionValue['status'] = 'loading';
    if (session === null) status = 'signed_out';
    else if (session) status = profile || profileQuery.isError ? 'signed_in' : 'loading';
    return {
      status,
      session: session ?? null,
      user: session?.user ?? null,
      profile,
      profileError: profileQuery.isError ? profileQuery.error : null,
      isAuthenticated: !!session,
      needsOnboarding: !!profile && (!profile.handle || !profile.onboarded_at),
      isAdmin: profile?.role === 'admin',
      setProfile,
      refreshProfile,
      signOut,
    };
  }, [session, userId, profileQuery.data, profileQuery.isError, profileQuery.error, setProfile, refreshProfile, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
};

/** For pages behind <RequireAuth>, where the profile is always loaded. */
export const useProfile = (): Profile => {
  const { profile } = useSession();
  if (!profile) throw new Error('useProfile used outside a signed-in route');
  return profile;
};
