// Display helpers. All dates are formatted in the viewer's locale.

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** 65_000 -> "1:05"; 3_725_000 -> "1:02:05". */
export const formatClock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

/** 65_000 -> "1 min 5 sec"; 4_000 -> "4 sec". For screen readers and summaries. */
export const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} sec`;
  return s === 0 ? `${m} min` : `${m} min ${s} sec`;
};

export const formatPercent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–');

const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null;

/** "in 3 days", "2 hours ago", "tomorrow". */
export const formatRelative = (iso: string, now = Date.now()) => {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000],
  ];
  for (const [unit, size] of units) {
    if (abs >= size || unit === 'minute') {
      const value = Math.round(diff / size);
      return rtf ? rtf.format(value, unit) : `${value} ${unit}s`;
    }
  }
  return '';
};

/** "Mon, 6 Oct" (dates as YYYY-MM-DD are calendar dates, not instants). */
export const formatDay = (isoDate: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, opts);
};

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const initials = (name: string | null | undefined) =>
  (name ?? '?')
    .replace(/^@/, '')
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

export const displayName = (p: { display_name?: string | null; handle?: string | null }) =>
  p.display_name || (p.handle ? `@${p.handle}` : 'Player');
