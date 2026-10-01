// Sign-in, sign-up and account calls against the API's /auth routes.

import { api, API_URL, getSession, publicApi, setSession, type Session } from './http';

export type LinkType = 'signup' | 'magiclink' | 'recovery' | 'oauth';

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Only allow same-origin paths as post-auth destinations (no open redirects).
export const safeNext = (value: unknown, fallback = '/'): string => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return fallback;
  }
  return value;
};

export async function signInWithPassword(email: string, password: string) {
  const { session } = await publicApi<{ session: Session }>('POST', '/auth/login', { email, password });
  setSession(session);
}

/** Sends a confirmation link; the answer is the same for registered emails. */
export const signUp = (p: { email: string; password: string; displayName?: string; next: string }) =>
  publicApi('POST', '/auth/signup', {
    email: p.email, password: p.password, display_name: p.displayName, timezone: timezone(), next: safeNext(p.next),
  });

export const sendMagicLink = (email: string, next: string) =>
  publicApi('POST', '/auth/magic-link', { email, next: safeNext(next), timezone: timezone() });

export const resendConfirmation = (email: string, next: string) =>
  publicApi('POST', '/auth/resend', { email, next: safeNext(next) });

export const requestPasswordReset = (email: string) => publicApi('POST', '/auth/recover', { email });

/** Trades a single-use email/OAuth link token for a session. */
export async function verifyLink(token: string, type: LinkType) {
  const { session } = await publicApi<{ session: Session; type: LinkType }>('POST', '/auth/verify', { token, type });
  setSession(session);
}

/** Full-page redirect to Google; it comes back to /auth/callback. */
export const signInWithGoogle = (next: string) => {
  window.location.assign(`${API_URL}/auth/google?next=${encodeURIComponent(safeNext(next))}`);
};

export const updatePassword = (password: string) => api('POST', '/auth/password', { password });

/** Ends this device's session only; other devices stay signed in. */
export async function signOut() {
  const refreshToken = getSession()?.refresh_token;
  setSession(null);
  if (refreshToken) await publicApi('POST', '/auth/logout', { refresh_token: refreshToken }).catch(() => {});
}
