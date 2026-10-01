import { describe, expect, it } from 'vitest';
import { hintCost, leagueZone, levelXp, pointsFor } from './game';
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
