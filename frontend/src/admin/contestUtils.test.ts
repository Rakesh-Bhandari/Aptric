import { describe, expect, it } from 'vitest';
import { canDelete, durationMinutes, endFromDuration, fromInputValue, move, toInputValue, validateContest } from './contestUtils';

const draft = (patch = {}) => ({
  title: 'Weekly quant',
  description: '',
  starts: '2026-10-10T10:00',
  ends: '2026-10-10T11:00',
  questions: [{ id: 'a' }, { id: 'b' }],
  is_published: false,
  ...patch,
});

describe('contest form dates', () => {
  it('round-trips datetime-local values through ISO', () => {
    expect(toInputValue(fromInputValue('2026-10-10T10:30'))).toBe('2026-10-10T10:30');
    expect(fromInputValue('')).toBe('');
    expect(fromInputValue('nonsense')).toBe('');
    expect(toInputValue(null)).toBe('');
  });
  it('derives duration and end time from each other', () => {
    expect(durationMinutes('2026-10-10T10:00', '2026-10-10T11:30')).toBe(90);
    expect(durationMinutes('', '2026-10-10T11:30')).toBe('');
    expect(endFromDuration('2026-10-10T10:00', 90)).toBe('2026-10-10T11:30');
    expect(endFromDuration('2026-10-10T10:00', 0)).toBe('');
    expect(endFromDuration('', 30)).toBe('');
  });
});

describe('validateContest', () => {
  it('accepts a complete draft', () => {
    expect(validateContest(draft())).toEqual([]);
    expect(validateContest(draft({ is_published: true }))).toEqual([]);
  });
  it('needs a title', () => {
    expect(validateContest(draft({ title: '  ' }))).toEqual(['Give the contest a title.']);
    expect(validateContest(draft({ title: 'x'.repeat(121) }))[0]).toMatch(/at most 120/);
  });
  it('needs a window that ends after it starts and lasts at most 14 days', () => {
    expect(validateContest(draft({ ends: '' }))).toEqual(['Set a start and an end time.']);
    expect(validateContest(draft({ ends: '2026-10-10T10:00' }))).toEqual(['The contest must end after it starts.']);
    expect(validateContest(draft({ ends: '2026-10-25T10:00' }))[0]).toMatch(/at most 14 days/);
    expect(validateContest(draft({ ends: '2026-10-24T10:00' }))).toEqual([]);
  });
  it('rejects repeated questions and publishing without any', () => {
    expect(validateContest(draft({ questions: [{ id: 'a' }, { id: 'a' }] }))).toEqual(['A question can only appear once.']);
    expect(validateContest(draft({ questions: [], is_published: true }))).toEqual(['Add at least one question before publishing.']);
    expect(validateContest(draft({ questions: [] }))).toEqual([]);
  });
});

describe('list helpers', () => {
  it('only offers delete while nobody has joined', () => {
    expect(canDelete({ participants: 0 })).toBe(true);
    expect(canDelete({ participants: 3 })).toBe(false);
  });
  it('moves questions without mutating or going out of range', () => {
    const list = ['a', 'b', 'c'];
    expect(move(list, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(move(list, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(move(list, 0, -1)).toBe(list);
    expect(move(list, 2, 3)).toBe(list);
    expect(list).toEqual(['a', 'b', 'c']);
  });
});
