// Postgres (Supabase) access over the Data API: supabase-js with the project
// URL and the secret key. Every statement goes through public.backend_sql
// (supabase/migrations/20261002000002_backend_gateway.sql), which runs a list
// of statements in one transaction and, for anything done on a user's behalf,
// sets that user's id as the JWT `sub` claim so auth.uid(), private.is_admin()
// and the SECURITY DEFINER game rules see them.
//
// Rows come back as JSON (to_jsonb): bigint and numeric as numbers, dates as
// 'YYYY-MM-DD', timestamps as ISO strings.

import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { DbError } from './http.js';

let client;

export function getSupabase() {
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'X-Client-Info': 'aptric-api' } },
    });
  }
  return client;
}

// Parameters ------------------------------------------------------------------
// Values are inlined as quoted literals of unknown type, which Postgres
// resolves exactly like the untyped text parameters node-postgres used to send
// (`id = $1` against a uuid column, `$1::uuid`, `make_interval(days => $1)`).
// The gateway runs with standard_conforming_strings on, so doubling single
// quotes is the complete escape.

const toText = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return arrayLiteral(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const arrayLiteral = (values) =>
  `{${values.map((v) => {
    if (v === null || v === undefined) return 'NULL';
    if (Array.isArray(v)) return arrayLiteral(v);
    return `"${toText(v).replace(/[\\"]/g, '\\$&')}"`;
  }).join(',')}}`;

export const literal = (value) =>
  value === null || value === undefined ? 'NULL' : `'${toText(value).replaceAll("'", "''")}'`;

/** Replaces $1, $2, ... with the values as literals (one pass, never re-scanned). */
export function inline(text, params = []) {
  return text.replace(/\$(\d+)/g, (match, n) => {
    const index = Number(n) - 1;
    if (index < 0 || index >= params.length) throw new Error(`No value for ${match} in: ${text}`);
    return literal(params[index]);
  });
}

/** Whether a statement returns rows (SELECT / WITH / VALUES, or ... RETURNING). */
export const returnsRows = (text) => /^\s*(select|with|values|table)\b/i.test(text) || /\breturning\b/i.test(text);

const statement = ([text, params]) => ({ sql: inline(text, params), rows: returnsRows(text) });

// Calls -----------------------------------------------------------------------

async function run(list, asUserId = null) {
  const { data, error } = await getSupabase().rpc('backend_sql', {
    statements: list.map(statement),
    as_user: asUserId,
  });
  if (error) throw new DbError(error);
  return data.map((rows) => ({ rows, rowCount: rows.length }));
}

/** One statement as the server (auth, rate limits, jobs). Returns { rows }. */
export const query = async (text, params) => (await run([[text, params]]))[0];

/** Several [text, params] statements in one transaction; one { rows } each. */
export const batch = (list) => run(list);

/** One statement with auth.uid() = userId. */
export const asUser = async (userId, text, params) => (await run([[text, params]], userId))[0];

/** Several statements with auth.uid() = userId, in one transaction. */
export const asUserBatch = (userId, list) => run(list, userId);
