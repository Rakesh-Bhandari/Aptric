// Client for the Aptric API (backend/). Owns the signed-in session: it is kept
// in localStorage, shared across tabs, and its short-lived access token is
// refreshed on demand (one refresh at a time across tabs).

const rawUrl = import.meta.env.VITE_API_URL as string | undefined;

if (!rawUrl) {
  throw new Error('Missing VITE_API_URL (see frontend/.env.example).');
}

export const API_URL = rawUrl.replace(/\/+$/, '');

export interface AuthUser {
  id: string;
  email: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  /** Unix seconds when access_token expires. */
  expires_at: number;
  user: AuthUser;
}

export type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED';

/** Error from the API: `code` is a SQLSTATE (42501, 23505, ...) or an auth code. */
export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Session storage ------------------------------------------------------------

const STORAGE_KEY = 'aptric.session';
// Refresh this many seconds before the access token expires.
const EXPIRY_MARGIN = 60;

const readStored = (): Session | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Session) : null;
    return parsed?.refresh_token && parsed.user?.id ? parsed : null;
  } catch {
    return null;
  }
};

const writeStored = (session: Session | null) => {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode: the session lives for this tab only */
  }
};

let current: Session | null = readStored();
const listeners = new Set<(event: AuthEvent, session: Session | null) => void>();

const emit = (event: AuthEvent) => listeners.forEach((fn) => fn(event, current));

export const getSession = () => current;

export function setSession(session: Session | null, event: AuthEvent = session ? 'SIGNED_IN' : 'SIGNED_OUT') {
  current = session;
  writeStored(session);
  emit(event);
}

/** Subscribes to sign-in / sign-out / refresh, in this tab and others. */
export function onAuthChange(fn: (event: AuthEvent, session: Session | null) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const before = current;
    current = readStored();
    if (!current) emit('SIGNED_OUT');
    else emit(before?.user.id === current.user.id ? 'TOKEN_REFRESHED' : 'SIGNED_IN');
  });
}

// Requests -------------------------------------------------------------------

type Method = 'GET' | 'POST' | 'PATCH';

async function send(method: Method, path: string, body: unknown, token: string | null): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Failed to fetch');
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    if (!res.ok) throw new ApiError(res.status, String(res.status), text.slice(0, 200) || res.statusText);
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } & Record<string, unknown> } | null)?.error ?? {};
    const { code, message, ...details } = err;
    throw new ApiError(res.status, code ?? String(res.status), message ?? res.statusText, details);
  }
  return json as T;
}

let refreshing: Promise<Session | null> | null = null;

async function refreshNow(stale: Session): Promise<Session | null> {
  // Another tab may have refreshed already.
  const stored = readStored();
  if (stored && stored.refresh_token !== stale.refresh_token) {
    current = stored;
    return stored;
  }
  try {
    const { session } = await parse<{ session: Session }>(
      await send('POST', '/auth/refresh', { refresh_token: stale.refresh_token }, null),
    );
    setSession(session, 'TOKEN_REFRESHED');
    return session;
  } catch (err) {
    // A rejected refresh token ends the session; a network error doesn't.
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      setSession(null);
      return null;
    }
    throw err;
  }
}

/** Refreshes once per tab at a time, and across tabs when Web Locks exist. */
function refreshSession(stale: Session): Promise<Session | null> {
  refreshing ??= (navigator.locks
    ? navigator.locks.request('aptric-auth-refresh', () => refreshNow(stale))
    : refreshNow(stale)
  ).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** A valid access token, refreshing it first if it is about to expire. */
export async function getAccessToken(): Promise<string | null> {
  const session = current;
  if (!session) return null;
  if (session.expires_at - EXPIRY_MARGIN > Date.now() / 1000) return session.access_token;
  return (await refreshSession(session))?.access_token ?? null;
}

/** Calls the API as the signed-in user (if any). */
export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const token = await getAccessToken();
  let res = await send(method, path, body, token);
  // The token may have been revoked or expired early: refresh and retry once.
  if (res.status === 401 && token && current) {
    const next = await refreshSession(current);
    if (next) res = await send(method, path, body, next.access_token);
  }
  return parse<T>(res);
}

/** Calls the API without a session (sign-in, sign-up, email links). */
export const publicApi = async <T>(method: Method, path: string, body?: unknown): Promise<T> =>
  parse<T>(await send(method, path, body, null));

/** Query string from defined, non-empty values. */
export const qs = (params: Record<string, string | number | boolean | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
};
