import { describe, expect, it } from 'vitest';
import { formatClock, formatDuration, formatPercent, initials, plural } from './format';

describe('format', () => {
  it('formats clocks and durations', () => {
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatDuration(4_000)).toBe('4 sec');
    expect(formatDuration(120_000)).toBe('2 min');
    expect(formatDuration(65_000)).toBe('1 min 5 sec');
  });
  it('formats counts', () => {
    expect(plural(1, 'day')).toBe('1 day');
    expect(plural(3, 'day')).toBe('3 days');
    expect(formatPercent(1, 3)).toBe('33%');
    expect(formatPercent(0, 0)).toBe('–');
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('code_ninja')).toBe('CN');
  });
});
