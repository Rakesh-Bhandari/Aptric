import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inline, literal, returnsRows } from '../src/db.js';

test('literals: quotes doubled, null, booleans, numbers, dates, json', () => {
  assert.equal(literal(null), 'NULL');
  assert.equal(literal(undefined), 'NULL');
  assert.equal(literal("O'Brien"), "'O''Brien'");
  assert.equal(literal("x'); drop table t; --"), "'x''); drop table t; --'");
  assert.equal(literal('back\\slash'), "'back\\slash'");
  assert.equal(literal(true), "'true'");
  assert.equal(literal(42), "'42'");
  assert.equal(literal(new Date('2026-10-02T00:00:00Z')), "'2026-10-02T00:00:00.000Z'");
  assert.equal(literal({ a: "it's" }), `'{"a":"it''s"}'`);
});

test('arrays become Postgres array literals', () => {
  assert.equal(literal(['a', 'b c', null]), `'{"a","b c",NULL}'`);
  assert.equal(literal(['q"uo\\te', "it's"]), `'{"q\\"uo\\\\te","it''s"}'`);
  assert.equal(literal([]), "'{}'");
});

test('inline replaces each placeholder once, highest numbers intact', () => {
  const params = ['$2', 'b', 3, 4, 5, 6, 7, 8, 9, 'ten'];
  assert.equal(inline('select $1, $2::uuid, $10', params), "select '$2', 'b'::uuid, 'ten'");
  assert.equal(inline('select 1'), 'select 1');
  assert.throws(() => inline('select $2', ['a']), /No value for \$2/);
});

test('returnsRows tells queries and RETURNING apart from plain writes', () => {
  assert.equal(returnsRows('\n  select 1'), true);
  assert.equal(returnsRows('with x as (update t set a = 1 returning id) select * from x'), true);
  assert.equal(returnsRows('insert into t (a) values (1) returning *'), true);
  assert.equal(returnsRows('update t set a = 1 where id = $1'), false);
  assert.equal(returnsRows('delete from t where id = $1'), false);
});
