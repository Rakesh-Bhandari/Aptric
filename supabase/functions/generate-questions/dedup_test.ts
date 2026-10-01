import { assertAlmostEquals, assertEquals } from '@std/assert';
import { contentHash as importContentHash } from '../../scripts/import-v1-questions.mjs';
import { contentHash, cosine, toVector } from './dedup.ts';

Deno.test('contentHash matches the v1 import script', async () => {
  const cases: [string, string[]][] = [
    ['A train 120 m long passes a pole in 6 s. Find its speed.', ['60 km/h', '72 km/h', '80 km/h', '90 km/h']],
    ['  What is 25% of ₹1,200?  ', ['₹300', '₹250', '₹350', '₹400']],
    ['Ünïcode — and *markdown*', ['α', 'β', 'γ', 'δ']],
  ];
  for (const [stem, options] of cases) {
    assertEquals(await contentHash(stem, options), importContentHash(stem, options));
  }
});

Deno.test('contentHash ignores option order, case and punctuation', async () => {
  const a = await contentHash('What is 2 + 2?', ['3', '4', '5', '6']);
  assertEquals(await contentHash('what is 2+2', ['6', '5', '4', '3']), a);
  assertEquals(a === await contentHash('What is 2 + 3?', ['3', '4', '5', '6']), false);
});

Deno.test('cosine and pgvector text format', () => {
  assertAlmostEquals(cosine([1, 0], [1, 0]), 1);
  assertAlmostEquals(cosine([1, 0], [0, 1]), 0);
  assertEquals(cosine([0, 0], [1, 0]), 0);
  assertEquals(toVector([0.5, -1, 2e-7]), '[0.5,-1,2e-7]');
});
