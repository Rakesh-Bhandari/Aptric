// src/middleware/validate.js
import { z } from 'zod';
import { ALL_CATEGORIES } from '../utils/helpers.js';
import { DIFFICULTIES } from '../services/questionBank.js';

// Turns zod issues into { field: message }, keeping the first message per field.
// Field names are the path inside body/params/query, e.g. "email" or "jobs.0.count".
const toFieldErrors = (issues) => {
    const fields = {};
    for (const issue of issues) {
        const key = issue.path.length ? issue.path.join('.') : '_';
        if (!(key in fields)) fields[key] = issue.message;
    }
    return fields;
};

// validate({ body, params, query }) → middleware. Each key is an optional zod schema.
// On failure responds 400 { error, fields }: `error` is the first message (what the
// frontend already shows), `fields` maps every invalid field to its message.
// On success the parsed (trimmed/coerced) body replaces req.body; parsed params and
// query are exposed on req.valid since Express 5 makes req.query read-only.
export const validate = (schemas) => (req, res, next) => {
    const fields = {};
    const valid = {};

    for (const part of ['params', 'query', 'body']) {
        const schema = schemas[part];
        if (!schema) continue;
        const result = schema.safeParse(req[part] ?? {});
        if (result.success) valid[part] = result.data;
        else Object.assign(fields, toFieldErrors(result.error.issues));
    }

    const messages = Object.values(fields);
    if (messages.length) {
        return res.status(400).json({ error: messages[0], fields });
    }

    if (valid.body) req.body = valid.body;
    req.valid = valid;
    next();
};

// ── Shared field rules ─────────────────────────────────────────

export const email = z
    .string({ error: 'Email is required' })
    .trim()
    .min(1, 'Email is required')
    .max(255, 'Email must be at most 255 characters')
    .pipe(z.email('Enter a valid email address'));

// New passwords. bcrypt only reads the first 72 bytes.
export const password = z
    .string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[A-Za-z]/, 'Password must contain both letters and digits')
    .regex(/\d/, 'Password must contain both letters and digits');

// Existing passwords (login): only shape-checked, so accounts created before the
// rules existed can still sign in.
export const loginPassword = z
    .string({ error: 'Password is required' })
    .min(1, 'Password is required')
    .max(128, 'Password must be at most 128 characters');

export const displayName = z
    .string({ error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(50, 'Name must be at most 50 characters');

export const bio = z
    .string({ error: 'Bio must be text' })
    .trim()
    .max(300, 'Bio must be at most 300 characters')
    .nullable()
    .default(null);

export const feedbackComment = z
    .string({ error: 'Comment must be text' })
    .trim()
    .max(1000, 'Comment must be at most 1000 characters')
    .nullable()
    .default(null)
    .transform((v) => v || null);

// Accepts a number or a numeric string (DECIMAL columns come back from mysql2 as
// strings, and the edit form sends the stored value back unchanged).
export const rating = z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
    z
        .number({ error: 'Rating must be a number between 0.5 and 5' })
        .min(0.5, 'Rating must be between 0.5 and 5')
        .max(5, 'Rating must be between 0.5 and 5')
        .multipleOf(0.5, 'Rating must be in steps of 0.5')
);

export const category = z.enum(ALL_CATEGORIES, { error: `Category must be one of: ${ALL_CATEGORIES.join(', ')}` });
export const difficulty = z.enum(DIFFICULTIES, { error: `Difficulty must be one of: ${DIFFICULTIES.join(', ')}` });

export const role = z.enum(['user', 'editor', 'admin'], { error: 'Role must be user, editor or admin' });

// ── IDs ────────────────────────────────────────────────────────
// users.user_id: nanoid(12)
export const userId = z.string().regex(/^[A-Za-z0-9_-]{12}$/, 'Invalid user id');
// questions.qid: "Q" + nanoid(10); VARCHAR(16) allows older shorter ids
export const qid = z.string({ error: 'Question id is required' }).regex(/^Q[A-Za-z0-9_-]{1,15}$/, 'Invalid question id');
// AUTO_INCREMENT INT keys (question_id, feedback_id, report_id)
export const numericId = z.string().regex(/^[1-9]\d{0,9}$/, 'Invalid id');

// users.handle: see makeHandle() in utils/helpers.js
export const handle = z.string().regex(/^[a-z0-9-]{1,40}$/, 'Invalid handle');
export const handleParams = z.object({ handle });

// limit/offset paging for list endpoints
export const pageQuery = (defaultLimit = 50, maxLimit = 100) => ({
    limit: z.coerce.number({ error: 'Limit must be a number' }).int('Limit must be a whole number')
        .min(1, 'Limit must be at least 1').max(maxLimit, `Limit must be at most ${maxLimit}`).default(defaultLimit),
    offset: z.coerce.number({ error: 'Offset must be a number' }).int('Offset must be a whole number')
        .min(0, 'Offset must be 0 or more').max(100000, 'Offset is too large').default(0),
});

export const userIdParams = z.object({ id: userId });
export const numericIdParams = z.object({ id: numericId });
