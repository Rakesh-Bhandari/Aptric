import { describe, expect, it } from 'vitest';
import {
  defaultWindow, fromLocalInput, hostBlockers, hostedLabel, noXpReason, quotaLeft, quotaText, seenWarning, toLocalInput, validateDraft,
} from './hosting';
import type { HostDraft, HostGate } from './types';

const NOW = Date.parse('2026-10-07T10:00:00Z');
const draft = (over: Partial<HostDraft> = {}): HostDraft => ({
  title: 'Friday quiz', description: '', starts_at: new Date(NOW + 2 * 3600_000).toISOString(), ends_at: new Date(NOW + 3 * 3600_000).toISOString(),
  question_ids: ['a', 'b', 'c', 'd', 'e'], visibility: 'unlisted', group_id: null, access_code: null, clear_access_code: false,
  max_participants: 20, late_join_minutes: 15, host_plays: false, ...over,
});
const gate = (over: Partial<HostGate> = {}): HostGate => ({
  ok: false, reasons: [], via_group: false, level: 3, min_level: 5, verified: true, age_days: 10, min_age_days: 30, post_strikes: 0, host_strikes: 0, ...over,
});

describe('hostBlockers', () => {
  it('says what is missing, one sentence each', () => {
    expect(hostBlockers(gate({ reasons: ['level', 'age', 'email'] }))).toEqual([
      'Reach level 5 (you are level 3).', 'Your account must be 30 days old (it is 10).', 'Verify your email address.',
    ]);
    expect(hostBlockers(gate({ reasons: ['suspended'] }))[0]).toMatch(/two strikes/);
    expect(hostBlockers(gate({ ok: true }))).toEqual([]);
  });
});

describe('quota', () => {
  it('counts what is left and never goes below zero', () => {
    expect(quotaText({ used: 1, limit: 2, max_participants: 50 })).toBe('1 of 2 contests used this month');
    expect(quotaLeft({ used: 1, limit: 2, max_participants: 50 })).toBe(1);
    expect(quotaLeft({ used: 3, limit: 2, max_participants: 50 })).toBe(0);
  });
});

describe('validateDraft', () => {
  it('accepts a good draft', () => expect(validateDraft(draft(), NOW, 50, true)).toEqual({}));
  it('wants a title', () => expect(validateDraft(draft({ title: '  ' }), NOW, 50).title).toBeTruthy());
  it('needs the start an hour away', () => {
    expect(validateDraft(draft({ starts_at: new Date(NOW + 30 * 60_000).toISOString() }), NOW, 50).when).toMatch(/at least an hour/);
    expect(validateDraft(draft({ starts_at: new Date(NOW + 3600_000).toISOString(), ends_at: new Date(NOW + 2 * 3600_000).toISOString() }), NOW, 50).when).toBeUndefined();
  });
  it('limits how long it runs', () => {
    expect(validateDraft(draft({ ends_at: new Date(NOW + 2 * 3600_000 + 5 * 60_000).toISOString() }), NOW, 50).when).toMatch(/10 minutes/);
    expect(validateDraft(draft({ ends_at: new Date(NOW + 10 * 86400_000).toISOString() }), NOW, 50).when).toMatch(/7 days/);
  });
  it('asks for 5 questions only when scheduling', () => {
    expect(validateDraft(draft({ question_ids: ['a'] }), NOW, 50, false).questions).toBeUndefined();
    expect(validateDraft(draft({ question_ids: ['a'] }), NOW, 50, true).questions).toMatch(/at least 5/);
    expect(validateDraft(draft({ question_ids: Array.from({ length: 31 }, (_, i) => String(i)) }), NOW, 50).questions).toMatch(/at most 30/);
  });
  it('a league contest names its league', () => expect(validateDraft(draft({ visibility: 'group' }), NOW, 50).group).toBeTruthy());
  it('checks the access code and the player cap against the plan', () => {
    expect(validateDraft(draft({ access_code: 'ab' }), NOW, 50).code).toBeTruthy();
    expect(validateDraft(draft({ access_code: 'Secret1' }), NOW, 50).code).toBeUndefined();
    expect(validateDraft(draft({ max_participants: 51 }), NOW, 50).players).toBe('Between 2 and 50 players on your plan.');
  });
  it('keeps late entry within the contest', () => expect(validateDraft(draft({ late_join_minutes: 61 }), NOW, 50).late).toBeTruthy());
});

describe('seenWarning', () => {
  it('speaks only when there is something to say', () => {
    expect(seenWarning(0)).toBeNull();
    expect(seenWarning(1)).toBe('1 question is one you have answered before. You may know the answer.');
    expect(seenWarning(3)).toBe('3 questions are ones you have answered before. You may know the answers.');
  });
});

describe('hostedLabel', () => {
  const base = { state: 'upcoming' as const, status: 'scheduled' as const, review_state: 'none' as const, hidden: false };
  it('names the stage', () => {
    expect(hostedLabel({ ...base, status: 'draft' })).toBe('Draft');
    expect(hostedLabel({ ...base, review_state: 'pending' })).toBe('Waiting for approval');
    expect(hostedLabel({ ...base, review_state: 'rejected' })).toBe('Not approved');
    expect(hostedLabel({ ...base, hidden: true })).toBe('Hidden for review');
    expect(hostedLabel({ ...base, status: 'cancelled' })).toBe('Cancelled');
    expect(hostedLabel({ ...base, state: 'live' })).toBe('Live');
    expect(hostedLabel({ ...base, state: 'ended' })).toBe('Ended');
    expect(hostedLabel(base)).toBe('Scheduled');
  });
});

describe('dates', () => {
  it('round-trips a local input and picks a sensible default', () => {
    const iso = '2026-10-07T12:30:00.000Z';
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(fromLocalInput('nonsense')).toBe('');
    const w = defaultWindow(NOW);
    expect(Date.parse(w.starts_at)).toBeGreaterThanOrEqual(NOW + 2 * 3600_000);
    expect(Date.parse(w.starts_at) % (15 * 60_000)).toBe(0);
    expect(Date.parse(w.ends_at) - Date.parse(w.starts_at)).toBe(3600_000);
  });
});

describe('noXpReason', () => {
  it('only unlisted hosted contests', () => {
    expect(noXpReason({ hosted: true, visibility: 'unlisted' })).toMatch(/do not earn XP/);
    expect(noXpReason({ hosted: true, visibility: 'public' })).toBeNull();
    expect(noXpReason({ hosted: false, visibility: 'public' })).toBeNull();
  });
});
