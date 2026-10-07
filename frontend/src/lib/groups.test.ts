import { describe, expect, it } from 'vitest';
import { canManage, cleanCode, codeFromInput, isCode, isFull, memberText, rankDeltaSpeech, rankDeltaText, validRange, windowsFor } from './groups';

describe('league helpers', () => {
  it('offers a season window only when there is a season', () => {
    expect(windowsFor({ season_start: null })).toEqual(['weekly', 'monthly', 'all_time', 'custom']);
    expect(windowsFor({ season_start: '2026-06-01' })).toEqual(['weekly', 'monthly', 'season', 'all_time', 'custom']);
  });
  it('knows who runs a league', () => {
    expect(canManage('owner')).toBe(true);
    expect(canManage('admin')).toBe(true);
    expect(canManage('member')).toBe(false);
    expect(canManage(null)).toBe(false);
  });
  it('words the change in rank', () => {
    expect(rankDeltaText(2)).toBe('+2');
    expect(rankDeltaText(-1)).toBe('−1');
    expect(rankDeltaText(0)).toBe('–');
    expect(rankDeltaText(null)).toBe('');
    expect(rankDeltaSpeech(1)).toBe('up 1 place');
    expect(rankDeltaSpeech(-3)).toBe('down 3 places');
    expect(rankDeltaSpeech(0)).toBe('no change in rank');
    expect(rankDeltaSpeech(null)).toBe('no earlier result to compare');
  });
  it('accepts a custom range of up to 93 days', () => {
    expect(validRange('2026-10-01', '2026-10-31')).toBe(true);
    expect(validRange('2026-10-01', '2026-10-01')).toBe(true);
    expect(validRange('2026-01-01', '2026-04-03')).toBe(true);
    expect(validRange('2026-01-01', '2026-04-04')).toBe(false);
    expect(validRange('2026-10-31', '2026-10-01')).toBe(false);
    expect(validRange('', '2026-10-01')).toBe(false);
  });
  it('reads an invite code from a link or typed by hand', () => {
    expect(cleanCode(' ABCD-efgh jk ')).toBe('abcdefghjk');
    expect(isCode('ABCD efgh jk')).toBe(true);
    expect(isCode('short')).toBe(false);
    expect(isCode('abcdefghjkmn')).toBe(false);
    expect(codeFromInput('https://aptric.app/leagues/join?code=AbCdEfGhJk')).toBe('abcdefghjk');
    expect(codeFromInput('abcdefghjk')).toBe('abcdefghjk');
    expect(codeFromInput('https://aptric.app/leagues/join')).toBe('httpsaptricappleaguesjoin');
  });
  it('says how full a league is', () => {
    expect(memberText({ member_count: 42, max_members: 300 })).toBe('42 of 300 members');
    expect(isFull({ member_count: 300, max_members: 300, is_archived: false })).toBe(true);
    expect(isFull({ member_count: 3, max_members: 300, is_archived: true })).toBe(true);
    expect(isFull({ member_count: 3, max_members: 300, is_archived: false })).toBe(false);
  });
});
