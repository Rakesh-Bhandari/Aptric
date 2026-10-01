// src/middleware/rateLimit.js
// Per-route rate limits. Keyed by user id when the request is authenticated
// (req.user is set by isLoggedIn/isAdmin), otherwise by client IP.
//
// Storage:
//   - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set → @upstash/ratelimit,
//     shared across every serverless instance (use this in production on Vercel).
//   - Otherwise → express-rate-limit's in-memory store, which only counts per
//     instance. Fine for local dev; on Vercel each cold instance starts at zero.
import { rateLimit as expressRateLimit, ipKeyGenerator } from 'express-rate-limit';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const ipKey = (req) => `ip:${ipKeyGenerator(req.ip || 'unknown')}`;
const userOrIpKey = (req) => (req.user?.user_id ? `user:${req.user.user_id}` : ipKey(req));

const sendLimited = (res, retryAfterSec) => {
    res.set('Retry-After', String(retryAfterSec));
    res.status(429).json({
        error: 'Too many requests. Please slow down and try again shortly.',
        retryAfter: retryAfterSec,
    });
};

const createLimiter = ({ name, limit, windowMs, key = userOrIpKey }) => {
    if (redis) {
        const limiter = new Ratelimit({
            redis,
            limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
            prefix: `rl:${name}`,
        });
        return async (req, res, next) => {
            try {
                const { success, reset } = await limiter.limit(key(req));
                if (success) return next();
                return sendLimited(res, Math.max(1, Math.ceil((reset - Date.now()) / 1000)));
            } catch (err) {
                // Fail open: a Redis outage shouldn't take the API down with it.
                console.error(`[rateLimit:${name}]`, err.message);
                return next();
            }
        };
    }

    return expressRateLimit({
        windowMs,
        limit,
        keyGenerator: key,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (req, res) => {
            const resetTime = req.rateLimit?.resetTime;
            const retryAfter = resetTime ? Math.ceil((resetTime.getTime() - Date.now()) / 1000) : Math.ceil(windowMs / 1000);
            sendLimited(res, Math.max(1, retryAfter));
        },
    });
};

// Each route gets its own bucket so, e.g., hint spam can't block answer submission.
export const loginLimiter = createLimiter({ name: 'login', limit: 10, windowMs: 15 * MINUTE });
export const resetPasswordLimiter = createLimiter({ name: 'reset-password', limit: 10, windowMs: 15 * MINUTE });
export const signupLimiter = createLimiter({ name: 'signup', limit: 5, windowMs: HOUR });
export const forgotPasswordLimiter = createLimiter({ name: 'forgot-password', limit: 5, windowMs: HOUR });
export const resendVerificationLimiter = createLimiter({ name: 'resend-verification', limit: 5, windowMs: HOUR });

// Mount after isLoggedIn so they key on the user.
export const submitAnswerLimiter = createLimiter({ name: 'submit-answer', limit: 60, windowMs: MINUTE });
export const useHintLimiter = createLimiter({ name: 'use-hint', limit: 60, windowMs: MINUTE });
export const giveUpLimiter = createLimiter({ name: 'give-up', limit: 60, windowMs: MINUTE });

// Public reads, always per IP.
export const leaderboardLimiter = createLimiter({ name: 'leaderboard', limit: 60, windowMs: MINUTE, key: ipKey });
export const topicStatsLimiter = createLimiter({ name: 'topic-stats', limit: 60, windowMs: MINUTE, key: ipKey });

// Mount after isAdmin.
export const bulkGenerateLimiter = createLimiter({ name: 'generate-bulk', limit: 5, windowMs: HOUR });
