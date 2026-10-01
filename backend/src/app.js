// Aptric API (Express). Runs as one Vercel serverless function (api/index.js)
// or a plain Node server (src/server.js). Supabase is only the Postgres
// database; see backend/README.md.

import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { query } from './db.js';
import { errorHandler, notFoundHandler } from './http.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import rpcRoutes from './routes/rpc.js';

const DEV_ORIGINS = ['http://localhost:6969', 'http://localhost:5173', 'http://127.0.0.1:6969'];

export function createApp() {
  const app = express();
  // Behind Vercel's proxy: req.ip is the caller from X-Forwarded-For.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const allowed = new Set([config.frontendUrl, ...config.corsOrigins, ...(config.isProd ? [] : DEV_ORIGINS)]);
  app.use(cors({
    origin: (origin, done) => done(null, !origin || allowed.has(origin)),
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '256kb' }));
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/', (req, res) => res.json({ name: 'aptric-api', status: 'ok' }));
  app.get('/health', async (req, res) => {
    await query('select 1');
    res.json({ status: 'ok', database: 'ok' });
  });

  app.use('/auth', authRoutes);
  app.use('/rpc', rpcRoutes);
  app.use('/admin', adminRoutes);
  app.use('/', meRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
