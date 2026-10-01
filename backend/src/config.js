// Environment, read once. See .env.example for every variable.

const env = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
};

const intEnv = (name, fallback, min, max) =>
  Math.min(max, Math.max(min, Number.parseInt(env(name, ''), 10) || fallback));

const trimSlash = (url) => url?.replace(/\/+$/, '');

export const config = {
  isProd: env('NODE_ENV') === 'production',
  port: intEnv('PORT', 5000, 1, 65535),

  // Supabase Postgres connection string. On Vercel use the pooler
  // (Supavisor, transaction mode, port 6543).
  databaseUrl: env('DATABASE_URL'),
  databaseSsl: env('DATABASE_SSL', 'true') !== 'false',
  databasePoolMax: intEnv('DATABASE_POOL_MAX', 5, 1, 50),

  // Where the React app lives: email links and OAuth land here, and it is the
  // CORS allow-list (plus CORS_ORIGINS, comma-separated).
  frontendUrl: trimSlash(env('FRONTEND_URL', 'http://localhost:6969')),
  corsOrigins: env('CORS_ORIGINS', '').split(',').map((s) => trimSlash(s.trim())).filter(Boolean),
  // This API's own public URL (for the Google OAuth redirect URI).
  apiUrl: trimSlash(env('API_URL', 'http://localhost:5000')),

  jwtSecret: env('JWT_SECRET'),
  accessTokenSeconds: intEnv('ACCESS_TOKEN_SECONDS', 15 * 60, 60, 24 * 3600),
  refreshTokenDays: intEnv('REFRESH_TOKEN_DAYS', 30, 1, 365),
  emailLinkMinutes: intEnv('EMAIL_LINK_MINUTES', 60, 5, 24 * 60),

  google: {
    clientId: env('GOOGLE_CLIENT_ID'),
    clientSecret: env('GOOGLE_CLIENT_SECRET'),
  },

  smtp: {
    host: env('SMTP_HOST'),
    port: intEnv('SMTP_PORT', 587, 1, 65535),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('SMTP_FROM', 'Aptric <no-reply@aptric.app>'),
  },

  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
  cronSecret: env('CRON_SECRET'),

  generation: {
    llmBaseUrl: trimSlash(env('LLM_BASE_URL', 'https://openrouter.ai/api/v1')),
    llmApiKey: env('OPEN_ROUTER_API_KEY', env('OPENROUTER_API_KEY')),
    questionModel: env('QUESTION_MODEL', 'google/gemini-2.0-flash-001'),
    verifyModel: env('QUESTION_VERIFY_MODEL', 'openai/gpt-4o-mini'),
    // Any OpenAI-compatible /embeddings API that can return 384 dimensions
    // (the database column is vector(384)).
    embeddingBaseUrl: trimSlash(env('EMBEDDING_BASE_URL', env('LLM_BASE_URL', 'https://openrouter.ai/api/v1'))),
    embeddingApiKey: env('EMBEDDING_API_KEY', env('OPEN_ROUTER_API_KEY', env('OPENROUTER_API_KEY'))),
    embeddingModel: env('EMBEDDING_MODEL', 'openai/text-embedding-3-small'),
    siteUrl: env('SITE_URL', env('FRONTEND_URL')),
    batchSize: intEnv('GENERATE_BATCH_SIZE', 5, 1, 10),
    requestsPerMinute: intEnv('GENERATE_REQUESTS_PER_MINUTE', 20, 1, 1000),
    jobsPerHour: intEnv('GENERATE_JOBS_PER_HOUR', 10, 1, 1000),
    questionsPerDay: intEnv('GENERATE_QUESTIONS_PER_DAY', 300, 1, 100_000),
  },
};

export const googleEnabled = () => Boolean(config.google.clientId && config.google.clientSecret);

/** Throws on missing required settings; called when the app starts. */
export function assertConfig() {
  const missing = ['DATABASE_URL', 'JWT_SECRET'].filter((name) => !process.env[name]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')} (see backend/.env.example)`);
  if (config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
}
