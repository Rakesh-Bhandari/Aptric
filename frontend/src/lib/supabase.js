import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (see frontend/.env.example).');
}

// Supabase Auth owns sessions, password hashing and tokens; the client just
// stores the session in localStorage, refreshes it, and syncs it across tabs.
export const supabase = createClient(url, key, {
    auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});

// Every email/OAuth link comes back to /auth/callback. `next` is where to go
// afterwards; it must be listed under Auth > URL Configuration > Redirect URLs.
export const authRedirectUrl = (next = '/practice') =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

// Only allow same-origin paths as post-auth destinations (no open redirects).
export const safeNext = (value, fallback = '/practice') => {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
        return fallback;
    }
    return value;
};
