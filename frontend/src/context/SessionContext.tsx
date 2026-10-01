import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProfile } from '@/lib/api';
import { signOut as endSession } from '@/lib/auth';
import { getSession, onAuthChange, type AuthUser, type Session } from '@/lib/http';
import { queryClient } from '@/lib/queries';
import type { Profile } from '@/lib/types';

interface SessionValue {
  status: 'loading' | 'signed_out' | 'signed_in';
  session: Session | null;
  user: AuthUser | null;
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

// Single source of truth for "who is signed in". Follows the API session in
// lib/http (persisted in localStorage, refreshed on demand, synced across
// tabs) and loads the matching public.profiles row so guards can check
// handle/onboarding/role.
export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(getSession);

  useEffect(() => onAuthChange((event, next) => {
    setSession(next);
    if (event === 'SIGNED_OUT') queryClient.clear();
  }), []);

  const userId = session?.user?.id ?? null;
  const profileQuery = useQuery({
    queryKey: profileKey(userId),
    queryFn: fetchProfile,
    enabled: !!userId,
    staleTime: 60_000,
  });

  const setProfile = useCallback((p: Profile) => queryClient.setQueryData(profileKey(p.id), p), []);
  const { refetch } = profileQuery;
  const refreshProfile = useCallback(() => refetch(), [refetch]);
  // Ends this device's session only; other devices stay signed in.
  const signOut = useCallback(() => endSession(), []);

  const value = useMemo<SessionValue>(() => {
    const profile = profileQuery.data && profileQuery.data.id === userId ? profileQuery.data : null;
    let status: SessionValue['status'] = 'signed_out';
    if (session) status = profile || profileQuery.isError ? 'signed_in' : 'loading';
    return {
      status,
      session,
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
