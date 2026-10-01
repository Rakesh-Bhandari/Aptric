import { test } from 'node:test';
import { assertEquals } from './assert.js';
import { runBatch } from '../src/generation/pipeline.js';
const job = {
  id: 'job-1',
  subtopic_id: 'sub-1',
  difficulty: 'medium',
  requested: 5,
  inserted: 0,
  model: 'gen-model',
  solver_model: 'solve-model',
};
const question = (stem, options, correct_index, computation = null) => ({
  stem,
  options,
  correct_index,
  explanation: 'Step by step working that reaches the keyed option.',
  hint: null,
  est_seconds: 60,
  computation,
});
const TRAIN = question('A train 120 m long passes a pole in 6 s. What is its speed?', ['60 km/h', '72 km/h', '80 km/h', '90 km/h'], 1, '120 / 6 * 18 / 5');
const INTEREST = question('Find the compound interest on ₹5000 at 10% per annum for 2 years.', ['₹1,000', '₹1,050', '₹1,100', '₹1,150'], 1, '5000 * 1.1^2 - 5000');
const WORK = question('A does a job in 10 days and B in 15 days. Together they take how many days?', ['5', '6', '8', '12'], 1, '1 / (1/10 + 1/15)');
const AGES = question('The ratio of ages of A and B is 3:4 and their sum is 56. What is the age of A?', ['21', '24', '28', '32'], 1, '56 * 3 / 7');
// The solver "knows" the right answer for each stem and picks it wherever the
// shuffled options put it.
function fakeComplete(generated, truth, calls) {
  return (req) => {
    calls.push(req);
    if (req.schemaName === 'aptitude_questions')
      return Promise.resolve({ questions: generated });
    const stem = Object.keys(truth).find((s) => req.user.includes(s));
    const shown = [...req.user.matchAll(/^(\d)\. (.*)$/gm)].map((m) => m[2]);
    if (truth[stem] === 'THROW')
      return Promise.reject(new Error('timeout'));
    return Promise.resolve({ working: '...', answer_index: shown.indexOf(truth[stem]), computation: null });
  };
}
// Embeddings: one axis per distinct stem, unless two stems are mapped to the same axis.
function fakeEmbed(sameAs = {}) {
  const axes = [];
  return (text) => {
    let key = text.split('\n')[0];
    key = sameAs[key] ?? key;
    if (!axes.includes(key))
      axes.push(key);
    const v = new Array(16).fill(0);
    v[axes.indexOf(key)] = 1;
    return Promise.resolve(v);
  };
}
function fakeStore(overrides = {}) {
  const inserted = [];
  const store = {
    context: () => Promise.resolve({ section_slug: 'quantitative-aptitude', section: 'Quant', topic: 'Arithmetic', subtopic: 'Mixed', description: null }),
    recentStems: () => Promise.resolve([]),
    missingEmbeddings: () => Promise.resolve([]),
    storeEmbeddings: () => Promise.resolve(),
    existingHashes: () => Promise.resolve(new Set()),
    nearest: () => Promise.resolve(null),
    insert: (_jobId, q) => {
      inserted.push(q);
      return Promise.resolve({ outcome: 'inserted', question_id: `q-${inserted.length}` });
    },
    ...overrides,
  };
  return { store, inserted };
}
function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
function deps(store, complete, embed = fakeEmbed()) {
  return {
    complete,
    embed,
    store,
    random: seeded(),
    config: { batchSize: 5, similarityThreshold: 0.92, backfillLimit: 20, generateTimeoutMs: 1000, solveTimeoutMs: 1000 },
  };
}
test('runBatch drops invalid, duplicate, miscomputed and disputed questions', async () => {
  const calls = [];
  const generated = [
    TRAIN,
    { ...INTEREST, options: ['₹1,000', '₹1,050', '₹1,100'] }, // 3 options: invalid
    { ...TRAIN, options: [...TRAIN.options].reverse(), correct_index: 2 }, // same content, reordered
    { ...WORK, computation: '1 / (1/10 + 1/20)' }, // generator's computation disagrees with its key
    AGES, // solver disagrees
    INTEREST, // beyond the requested count: ignored
  ];
  const truth = { [TRAIN.stem]: '72 km/h', [AGES.stem]: '28', [WORK.stem]: '6' };
  const { store, inserted } = fakeStore();
  const result = await runBatch(job, deps(store, fakeComplete(generated, truth, calls)));
  assertEquals(result.stats, { inserted: 1, invalid: 1, solver: 1, computed: 1, duplicate_hash: 1, duplicate_similar: 0 });
  assertEquals(result.inserted_ids, ['q-1']);
  assertEquals(inserted[0].stem, TRAIN.stem);
  assertEquals(inserted[0].options[inserted[0].correct_index], '72 km/h');
  assertEquals(inserted[0].embedding.length, 16);
  assertEquals(inserted[0].content_hash.length, 64);
  // One generate call, then one solve per question that reached the solver (TRAIN, AGES).
  assertEquals(calls.map((c) => [c.schemaName, c.model]), [
    ['aptitude_questions', 'gen-model'],
    ['solution', 'solve-model'],
    ['solution', 'solve-model'],
  ]);
  // The solver never sees the key.
  assertEquals(calls[1].user.includes('correct_index'), false);
});
test('runBatch drops near-duplicates and existing content, and stops when the job is full', async () => {
  const calls = [];
  const generated = [TRAIN, INTEREST, WORK, AGES];
  const truth = { [TRAIN.stem]: '72 km/h', [INTEREST.stem]: '₹1,050', [WORK.stem]: '6', [AGES.stem]: '24' };
  let inserts = 0;
  const { store } = fakeStore({
    // INTEREST already exists verbatim.
    existingHashes: async (hashes) => {
      const { contentHash } = await import('../src/generation/dedup.js');
      const h = await contentHash(INTEREST.stem, INTEREST.options);
      return new Set(hashes.filter((x) => x === h));
    },
    // The bank holds something almost identical to WORK (the second stem embedded).
    nearest: (e) => Promise.resolve(e[1] === 1 ? { question_id: 'old', similarity: 0.95 } : { question_id: 'other', similarity: 0.5 }),
    insert: () => Promise.resolve(++inserts === 1 ? { outcome: 'inserted', question_id: 'q-1' } : { outcome: 'job_full' }),
  });
  // AGES embeds the same as TRAIN: a near-duplicate within the batch.
  const embed = fakeEmbed({ [AGES.stem]: TRAIN.stem });
  const result = await runBatch(job, deps(store, fakeComplete(generated, truth, calls), embed));
  assertEquals(result.stats, { inserted: 1, invalid: 0, solver: 0, computed: 0, duplicate_hash: 1, duplicate_similar: 2 });
  assertEquals(result.drops.map((d) => d.reason), ['duplicate_hash', 'duplicate_similar', 'duplicate_similar']);
});
test('runBatch counts an unverifiable solve as a solver drop and asks only for what remains', async () => {
  const calls = [];
  const { store } = fakeStore();
  const result = await runBatch({ ...job, requested: 5, inserted: 4 }, deps(store, fakeComplete([TRAIN, AGES], { [TRAIN.stem]: 'THROW' }, calls)));
  assertEquals(result.stats.solver, 1);
  assertEquals(result.stats.inserted, 0);
  assertEquals(calls[0].user.startsWith('Write 1 new medium questions.'), true);
});
test('runBatch backfills embeddings for existing questions first', async () => {
  const stored = [];
  const { store } = fakeStore({
    missingEmbeddings: () => Promise.resolve([{ question_id: 'imported', stem: 'Old stem', options: ['a', 'b'] }]),
    storeEmbeddings: (rows) => { stored.push(...rows); return Promise.resolve(); },
  });
  const result = await runBatch(job, deps(store, fakeComplete([], {}, [])));
  assertEquals(result.backfilled, 1);
  assertEquals(stored[0].question_id, 'imported');
});
