import { describe, expect, it } from 'vitest';
import { correctRatio, hintCost, leagueZone, levelXp, nodeTotal, pointsFor, sessionStars } from './game';
import type { MyLeague } from './types';

describe('scoring mirrors private.score_points', () => {
  it('awards by difficulty, halves practice, charges hints', () => {
    expect(pointsFor('easy', 'daily')).toBe(10);
    expect(pointsFor('hard', 'daily', true)).toBe(25);
    expect(pointsFor('hard', 'practice')).toBe(15);
    expect(pointsFor('easy', 'practice', true)).toBe(2);
    expect(pointsFor('medium', 'practice', true)).toBe(7);
    expect(pointsFor('hard', 'assessment')).toBe(0);
  });

  it('shows the real cost of a hint', () => {
    expect(hintCost('medium', 'daily')).toBe(5);
    expect(hintCost('easy', 'practice')).toBe(3);
    expect(hintCost('hard', 'practice')).toBe(3);
  });
});

describe('levels mirror private.level_xp', () => {
  it('needs 50·L·(L−1) XP', () => {
    expect([1, 2, 3, 5, 10, 20].map(levelXp)).toEqual([0, 100, 300, 1000, 4500, 19000]);
  });
});

describe('leagueZone', () => {
  const league = (n: number, promote: number, demote: number) =>
    ({ promote_zone: promote, demote_zone: demote, members: Array.from({ length: n }, (_, i) => ({ rank: i + 1 })) }) as unknown as MyLeague;
  it('splits ranks into promotion, safe and demotion', () => {
    const l = league(10, 3, 2);
    expect([1, 3, 4, 8, 9, 10].map((r) => leagueZone(l, r))).toEqual(['promote', 'promote', 'safe', 'safe', 'demote', 'demote']);
  });
  it('has no zones when the tier has none', () => {
    expect(leagueZone(league(5, 0, 0), 5)).toBe('safe');
  });
});

describe('session stars follow the correct-answer ratio', () => {
  it('handles empty, zero-correct and perfect sessions', () => {
    expect(correctRatio(0, 0)).toBe(0);
    expect(sessionStars(0, 0)).toBe(0);
    expect(sessionStars(0, 10)).toBe(0);
    expect(sessionStars(10, 10)).toBe(3);
  });

  it('applies the 1/2/3 star thresholds for any session size', () => {
    expect(sessionStars(1, 10)).toBe(1);
    expect(sessionStars(6, 10)).toBe(1);
    expect(sessionStars(7, 10)).toBe(2);
    expect(sessionStars(8, 10)).toBe(2);
    expect(sessionStars(9, 10)).toBe(3);
    expect(sessionStars(2, 3)).toBe(1);
    expect(sessionStars(3, 3)).toBe(3);
    expect(sessionStars(4, 5)).toBe(2);
  });

  it('counts skipped questions against the ratio and clamps', () => {
    // 5 correct of 10 with 5 skipped is 50%, not 100% of the attempted.
    expect(correctRatio(5, 10)).toBe(0.5);
    expect(correctRatio(12, 10)).toBe(1);
  });
});

describe('nodeTotal', () => {
  it('adds attempted and still-new questions', () => {
    expect(nodeTotal({ attempted: 15, available: 1552 })).toBe(1567);
    expect(nodeTotal({ attempted: 0, available: 0 })).toBe(0);
  });
});
