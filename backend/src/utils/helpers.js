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

// --- All topic categories ---
export const ALL_CATEGORIES = [
    'Quantitative Aptitude',
    'Logical Reasoning',
    'Verbal Ability',
    'Data Interpretation',
    'Puzzles',
    'Technical Aptitude'
];
