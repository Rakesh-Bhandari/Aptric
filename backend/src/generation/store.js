// Store for the generation pipeline (through public.backend_sql). All
// writes go through the gen_* SECURITY DEFINER functions (migration
// 20261001000012), as the database owner.

import { query } from '../db.js';
import { toVector } from './dedup.js';

export function pgStore({ similarityThreshold, embeddingModel }) {
  return {
    async context(subtopicId) {
      const { rows } = await query(
        `select st.name as subtopic, st.description, t.name as topic, s.slug as section_slug, s.name as section
         from public.subtopics st
         join public.topics t on t.id = st.topic_id
         join public.sections s on s.id = t.section_id
         where st.id = $1`,
        [subtopicId],
      );
      if (!rows[0]) throw new Error(`load subtopic: ${subtopicId} not found`);
      return rows[0];
    },

    async recentStems(subtopicId, limit) {
      const { rows } = await query(
        `select stem from public.questions
         where subtopic_id = $1 and status <> 'retired'
         order by created_at desc limit $2`,
        [subtopicId, limit],
      );
      return rows.map((r) => r.stem);
    },

    async missingEmbeddings(subtopicId, limit) {
      const { rows } = await query('select * from public.gen_questions_missing_embeddings($1, $2)', [subtopicId, limit]);
      return rows;
    },

    async storeEmbeddings(rows) {
      await query('select public.gen_store_embeddings($1::jsonb, $2)', [
        JSON.stringify(rows.map((r) => ({ question_id: r.question_id, embedding: toVector(r.embedding) }))),
        embeddingModel,
      ]);
    },

    async existingHashes(hashes) {
      const { rows } = await query('select content_hash from public.questions where content_hash = any($1::text[])', [hashes]);
      return new Set(rows.map((r) => r.content_hash));
    },

    async nearest(embedding) {
      const { rows } = await query('select * from public.gen_nearest_question($1::extensions.vector)', [toVector(embedding)]);
      return rows[0] ?? null;
    },

    async insert(jobId, q) {
      const { rows } = await query(
        `select public.gen_insert_question($1, $2, $3::text[], $4, $5, $6, $7, $8, $9::extensions.vector, $10, $11) as outcome`,
        [jobId, q.stem, q.options, q.correct_index, q.explanation, q.hint, q.est_seconds, q.content_hash,
          toVector(q.embedding), embeddingModel, similarityThreshold],
      );
      return rows[0].outcome;
    },
  };
}

/**
 * Embeddings from another model aren't comparable, so drop any made with a
 * different one (e.g. the Edge Function's gte-small); they are re-embedded as
 * jobs run in their subtopics.
 */
export async function dropForeignEmbeddings(embeddingModel) {
  await query('delete from private.question_embeddings where model <> $1', [embeddingModel]);
}
