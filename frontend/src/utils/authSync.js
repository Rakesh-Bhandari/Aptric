// Cross-tab auth sync: writing this key fires a 'storage' event in every other tab,
// which reloads to pick up the new session. Only write it on real login/logout
// transitions — never on a plain session check, or tabs would reload each other forever.
export const AUTH_SYNC_KEY = 'auth-event';

export const broadcastAuthChange = (authenticated) => {
    try {
        localStorage.setItem(AUTH_SYNC_KEY, JSON.stringify({ authenticated, at: Date.now() }));
    } catch {
        // Storage unavailable (private mode, quota) — other tabs just won't sync.
    }
};
