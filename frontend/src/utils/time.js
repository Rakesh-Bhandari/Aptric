// The single product time zone: the daily set (and streak day) rolls over at
// midnight here. Keep in sync with PRODUCT_TIME_ZONE in backend/src/utils/helpers.js.
export const PRODUCT_TIME_ZONE = 'Asia/Kolkata';

const clockFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: PRODUCT_TIME_ZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit'
});

// Milliseconds until the next midnight in PRODUCT_TIME_ZONE, independent of
// the viewer's local zone. Asia/Kolkata has no DST, so every day is 24h long.
export function msUntilProductMidnight(now = new Date()) {
    const parts = Object.fromEntries(clockFormat.formatToParts(now).map(p => [p.type, p.value]));
    const elapsed = ((Number(parts.hour) * 60 + Number(parts.minute)) * 60 + Number(parts.second)) * 1000 + now.getMilliseconds();
    return 24 * 60 * 60 * 1000 - elapsed;
}
