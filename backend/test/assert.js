// The few @std/assert helpers the generation tests use, over node:assert.
import assert from 'node:assert/strict';

export const assertEquals = (actual, expected, message) => assert.deepStrictEqual(actual, expected, message);

export const assertAlmostEquals = (actual, expected, tolerance = 1e-7, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, message ?? `${actual} is not within ${tolerance} of ${expected}`);

export const assertThrows = (fn, ErrorClass, includes, message) =>
  assert.throws(fn, (err) => (!ErrorClass || err instanceof ErrorClass) && (!includes || String(err?.message).includes(includes)), message);
