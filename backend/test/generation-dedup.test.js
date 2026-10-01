import { test } from 'node:test';
import { assertAlmostEquals, assertEquals } from './assert.js';
import { contentHash, cosine, toVector } from '../src/generation/dedup.js';
test('contentHash matches the reference digests', async () => {
  // Same vectors as private.content_hash() in supabase/tests/database/admin.test.sql.
  const cases = [
    ['A train 120 m long passes a pole in 6 s. Find its speed.', ['60 km/h', '72 km/h', '80 km/h', '90 km/h'],
      '52399c57727d463c528337e6a1c6949e15bab29635a90a89a1f938556a83f52e'],
    ['  What is 25% of ₹1,200?  ', ['₹300', '₹250', '₹350', '₹400'],
      'a7a4d9ffbb29d2f03197d6a46449a2219063d2f2f1d9fa85434802927c17234a'],
    ['Ünïcode — and *markdown*', ['α', 'β', 'γ', 'δ'],
      '8d2ba8f4228418ab74e182f420e3ca7745f6af18fcc857070fe232870805dab5'],
    ['What is 10% of 80?', ['8', '10', '6'],
      'b8ed17ab31df336d76bf72740472f582aca3c9a52201ef135c8f5dd6f763abbf'],
  ];
  for (const [stem, options, hash] of cases) {
    assertEquals(await contentHash(stem, options), hash);
  }
});
test('contentHash ignores option order, case and punctuation', async () => {
  const a = await contentHash('What is 2 + 2?', ['3', '4', '5', '6']);
  assertEquals(await contentHash('what is 2+2', ['6', '5', '4', '3']), a);
  assertEquals(a === await contentHash('What is 2 + 3?', ['3', '4', '5', '6']), false);
});
test('cosine and pgvector text format', () => {
  assertAlmostEquals(cosine([1, 0], [1, 0]), 1);
  assertAlmostEquals(cosine([1, 0], [0, 1]), 0);
  assertEquals(cosine([0, 0], [1, 0]), 0);
  assertEquals(toVector([0.5, -1, 2e-7]), '[0.5,-1,2e-7]');
});
