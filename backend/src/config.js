// Environment, read once. See .env.example for every variable.

const env = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
};

const intEnv = (name, fallback, min, max) =>
  Math.min(max, Math.max(min, Number.parseInt(env(name, ''), 10) || fallback));

const floatEnv = (name, fallback, min, max) => {
  const value = Number.parseFloat(env(name, ''));
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
};

/** Comma-separated list; unset means `fallback`, an empty value means none. */
const listEnv = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
};

const trimSlash = (url) => url?.replace(/\/+$/, '');

export const config = {
  isProd: env('NODE_ENV') === 'production',
  port: intEnv('PORT', 5000, 1, 65535),

  // Supabase project URL (https://<project-ref>.supabase.co) and secret key
  // (sb_secret_..., or the legacy service_role key). Server-side only.
  supabaseUrl: trimSlash(env('SUPABASE_URL')),
  supabaseSecretKey: env('SUPABASE_SECRET_KEY', env('SUPABASE_SERVICE_ROLE_KEY')),

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

  // Gmail SMTP: SMTP_USER is the Gmail / Google Workspace address and
  // SMTP_PASS a 16-character app password (needs 2-Step Verification). Gmail
  // sends as SMTP_USER unless SMTP_FROM is one of its verified aliases.
  smtp: {
    host: env('SMTP_HOST', env('SMTP_USER') ? 'smtp.gmail.com' : undefined),
    port: intEnv('SMTP_PORT', 465, 1, 65535),
    // Implicit TLS (port 465) by default; port 587 and friends use STARTTLS.
    // SMTP_SECURE=true|false overrides the port-based guess.
    secure: env('SMTP_SECURE') === undefined ? undefined : env('SMTP_SECURE').toLowerCase() === 'true',
    // Fail fast instead of hanging until the serverless function is killed.
    timeoutMs: intEnv('SMTP_TIMEOUT_MS', 10_000, 1000, 60_000),
    user: env('SMTP_USER'),
    // Google shows app passwords in groups of four; drop the spaces.
    pass: env('SMTP_PASS')?.replace(/\s+/g, ''),
    from: env('SMTP_FROM', env('SMTP_USER') ? `Aptric <${env('SMTP_USER')}>` : 'Aptric <no-reply@aptric.app>'),
  },

  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
  cronSecret: env('CRON_SECRET'),

  // Web Push (VAPID). Generate keys once with `npx web-push generate-vapid-keys`.
  // Without both keys push is off: the app hides the switch and the cron job no-ops.
  push: {
    publicKey: env('VAPID_PUBLIC_KEY'),
    privateKey: env('VAPID_PRIVATE_KEY'),
    // A mailto: or https: contact the push services can reach.
    subject: env('VAPID_SUBJECT', env('SMTP_USER') ? `mailto:${env('SMTP_USER')}` : 'mailto:no-reply@aptric.app'),
    // Subscription endpoints the API will POST to (host suffixes). Browsers' own
    // push services only, so a subscription can't point the server at anything else.
    endpointHosts: listEnv('PUSH_ENDPOINT_HOSTS', [
      'fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com',
    ]),
  },

  generation: {
    llmBaseUrl: trimSlash(env('LLM_BASE_URL', 'https://openrouter.ai/api/v1')),
    llmApiKey: env('OPEN_ROUTER_API_KEY', env('OPENROUTER_API_KEY')),
    questionModel: env('QUESTION_MODEL', 'google/gemini-2.5-flash'),
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

  // Aptric Tutor: any OpenAI-compatible chat API. Defaults to OpenRouter's
  // free models; Groq (https://api.groq.com/openai/v1) or a local Ollama
  // (http://localhost:11434/v1) work too. See backend/README.md.
  tutor: {
    baseUrl: trimSlash(env('TUTOR_LLM_BASE_URL', env('LLM_BASE_URL', 'https://openrouter.ai/api/v1'))),
    apiKey: env('TUTOR_LLM_API_KEY', env('OPEN_ROUTER_API_KEY', env('OPENROUTER_API_KEY'))),
    model: env('TUTOR_MODEL', 'meta-llama/llama-3.3-70b-instruct:free'),
    fallbackModels: listEnv('TUTOR_FALLBACK_MODELS', [
      'deepseek/deepseek-chat-v3-0324:free',
      'qwen/qwen-2.5-72b-instruct:free',
      'mistralai/mistral-small-3.1-24b-instruct:free',
    ]),
    // On OpenRouter only `:free` models are used unless this is "true".
    allowPaidModels: env('TUTOR_ALLOW_PAID_MODELS') === 'true',
    maxTokens: intEnv('TUTOR_MAX_TOKENS', 700, 64, 4000),
    temperature: floatEnv('TUTOR_TEMPERATURE', 0.3, 0, 2),
    messagesPerHour: intEnv('TUTOR_MESSAGES_PER_HOUR', 60, 1, 10_000),
    messagesPerDay: intEnv('TUTOR_MESSAGES_PER_DAY', 200, 1, 100_000),
    siteUrl: env('SITE_URL', env('FRONTEND_URL')),
  },
};

export const googleEnabled = () => Boolean(config.google.clientId && config.google.clientSecret);

/** The `role` claim of a legacy (JWT) API key, or null. */
function jwtRole(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
}

/** Problems with the Supabase URL and key (empty when they look right). */
export function supabaseProblems(url, key) {
  const problems = [];
  if (!url) problems.push('SUPABASE_URL is not set');
  else if (!/^https?:\/\/[^/\s]+$/.test(url) || /(^|\.)supabase\.com$/i.test(url.replace(/^https?:\/\//, ''))) {
    problems.push('SUPABASE_URL must be the project URL, e.g. https://<project-ref>.supabase.co');
  }
  if (!key) problems.push('SUPABASE_SECRET_KEY is not set');
  else if (key.startsWith('sb_publishable_')) {
    problems.push('SUPABASE_SECRET_KEY is a publishable key; use the secret key (sb_secret_...)');
  } else if (!key.startsWith('sb_secret_') && jwtRole(key) !== 'service_role') {
    problems.push('SUPABASE_SECRET_KEY must be a secret key (sb_secret_...) or the legacy service_role key');
  }
  return problems;
}

/** Problems with the environment (empty when the API can start). */
export function configProblems() {
  const problems = supabaseProblems(config.supabaseUrl, config.supabaseSecretKey);
  if (!config.jwtSecret) problems.push('JWT_SECRET is not set');
  else if (config.jwtSecret.length < 32) problems.push('JWT_SECRET must be at least 32 characters');
  return problems;
}

/** Throws on missing required settings; called when the local server starts. */
export function assertConfig() {
  const problems = configProblems();
  if (problems.length) throw new Error(`${problems.join('; ')} (see backend/.env.example)`);
}
