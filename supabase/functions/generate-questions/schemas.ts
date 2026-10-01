import { z } from 'zod';
import { normalise } from './dedup.ts';

// Model output is validated with these schemas; anything that fails is
// dropped, never repaired. The same schemas (minus the constraints providers
// reject in strict mode) are sent as the structured-output JSON schema.

export const OPTION_COUNT = 4;

export const generatedQuestionSchema = z
  .object({
    stem: z.string().trim().min(15).max(4000),
    options: z.array(z.string().trim().min(1).max(500)).length(OPTION_COUNT),
    correct_index: z.number().int().min(0).max(OPTION_COUNT - 1),
    explanation: z.string().trim().min(20).max(6000),
    hint: z.string().trim().max(1000).nullable(),
    est_seconds: z.number().int().min(10).max(900),
    // Arithmetic expression whose value is the keyed option (numeric questions).
    computation: z.string().trim().max(500).nullable(),
  })
  .refine((q) => new Set(q.options.map(normalise)).size === q.options.length, {
    message: 'options must be distinct',
    path: ['options'],
  });

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

// The envelope is checked loosely so one bad item doesn't sink the batch;
// items are validated one by one with generatedQuestionSchema.
export const generationEnvelopeSchema = z.object({ questions: z.array(z.unknown()) });

const generationWireSchema = z.object({ questions: z.array(generatedQuestionSchema) });

export const solveSchema = z.object({
  working: z.string().max(8000),
  answer_index: z.number().int().min(0).max(OPTION_COUNT - 1),
  computation: z.string().trim().max(500).nullable(),
});

export type Solve = z.infer<typeof solveSchema>;

// Request bodies -------------------------------------------------------------

export const MAX_JOB_COUNT = 50;

export const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    subtopic_id: z.uuid(),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    count: z.number().int().min(1).max(MAX_JOB_COUNT),
  }),
  z.object({ action: z.literal('run'), job_id: z.uuid() }),
  z.object({ action: z.literal('status'), job_id: z.uuid() }),
  z.object({ action: z.literal('cancel'), job_id: z.uuid() }),
]);

export type GenerateRequest = z.infer<typeof requestSchema>;

// JSON schema for structured output ------------------------------------------

// Strict structured output wants every property required, no extra
// properties, and none of the length/range keywords several providers reject.
const DROPPED_KEYWORDS = new Set([
  '$schema', 'minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum',
  'exclusiveMinimum', 'exclusiveMaximum', 'pattern', 'format',
]);

function toStrict(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStrict);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (!DROPPED_KEYWORDS.has(k)) out[k] = toStrict(v);
  }
  if (out.type === 'object' && out.properties) {
    out.required = Object.keys(out.properties as object);
    out.additionalProperties = false;
  }
  return out;
}

export function wireSchema(schema: z.ZodType): Record<string, unknown> {
  return toStrict(z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' })) as Record<string, unknown>;
}

export const GENERATION_JSON_SCHEMA = wireSchema(generationWireSchema);
export const SOLVE_JSON_SCHEMA = wireSchema(solveSchema);
