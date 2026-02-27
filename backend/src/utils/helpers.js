// --- Game Constants ---
export const POINTS_CORRECT = 100;
export const POINTS_GIVEUP = 10;
export const POINTS_HINT = -10;
export const POINTS_WRONG = -20;
export const STREAK_LOSS = -50;

// --- Level Calculator ---
export function calculateLevel(score) {
    if (score <= 25000) return 'Beginner';
    if (score <= 50000) return 'Intermediate';
    if (score <= 75000) return 'Advanced';
    if (score <= 100000) return 'Pro';
    return 'Expert';
}

// --- Date Helper ---
export function getTodayDate() {
    return new Date().toISOString().split('T')[0];
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

// --- Streak Calculator ---
export async function calculateRealStreak(userId, pool) {
    const [rows] = await pool.query(
        "SELECT DISTINCT DATE_FORMAT(attempt_date, '%Y-%m-%d') as dateStr FROM user_attempts WHERE user_id = ? ORDER BY attempt_date DESC",
        [userId]
    );

    if (rows.length === 0) return 0;

    const toDateString = (date) => date.toISOString().split('T')[0];
    const now = new Date();
    const todayStr = toDateString(now);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toDateString(yesterday);

    const latestActivity = rows[0].dateStr;
    if (latestActivity !== todayStr && latestActivity !== yesterdayStr) return 0;

    let streak = 0;
    let expectedDate = new Date(latestActivity);

    for (const row of rows) {
        if (row.dateStr === toDateString(expectedDate)) {
            streak++;
            expectedDate.setDate(expectedDate.getDate() - 1);
        } else {
            break;
        }
    }

    return streak;
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
