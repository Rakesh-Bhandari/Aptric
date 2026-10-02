import { useEffect, useState } from 'react';

// Countdown and duration helpers for leagues and contests.

/** The current time, ticking every `ms` (for countdowns). */
export const useNow = (ms = 1000) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
};

/** Time left until `iso` as parts, clamped at zero. */
export const countdownParts = (iso: string, now: number) => {
  const total = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
  return { d: Math.floor(total / 86_400), h: Math.floor((total % 86_400) / 3600), m: Math.floor((total % 3600) / 60), s: total % 60, total };
};

/** "2d 04h 13m" (or "04:13:22" inside a day). */
export const formatCountdown = (iso: string, now: number) => {
  const { d, h, m, s } = countdownParts(iso, now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}:${pad(m)}:${pad(s)}`;
};

/** "45 min", "2 h", "1 h 30 min", "3 days". */
export const formatSpan = (fromIso: string, toIso: string) => {
  const mins = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000));
  if (mins >= 2 * 1440) return `${Math.round(mins / 1440)} days`;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};
