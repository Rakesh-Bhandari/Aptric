// Errors and responses. Every error body is { error: { code, message, ... } }.
// Database errors keep their SQLSTATE as `code` (42501, 23505, P0002, ...), so
// the frontend maps them exactly as it did for supabase-js.

import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, code, message, extra = {}, headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
    this.headers = headers;
  }
}

/**
 * A failed backend_sql call (supabase-js PostgrestError). `code` is the
 * SQLSTATE for database errors, PGRST... for Data API errors, or empty when
 * Supabase couldn't be reached or rejected the key.
 */
export class DbError extends Error {
  constructor({ message, code, details, hint } = {}) {
    super(message || 'Database request failed.');
    this.name = 'DbError';
    this.code = code ?? '';
    this.details = details ?? null;
    this.hint = hint ?? null;
  }

  /** A SQLSTATE (5 characters), not a Data API / network failure. */
  get isSqlState() {
    return /^[0-9A-Z]{5}$/.test(this.code);
  }
}

export const badRequest = (message, extra) => new HttpError(400, 'bad_request', message, extra);
export const unauthorized = (code = 'unauthorized', message = 'Sign in to continue.') => new HttpError(401, code, message);
export const forbidden = (message = 'Not allowed.') => new HttpError(403, '42501', message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'P0002', message);

// SQLSTATEs raised on purpose by the SQL functions, constraints and RLS.
const PG_STATUS = {
  '42501': 403, // insufficient_privilege (RLS, grants, "not signed in", "admin only")
  P0002: 404,   // no_data_found
  '23505': 409, // unique_violation (already answered)
  '55000': 409, // object_not_in_prerequisite_state (not open right now)
  '22023': 400, // invalid_parameter_value
  '22P02': 400, // invalid_text_representation (malformed uuid, enum, ...)
  '22001': 400, // string too long
  '22003': 400, // numeric out of range
  '23502': 400, // not_null_violation
  '23503': 400, // foreign_key_violation
  '23514': 400, // check_violation
  P0001: 400,   // raise exception without a code
};


// Express error middleware (4 arguments).
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    res.set(err.headers);
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.extra } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_request', message: 'Body must be JSON.' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'too_large', message: 'Request body is too large.' } });
  }
  if (err instanceof DbError && err.isSqlState && PG_STATUS[err.code]) {
    return res.status(PG_STATUS[err.code]).json({ error: { code: err.code, message: err.message } });
  }
  if (err instanceof DbError && !err.isSqlState) {
    console.error('[db]', req.method, req.path, err.code, err.message);
    return res.status(503).json({
      error: {
        code: 'database_unavailable',
        message: config.isProd ? 'The database is not reachable right now.' : `${err.code} ${err.message}`.trim(),
      },
    });
  }
  console.error('[error]', req.method, req.path, err);
  return res.status(500).json({
    error: { code: 'internal', message: config.isProd ? 'Server error.' : String(err?.message ?? err) },
  });
}

export const notFoundHandler = (req, res) =>
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
