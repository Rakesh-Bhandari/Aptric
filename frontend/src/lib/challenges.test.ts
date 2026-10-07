import { describe, expect, it } from 'vitest';
import { challengeLink, decidedBy, formatTarget, headline, outcomeFor, shareMessage, timeToAct } from './challenges';
import type { Challenge } from './types';

const user = (handle: string) => ({ handle }) as Challenge['challenger'];
const base = {
  role: 'challenger', challenger: user('asha'), opponent: user('ben'), target: { score: 8, total: 10, time_ms: 252_000 },
  status: 'pending', draft: false, result: null,
} as const;
const side = (score: number, time_ms: number, hints = 0) => ({ score, time_ms, hints });
const completed = (winner: 'challenger' | 'opponent' | 'draw', role: 'challenger' | 'opponent' | 'viewer') =>
  ({ ...base, role, status: 'completed', result: { winner, challenger: side(8, 1), opponent: side(7, 1) } }) as unknown as Challenge;

describe('challenge wording', () => {
  it('words the target', () => {
    expect(formatTarget(8, 10, 252_000)).toBe('8/10 in 4:12');
    expect(formatTarget(10, 10, 65_000)).toBe('10/10 in 1:05');
    expect(shareMessage({ target: { score: 8, total: 10, time_ms: 252_000 }, question_count: 10 })).toBe('Beat my score on Aptric: 8/10 in 4:12');
    expect(shareMessage({ target: null, question_count: 10 })).toBe('Challenge me on Aptric');
    expect(challengeLink('abcdefghjkmnpqrs', 'https://aptric.app')).toBe('https://aptric.app/c/abcdefghjkmnpqrs');
  });
  it('says how it ended for each side', () => {
    expect(outcomeFor(completed('challenger', 'challenger'))).toBe('won');
    expect(outcomeFor(completed('challenger', 'opponent'))).toBe('lost');
    expect(outcomeFor(completed('opponent', 'opponent'))).toBe('won');
    expect(outcomeFor(completed('draw', 'opponent'))).toBe('draw');
    expect(outcomeFor(completed('challenger', 'viewer'))).toBeNull();
    expect(outcomeFor({ role: 'opponent', result: null })).toBeNull();
  });
  it('explains what decided it, in the order the server uses', () => {
    expect(decidedBy(side(8, 5), side(7, 1))).toBe('score');
    expect(decidedBy(side(7, 5), side(7, 6))).toBe('time');
    expect(decidedBy(side(7, 5, 1), side(7, 5, 2))).toBe('hints');
    expect(decidedBy(side(7, 5, 1), side(7, 5, 1))).toBe('none');
  });
  it('has a line for every state', () => {
    expect(headline({ ...base, draft: true } as never)).toBe('Play your set first, then it is sent');
    expect(headline(base as never)).toBe('Waiting for @ben');
    expect(headline({ ...base, status: 'accepted' } as never)).toBe('@ben is playing');
    expect(headline({ ...base, role: 'opponent' } as never)).toBe('@asha challenged you: beat 8/10');
    expect(headline(completed('challenger', 'challenger'))).toBe('You beat @ben');
    expect(headline(completed('challenger', 'opponent'))).toBe('@asha beat you');
    expect(headline(completed('draw', 'challenger'))).toBe('A draw with @ben');
    expect(headline({ ...base, status: 'declined' } as never)).toBe('@ben declined');
    expect(headline({ ...base, role: 'opponent', status: 'declined' } as never)).toBe('You declined @asha');
    expect(headline({ ...base, status: 'expired' } as never)).toBe('Expired (@ben)');
    expect(headline({ ...base, opponent: null, role: 'challenger' } as never)).toBe('Waiting for anyone with the link');
  });
  it('counts down to the next deadline on the server clock', () => {
    const at = Date.parse('2026-10-06T12:00:00Z');
    expect(timeToAct({ status: 'pending', accept_by: '2026-10-06T13:00:00Z', complete_by: null, my_run: null }, at)).toBe(3_600_000);
    expect(timeToAct({ status: 'pending', accept_by: '2026-10-06T13:00:00Z', complete_by: null, my_run: null }, at, -1_000)).toBe(3_601_000);
    expect(timeToAct({ status: 'accepted', accept_by: null, complete_by: null, my_run: { started_at: 'x', deadline_at: '2026-10-06T12:30:00Z', finished_at: null, violation: null, answered: 0 } }, at)).toBe(1_800_000);
    expect(timeToAct({ status: 'accepted', accept_by: null, complete_by: null, my_run: { started_at: 'x', deadline_at: '2026-10-06T12:30:00Z', finished_at: 'y', violation: null, answered: 3 } }, at)).toBeNull();
    expect(timeToAct({ status: 'completed', accept_by: null, complete_by: null, my_run: null }, at)).toBeNull();
  });
});
