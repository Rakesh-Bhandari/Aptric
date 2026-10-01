import { assertAlmostEquals, assertEquals, assertThrows } from '@std/assert';
import { evaluate, ExprError, matchesOption, numericCheck, parseOptionNumber } from './numeric.ts';

Deno.test('evaluate: precedence, associativity and unary minus', () => {
  assertEquals(evaluate('2 + 3 * 4'), 14);
  assertEquals(evaluate('(2 + 3) * 4'), 20);
  assertEquals(evaluate('2 ^ 3 ^ 2'), 512);
  assertEquals(evaluate('-2 ^ 2'), -4);
  assertEquals(evaluate('2 ^ -1'), 0.5);
  assertEquals(evaluate('10 - 4 - 3'), 3);
  assertEquals(evaluate('100 / 5 / 2'), 10);
  assertEquals(evaluate('2 ** 10'), 1024);
  assertEquals(evaluate('1.5e3 + .5'), 1500.5);
  assertEquals(evaluate('12 × 3 ÷ 4 − 1'), 8);
});

Deno.test('evaluate: functions and constants', () => {
  assertEquals(evaluate('sqrt(144) + cbrt(27)'), 15);
  assertEquals(evaluate('nCr(10, 3)'), 120);
  assertEquals(evaluate('nPr(5, 2)'), 20);
  assertEquals(evaluate('fact(5) / (fact(2) * fact(3))'), 10);
  assertEquals(evaluate('gcd(84, 36) * lcm(4, 6)'), 144);
  assertEquals(evaluate('max(3, 9, 4) - min(3, 9)'), 6);
  assertEquals(evaluate('round(2/3, 2)'), 0.67);
  assertAlmostEquals(evaluate('log(8, 2)'), 3);
  assertAlmostEquals(evaluate('pi * 7 ^ 2'), 153.93804002589985);
  assertAlmostEquals(evaluate('5000 * (1 + 10/100) ^ 2 - 5000'), 1050);
});

Deno.test('evaluate: rejects anything that is not plain arithmetic', () => {
  for (const bad of ['', 'x + 1', '2(3)', 'alert(1)', 'sqrt(4', '1 / 0', '3 +', 'fact(2.5)', 'nCr(3, 5)', '2 = 2', 'sqrt(1, 2)', 'a'.repeat(501)]) {
    assertThrows(() => evaluate(bad), ExprError, undefined, bad);
  }
  assertThrows(() => evaluate('sqrt(-1)'), ExprError);
});

Deno.test('parseOptionNumber: numbers with currency and units', () => {
  assertEquals(parseOptionNumber('₹1,250'), { value: 1250, decimals: 0 });
  assertEquals(parseOptionNumber('Rs. 1,00,000'), { value: 100000, decimals: 0 });
  assertEquals(parseOptionNumber('12.5%'), { value: 12.5, decimals: 1 });
  assertEquals(parseOptionNumber('45 km/h'), { value: 45, decimals: 0 });
  assertEquals(parseOptionNumber('−3'), { value: -3, decimals: 0 });
  assertEquals(parseOptionNumber('3/4'), { value: 0.75, decimals: null });
  assertEquals(parseOptionNumber('2 1/2 hours'), { value: 2.5, decimals: null });
  assertEquals(parseOptionNumber('33.33'), { value: 33.33, decimals: 2 });
  assertEquals(parseOptionNumber('154 sq. cm'), { value: 154, decimals: 0 });
});

Deno.test('parseOptionNumber: non-numeric options', () => {
  for (const s of ['2 hours 30 minutes', 'x = 5', 'None of these', 'A and B', '3 : 4', '1/0', '']) {
    assertEquals(parseOptionNumber(s), null, s);
  }
});

Deno.test('matchesOption: exact unless rounded or approximate', () => {
  assertEquals(matchesOption(100 / 3, parseOptionNumber('33.33')!, false), true);
  assertEquals(matchesOption(12.4, parseOptionNumber('12')!, false), false);
  assertEquals(matchesOption(12.4, parseOptionNumber('12')!, true), true);
  assertEquals(matchesOption(0.75, parseOptionNumber('3/4')!, true), true);
  assertEquals(matchesOption(0.76, parseOptionNumber('3/4')!, true), false);
});

const q = (stem: string, options: string[], correct_index: number) => ({ stem, options, correct_index });

Deno.test('numericCheck: confirms a correct key', () => {
  const r = numericCheck(q('A sum of ₹5000 at 10% compound interest for 2 years earns?', ['₹1,000', '₹1,050', '₹1,100', '₹1,150'], 1), '5000 * (1 + 10/100)^2 - 5000');
  assertEquals(r, { applicable: true, ok: true, value: 1050.0000000000009 });
});

Deno.test('numericCheck: catches a wrong key, a missing or broken computation, and ambiguity', () => {
  const stem = 'A train 120 m long passes a pole in 6 s. Its speed in km/h is?';
  const opts = ['60 km/h', '72 km/h', '80 km/h', '90 km/h'];
  assertEquals(numericCheck(q(stem, opts, 1), '120 / 6 * 18 / 5'), { applicable: true, ok: true, value: 72 });
  assertEquals((numericCheck(q(stem, opts, 0), '120 / 6 * 18 / 5') as { ok: boolean }).ok, false);
  assertEquals((numericCheck(q(stem, opts, 1), null) as { ok: boolean }).ok, false);
  assertEquals((numericCheck(q(stem, opts, 1), '120 / speed') as { ok: boolean }).ok, false);
  const dupes = numericCheck(q('Approximately?', ['33.3', '33.33', '40', '50'], 1), '100 / 3');
  assertEquals((dupes as { ok: boolean }).ok, false);
});

Deno.test('numericCheck: not applicable when any option is not a number', () => {
  assertEquals(numericCheck(q('Who is A to B?', ['Father', 'Uncle', 'Brother', 'Cousin'], 0), null), { applicable: false });
});
