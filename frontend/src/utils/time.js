// The daily set (and streak day) rolls over at midnight in the user's own
// timezone (profiles.timezone); the server decides which set is "today".
export const DEFAULT_TIME_ZONE = 'UTC';

const clockFormats = new Map();
const clockFormat = (timeZone) => {
    if (!clockFormats.has(timeZone)) {
        clockFormats.set(timeZone, new Intl.DateTimeFormat('en-GB', {
            timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit'
        }));
    }
    return clockFormats.get(timeZone);
};

// Milliseconds until the next midnight in timeZone, independent of the
// viewer's local zone. Ignores DST transitions (at most an hour off on those days).
export function msUntilMidnight(timeZone = DEFAULT_TIME_ZONE, now = new Date()) {
    let fmt;
    try { fmt = clockFormat(timeZone); } catch { fmt = clockFormat(DEFAULT_TIME_ZONE); }
    const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
    const elapsed = ((Number(parts.hour) * 60 + Number(parts.minute)) * 60 + Number(parts.second)) * 1000 + now.getMilliseconds();
    return 24 * 60 * 60 * 1000 - elapsed;
}
