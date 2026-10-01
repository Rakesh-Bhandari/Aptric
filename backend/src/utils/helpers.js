import { customAlphabet } from 'nanoid';

// --- Game Constants ---
// Correct-answer points for the daily set, by question difficulty.
// Topic practice awards half (see pointsForCorrect).
export const POINTS_BY_DIFFICULTY = { Easy: 50, Medium: 100, Hard: 150 };
export const POINTS_GIVEUP = 0; // never worth more than a wrong answer
export const POINTS_HINT = -10;
export const POINTS_WRONG = -20;

export function pointsForCorrect(difficulty, isDaily) {
    const base = POINTS_BY_DIFFICULTY[difficulty] ?? POINTS_BY_DIFFICULTY.Medium;
    return isDaily ? base : Math.floor(base / 2);
}

// --- Level Calculator ---
export const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Pro', 'Expert'];

// The higher of two levels; unknown levels rank lowest.
export function maxLevel(a, b) {
    return LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b;
}

export function calculateLevel(score) {
    if (score <= 25000) return 'Beginner';
    if (score <= 50000) return 'Intermediate';
    if (score <= 75000) return 'Advanced';
    if (score <= 100000) return 'Pro';
    return 'Expert';
}

// --- Date Helpers ---
// The single product time zone: "today" (daily questions, attempts, streaks)
// rolls over at midnight here. Keep in sync with frontend/src/utils/time.js.
export const PRODUCT_TIME_ZONE = 'Asia/Kolkata';

const productDateFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: PRODUCT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});

// 'YYYY-MM-DD' for the product-time-zone calendar day containing `date`.
export function getTodayDate(date = new Date()) {
    return productDateFormat.format(date);
}

// 'YYYY-MM-DD' of the day before `today` (defaults to the product-time-zone today).
export function getYesterdayDate(today = getTodayDate()) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split('T')[0];
}

// --- Activity Logger ---
export async function logActivity(pool, userId, action, details) {
    try {
        await pool.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)',
            [userId, action, details]
        );
    } catch (e) {
        console.error('Logging failed', e);
    }
}

// --- Public handles ---
// users.handle: "<name slug, max 24>-<8 random chars>", e.g. "priya-sharma-3f9k2x7q".
// Used in public URLs/responses instead of user_id. Set once at signup and not
// changed on rename, so shared profile links keep working.
// Same shape as the backfill in migrations/005_user_counters_handle.sql.
const handleSuffix = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

export function makeHandle(name) {
    const slug = String(name || '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        .slice(0, 24).replace(/-+$/, '');
    return `${slug || 'user'}-${handleSuffix()}`;
}

// --- All topic categories ---
export const ALL_CATEGORIES = [
    'Quantitative Aptitude',
    'Logical Reasoning',
    'Verbal Ability',
    'Data Interpretation',
    'Puzzles',
    'Technical Aptitude'
];
