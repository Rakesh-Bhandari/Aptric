// Bearer access tokens -> req.user. Authorization itself stays in Postgres
// (RLS and the SQL functions); requireAdmin only gives non-admins a clean 403
// before work that never reaches those checks (AI generation).

import { verifyAccessToken } from '../auth/tokens.js';
import { query } from '../db.js';
import { forbidden, unauthorized } from '../http.js';

export function requireUser(req, res, next) {
  const header = req.get('authorization') ?? '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw unauthorized('401', 'Sign in to continue.');
  const claims = verifyAccessToken(token);
  if (!claims) throw unauthorized('401', 'Your session has expired. Please sign in again.');
  req.user = { id: claims.sub, email: claims.email, sessionId: claims.sid };
  next();
}

export async function requireAdmin(req, res, next) {
  const { rows } = await query(
    'select role, banned_at from public.profiles where id = $1',
    [req.user.id],
  );
  if (rows[0]?.role !== 'admin' || rows[0].banned_at) throw forbidden('admin only');
  next();
}
