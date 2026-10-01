// Store implementation over the service_role Supabase client. All writes go
// through the gen_* SECURITY DEFINER functions (migration 20261001000012).

import type { SupabaseClient } from '@supabase/supabase-js';
import { toVector } from './dedup.ts';
import type { Candidate, InsertOutcome, Store, SubtopicContext } from './pipeline.ts';

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export function supabaseStore(db: SupabaseClient, opts: { similarityThreshold: number; embeddingModel: string }): Store {
  return {
    async context(subtopicId) {
      const row = check(
        await db.from('subtopics')
          .select('name, description, topics!inner(name, sections!inner(slug, name))')
          .eq('id', subtopicId)
          .single(),
        'load subtopic',
      ) as unknown as {
        name: string;
        description: string | null;
        topics: { name: string; sections: { slug: string; name: string } };
      };
      return {
        section_slug: row.topics.sections.slug,
        section: row.topics.sections.name,
        topic: row.topics.name,
        subtopic: row.name,
        description: row.description,
      } satisfies SubtopicContext;
    },

    async recentStems(subtopicId, limit) {
      const rows = check(
        await db.from('questions').select('stem')
          .eq('subtopic_id', subtopicId).neq('status', 'retired')
          .order('created_at', { ascending: false }).limit(limit),
        'load recent stems',
      );
      return (rows ?? []).map((r: { stem: string }) => r.stem);
    },

    async missingEmbeddings(subtopicId, limit) {
      return check(
        await db.rpc('gen_questions_missing_embeddings', { p_subtopic_id: subtopicId, p_limit: limit }),
        'load questions without embeddings',
      ) ?? [];
    },

    async storeEmbeddings(rows) {
      check(
        await db.rpc('gen_store_embeddings', {
          p_rows: rows.map((r) => ({ question_id: r.question_id, embedding: toVector(r.embedding) })),
          p_model: opts.embeddingModel,
        }),
        'store embeddings',
      );
    },

    async existingHashes(hashes) {
      const rows = check(
        await db.from('questions').select('content_hash').in('content_hash', hashes),
        'check content hashes',
      );
      return new Set((rows ?? []).map((r: { content_hash: string }) => r.content_hash));
    },

    async nearest(embedding) {
      const rows = check(
        await db.rpc('gen_nearest_question', { p_embedding: toVector(embedding) }),
        'nearest question',
      ) as { question_id: string; similarity: number }[] | null;
      return rows?.[0] ?? null;
    },

    async insert(jobId, q: Candidate) {
      return check(
        await db.rpc('gen_insert_question', {
          p_job_id: jobId,
          p_stem: q.stem,
          p_options: q.options,
          p_correct_index: q.correct_index,
          p_explanation: q.explanation,
          p_hint: q.hint,
          p_est_seconds: q.est_seconds,
          p_content_hash: q.content_hash,
          p_embedding: toVector(q.embedding),
          p_embedding_model: opts.embeddingModel,
          p_similarity_threshold: opts.similarityThreshold,
        }),
        'insert question',
      ) as InsertOutcome;
    },
  };
}
