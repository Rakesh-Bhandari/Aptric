// Postgres (Supabase) access. The backend connects directly with the
// connection string's role (postgres) and, for anything done on a user's
// behalf, drops to the `authenticated` role with that user's id as the JWT
// `sub` claim, inside one transaction. auth.uid(), RLS, column grants and the
// SECURITY DEFINER game rules in supabase/migrations then apply exactly as
// they did behind PostgREST.

import pg from 'pg';
import { config } from './config.js';

// bigint and numeric as JS numbers (as PostgREST returned them); dates as the
// plain 'YYYY-MM-DD' string, never a Date at local midnight.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

let pool;

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
      max: config.databasePoolMax,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on('error', (err) => console.error('[db] idle client error', err.message));
  }
  return pool;
}

/** One statement as the connection role (server-side work: auth, jobs). */
export const query = (text, params) => getPool().query(text, params);

/** Runs fn(client) in a transaction as the connection role. */
export async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Runs fn(client) in a transaction as `authenticated` with auth.uid() = userId,
 * the same session PostgREST would have set up for that user's JWT.
 */
export function asUser(userId, fn) {
  return transaction(async (client) => {
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
    await client.query(
      `select set_config('role', 'authenticated', true),
              set_config('request.jwt.claims', $1, true),
              set_config('request.jwt.claim.sub', $2, true),
              set_config('request.jwt.claim.role', 'authenticated', true)`,
      [claims, userId],
    );
    return fn(client);
  });
}
