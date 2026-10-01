// One batch of a generation job:
//   generate (structured output) → zod validation → content_hash dedup →
//   embedding dedup → computed check (numeric quant) → independent solve →
//   insert as in_review (dedup re-checked in the database under a lock).
// Everything that fails a step is dropped and counted, never repaired.
import { contentHash, cosine, embeddingText } from './dedup.js';
import { numericCheck } from './numeric.js';
import { GENERATION_JSON_SCHEMA, generatedQuestionSchema, generationEnvelopeSchema, SOLVE_JSON_SCHEMA, solveSchema, } from './schemas.js';
import { GENERATOR_SYSTEM, generationPrompt, SOLVER_SYSTEM, solvePrompt } from './prompts.js';
// Sections whose numeric-answer questions get the computed check.
export const NUMERIC_SECTIONS = new Set(['quantitative-aptitude']);
const preview = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').slice(0, 120) : '');
// Fisher-Yates; returns perm where shown position i holds original option perm[i].
function permutation(n, random) {
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}
export async function runBatch(job, deps) {
  const { store, config } = deps;
  const random = deps.random ?? Math.random;
  const result = {
    stats: { inserted: 0, invalid: 0, solver: 0, computed: 0, duplicate_hash: 0, duplicate_similar: 0 },
    inserted_ids: [],
    drops: [],
    backfilled: 0,
  };
  const drop = (reason, stem, detail) => {
    result.stats[reason]++;
    result.drops.push({ reason, stem: preview(stem), detail });
  };
  const remaining = job.requested - job.inserted;
  if (remaining <= 0)
    return result;
  const count = Math.min(config.batchSize, remaining);
  const sub = await store.context(job.subtopic_id);
  const ctx = {
    section: sub.section,
    topic: sub.topic,
    subtopic: sub.subtopic,
    subtopicDescription: sub.description,
    difficulty: job.difficulty,
    numeric: NUMERIC_SECTIONS.has(sub.section_slug),
  };
  // 0. Embed existing questions in this subtopic that have no embedding yet, so
  //    the similarity check also covers imported and hand-written questions.
  const missing = await store.missingEmbeddings(job.subtopic_id, config.backfillLimit);
  if (missing.length) {
    const rows = [];
    for (const m of missing)
      rows.push({ question_id: m.question_id, embedding: await deps.embed(embeddingText(m.stem, m.options)) });
    await store.storeEmbeddings(rows);
    result.backfilled = rows.length;
  }
  // 1. Generate.
  const avoid = (await store.recentStems(job.subtopic_id, 15)).map(preview);
  const raw = await deps.complete({
    model: job.model,
    system: GENERATOR_SYSTEM,
    user: generationPrompt(ctx, count, avoid),
    schemaName: 'aptitude_questions',
    schema: GENERATION_JSON_SCHEMA,
    temperature: 0.8,
    maxTokens: Math.min(16000, 1200 * count + 500),
    timeoutMs: config.generateTimeoutMs,
  });
  const envelope = generationEnvelopeSchema.safeParse(raw);
  if (!envelope.success)
    throw new Error('generator output has no "questions" array');
  // 2. Validate. Extras beyond the requested count are ignored.
  const valid = [];
  for (const item of envelope.data.questions.slice(0, count)) {
    const parsed = generatedQuestionSchema.safeParse(item);
    if (parsed.success)
      valid.push(parsed.data);
    else
      drop('invalid', item?.stem, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 300));
  }
  // 3. Exact duplicates: within the batch, then against the bank.
  const hashed = [];
  const batchHashes = new Set();
  for (const q of valid) {
    const hash = await contentHash(q.stem, q.options);
    if (batchHashes.has(hash)) {
      drop('duplicate_hash', q.stem, 'same content as another question in this batch');
      continue;
    }
    batchHashes.add(hash);
    hashed.push({ ...q, content_hash: hash, embedding: [] });
  }
  const existing = hashed.length ? await store.existingHashes(hashed.map((c) => c.content_hash)) : new Set();
  const unique = hashed.filter((c) => {
    if (!existing.has(c.content_hash))
      return true;
    drop('duplicate_hash', c.stem, 'same content as an existing question');
    return false;
  });
  // 4. Near duplicates (cosine similarity > threshold): within the batch, then against the bank.
  const distinct = [];
  for (const c of unique) {
    c.embedding = await deps.embed(embeddingText(c.stem, c.options));
    const twin = distinct.find((d) => cosine(d.embedding, c.embedding) > config.similarityThreshold);
    if (twin) {
      drop('duplicate_similar', c.stem, `similar to "${preview(twin.stem)}" in this batch`);
      continue;
    }
    const nearest = await store.nearest(c.embedding);
    if (nearest && nearest.similarity > config.similarityThreshold) {
      drop('duplicate_similar', c.stem, `similarity ${nearest.similarity.toFixed(3)} to question ${nearest.question_id}`);
      continue;
    }
    distinct.push(c);
  }
  // 5. Computed check of the generator's own answer (numeric quant questions).
  const checked = distinct.filter((c) => {
    if (!ctx.numeric)
      return true;
    const check = numericCheck(c, c.computation);
    if (!check.applicable || check.ok)
      return true;
    drop('computed', c.stem, check.reason);
    return false;
  });
  // 6. Independent solve: a separate call (by default a different model) that
  //    never sees the key, with the options shuffled to defeat position bias.
  const verdicts = await Promise.all(checked.map(async (c) => {
    const perm = permutation(c.options.length, random);
    const shown = perm.map((i) => c.options[i]);
    let solved;
    try {
      const out = await deps.complete({
        model: job.solver_model,
        system: SOLVER_SYSTEM,
        user: solvePrompt(c.stem, shown, ctx.numeric),
        schemaName: 'solution',
        schema: SOLVE_JSON_SCHEMA,
        temperature: 0,
        maxTokens: 4000,
        timeoutMs: config.solveTimeoutMs,
      });
      solved = solveSchema.parse(out);
    }
    catch (err) {
      return `solver: unverifiable (${err.message.slice(0, 200)})`;
    }
    if (perm[solved.answer_index] !== c.correct_index) {
      return `solver: chose "${shown[solved.answer_index]}", key is "${c.options[c.correct_index]}"`;
    }
    if (ctx.numeric && solved.computation) {
      const check = numericCheck({ stem: c.stem, options: shown, correct_index: solved.answer_index }, solved.computation);
      if (check.applicable && !check.ok)
        return `computed: solver's ${check.reason}`;
    }
    return null;
  }));
  const verified = checked.filter((c, i) => {
    const v = verdicts[i];
    if (v === null)
      return true;
    drop(v.startsWith('computed:') ? 'computed' : 'solver', c.stem, v.replace(/^(solver|computed): /, ''));
    return false;
  });
  // 7. Insert. Options are stored in a fresh random order so the key's
  //    position carries no pattern from the generator.
  for (const c of verified) {
    const perm = permutation(c.options.length, random);
    const stored = { ...c, options: perm.map((i) => c.options[i]), correct_index: perm.indexOf(c.correct_index) };
    const res = await store.insert(job.id, stored);
    if (res.outcome === 'inserted') {
      result.stats.inserted++;
      result.inserted_ids.push(res.question_id);
    }
    else if (res.outcome === 'duplicate_hash' || res.outcome === 'duplicate_similar') {
      drop(res.outcome, c.stem, `found at insert${res.similar_to ? ` (question ${res.similar_to})` : ''}`);
    }
    else {
      break; // job_full / job_closed: another batch filled it, or it was cancelled
    }
  }
  return result;
}
