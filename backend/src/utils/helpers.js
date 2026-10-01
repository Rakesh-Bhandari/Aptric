// --- Game Constants ---
export const POINTS_CORRECT = 100;
export const POINTS_GIVEUP = 10;
export const POINTS_HINT = -10;
export const POINTS_WRONG = -20;

// --- Level Calculator ---
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
