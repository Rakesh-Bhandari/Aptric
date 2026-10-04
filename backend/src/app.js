// Aptric API (Express). Runs as one Vercel serverless function (api/index.js)
// or a plain Node server (src/server.js). Supabase is only the Postgres
// database, reached with the project URL + secret key; see backend/README.md.

import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { tutorAvailable, tutorModels } from './tutor/llm.js';
import { query } from './db.js';
import { errorHandler, notFoundHandler } from './http.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import cronRoutes from './routes/cron.js';
import meRoutes from './routes/me.js';
import pushRoutes from './routes/push.js';
import rpcRoutes from './routes/rpc.js';
import tutorRoutes from './routes/tutor.js';

const DEV_ORIGINS = ['http://localhost:6969', 'http://localhost:5173', 'http://127.0.0.1:6969', 'http://127.0.0.1:5173'];

/**
 * Origin check for CORS: FRONTEND_URL, CORS_ORIGINS (entries may use `*` as a
 * wildcard, e.g. https://aptric-*.vercel.app for preview deployments) and, in
 * development, the local Vite ports.
 */
export function originMatcher(origins) {
  const exact = new Set();
  const patterns = [];
  for (const origin of origins.filter(Boolean)) {
    if (!origin.includes('*')) exact.add(origin);
    else patterns.push(new RegExp(`^${origin.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[a-z0-9-]*')}$`, 'i'));
  }
  return (origin) => !origin || exact.has(origin) || patterns.some((re) => re.test(origin));
}

function baseApp() {
  const app = express();
  // Behind Vercel's proxy: req.ip is the caller from X-Forwarded-For.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const isAllowed = originMatcher([config.frontendUrl, ...config.corsOrigins, ...(config.isProd ? [] : DEV_ORIGINS)]);
  app.use(cors({
    origin: (origin, done) => done(null, isAllowed(origin)),
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    maxAge: 600,
  }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  return app;
}

/**
 * Stand-in app when the environment is incomplete: every request gets a JSON
 * 503 naming what to fix, with CORS headers so the frontend can show it.
 */
export function createMisconfiguredApp(problems) {
  const app = baseApp();
  app.use((req, res) => {
    res.status(503).json({
      error: {
        code: 'server_misconfigured',
        message: 'The API is not configured yet. Set the missing environment variables in the Vercel project and redeploy.',
        problems,
      },
    });
  });
  return app;
}

export function createApp() {
  const app = baseApp();
  app.use(express.json({ limit: '256kb' }));

  app.get('/', (req, res) => res.json({ name: 'aptric-api', status: 'ok' }));
  // Database reachable and migrated (backend_sql comes from
  // 20261002000002_backend_gateway.sql, the auth tables from
  // 20261002000001_backend_auth.sql).
  app.get('/health', async (req, res) => {
    let rows;
    try {
      ({ rows } = await query(
        `select to_regclass('private.accounts') is not null as auth,
                to_regprocedure('public.gen_rate_limit(uuid,text,integer,integer)') is not null as rate_limit,
                to_regclass('public.levels') is not null as levels,
                to_regprocedure('private.tutor_context(uuid,uuid,public.attempt_context)') is not null as tutor`,
      ));
    } catch (err) {
      console.error('[health] database', err.code, err.message);
      if (err.code === 'PGRST202') {
        return res.status(503).json({
          status: 'error',
          database: 'ok',
          migrations: 'missing',
          message: 'public.backend_sql is missing; apply supabase/migrations (npx supabase db push).',
          missing: ['backend_sql'],
        });
      }
      return res.status(503).json({
        status: 'error',
        database: 'unreachable',
        message: config.isProd
          ? 'Cannot reach Supabase. Check SUPABASE_URL and SUPABASE_SECRET_KEY, and that the Data API is enabled.'
          : `${err.code ?? ''} ${err.message}`.trim(),
      });
    }
    const missing = Object.entries(rows[0]).filter(([, ok]) => !ok).map(([name]) => name);
    if (missing.length) {
      return res.status(503).json({
        status: 'error',
        database: 'ok',
        migrations: 'missing',
        message: 'The database is missing tables or functions; apply supabase/migrations (npx supabase db push).',
        missing,
      });
    }
    // Whether Aptric Tutor has a model to call (no secrets: just configured or not).
    const tutor = tutorAvailable(config.tutor) && tutorModels(config.tutor).length > 0 ? 'configured' : 'no_api_key';
    res.json({ status: 'ok', database: 'ok', migrations: 'ok', tutor });
  });

  app.use('/auth', authRoutes);
  app.use('/rpc', rpcRoutes);
  app.use('/tutor', tutorRoutes);
  app.use('/admin', adminRoutes);
  app.use('/push', pushRoutes);
  app.use('/cron', cronRoutes);
  app.use('/', meRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
