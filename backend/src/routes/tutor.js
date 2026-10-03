// Aptric Tutor: an AI chat that teaches around the current question.
//
//   POST /tutor/chat     { question_id, context, intent, message?, history_id? } → text/event-stream
//   GET  /tutor/history  ?question_id&context                                   → { available, messages }
//
// Every reply is grounded in private.tutor_context (verified from Postgres
// before each model call). While the player is solving, the answer key stays
// in the API: the prompt forbids the final answer and the leak guard
// (../tutor/guard.js) strips sentences that state it anyway. Hints are
// charged through the existing use_hint RPC; the full explanation needs the
// existing give_up RPC first. See backend/README.md.

import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { asUser, query } from '../db.js';
import { badRequest, HttpError } from '../http.js';
import { requireUser } from '../middleware/auth.js';
import { hit } from '../middleware/rateLimit.js';
import { createLeakGuard } from '../tutor/guard.js';
import { chatClient, completeWithFallback, LlmError, openStream, tutorAvailable, tutorModels } from '../tutor/llm.js';
import {
  asksForAnswer, buildMessages, CHARGED_INTENTS, classifierMessages, INTENT_LABEL, INTENTS, isOffTopicLabel,
  precheck, REPLY,
} from '../tutor/prompt.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(UUID, 'must be a uuid');
const CONTEXTS = ['daily', 'practice', 'assessment'];

const chatBody = z.strictObject({
  question_id: uuid,
  context: z.enum(CONTEXTS).nullable().optional(),
  intent: z.enum(INTENTS),
  message: z.string().max(500).nullable().optional(),
  history_id: uuid.nullable().optional(),
}).refine((b) => b.intent !== 'free' || b.message?.trim() || b.history_id, {
  message: 'message is required for a free question', path: ['message'],
});

const historyQuery = z.strictObject({
  question_id: uuid,
  context: z.enum(['daily', 'practice']),
});

const parse = (schema, value) => {
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw badRequest(`${issue.path.join('.') || 'body'}: ${issue.message}`);
  }
  return result.data;
};

const HISTORY_TURNS = 8;
const STREAM_TIMEOUT_MS = 60_000;
const FIRST_TOKEN_MS = 20_000;
const CLASSIFY_TIMEOUT_MS = 8_000;

export const unavailable = () =>
  new HttpError(503, 'tutor_unavailable', 'The tutor is not available right now.');

/**
 * The router, with its collaborators injectable for tests:
 * db { query, asUser }, hitLimit (rateLimit.hit), llm { stream, complete }, settings (config.tutor), log.
 */
export function createTutorRouter({
  db = { query, asUser },
  hitLimit = hit,
  llm = null,
  settings = config.tutor,
  log = console,
} = {}) {
  const router = Router();
  let client = llm;
  const getClient = () =>
    (client ??= chatClient({ baseUrl: settings.baseUrl, apiKey: settings.apiKey, referer: settings.siteUrl }));
  const models = () => tutorModels(settings);
  const available = () => tutorAvailable(settings) && models().length > 0;
  const onFallback = (model, err) => log.warn?.(`[tutor] ${model} failed (${err.message}); trying the next model`);

  const loadContext = async (uid, questionId, context) => {
    const { rows } = await db.query(
      'select private.tutor_context($1::uuid, $2::uuid, $3::public.attempt_context) as ctx',
      [uid, questionId, context ?? null],
    );
    return rows[0].ctx;
  };

  const loadHistory = async (uid, questionId, context, max) => {
    const { rows } = await db.query(
      'select private.tutor_history($1::uuid, $2::uuid, $3::public.attempt_context, $4::integer) as messages',
      [uid, questionId, context, max],
    );
    return rows[0].messages ?? [];
  };

  const append = async (uid, ctx, role, intent, content, model = null) => {
    const { rows } = await db.query(
      'select private.tutor_append_message($1::uuid, $2::uuid, $3::public.attempt_context, $4, $5, $6, $7) as id',
      [uid, ctx.question_id, ctx.context, role, intent, content.slice(0, 4000), model],
    );
    return rows[0].id;
  };

  // Cheap filter first, then a one-word classification by the same model.
  const isOffTopic = async (text, ctx, signal) => {
    const verdict = precheck(text);
    if (verdict !== 'unsure') return verdict;
    try {
      const { text: label } = await completeWithFallback(getClient(), models(), {
        messages: classifierMessages(text, ctx), temperature: 0, maxTokens: 5, timeoutMs: CLASSIFY_TIMEOUT_MS, signal,
      }, { onFallback });
      return isOffTopicLabel(label) ? 'off_topic' : 'on_topic';
    } catch (err) {
      // The main prompt refuses off-topic requests too.
      log.warn?.(`[tutor] classifier failed: ${err.message}`);
      return 'on_topic';
    }
  };

  router.post('/chat', requireUser, async (req, res) => {
    const body = parse(chatBody, req.body);
    if (!available()) throw unavailable();
    const uid = req.user.id;

    await hitLimit('tutor:burst', uid, 2, 1);
    await hitLimit('tutor:hour', uid, 3600, settings.messagesPerHour);
    await hitLimit('tutor:day', uid, 86400, settings.messagesPerDay);

    const ctx = await loadContext(uid, body.question_id, body.context);
    if (ctx.phase === 'locked') {
      throw new HttpError(403, 'tutor_locked', 'The tutor is off during contests and placement tests.');
    }

    let history = await loadHistory(uid, ctx.question_id, ctx.context, HISTORY_TURNS + 1);
    let { intent } = body;
    let message = body.message?.trim() || null;
    let userTurnId = null;
    if (body.history_id) {
      // Retry of a turn that is already stored: reuse it, don't store it twice.
      const index = history.findIndex((m) => m.id === body.history_id);
      const turn = history[index];
      if (!turn || turn.role !== 'user') throw badRequest('history_id is not a question in this chat');
      userTurnId = turn.id;
      intent = turn.intent ?? intent;
      message = intent === 'free' ? turn.content : null;
      history = history.slice(0, index);
    }
    history = history.slice(-HISTORY_TURNS);

    const solving = ctx.phase === 'solving';
    // (An unverified question gets the fixed reply below whatever was asked.)
    if (ctx.verified && solving && (intent === 'explain' || (intent === 'free' && asksForAnswer(message)))) {
      throw new HttpError(409, 'tutor_requires_give_up',
        'Give up on this question to see the full answer and explanation.');
    }

    // From here on the reply is a stream.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    const send = (event, data) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let hintUsed = Boolean(ctx.hint_used);
    let hintCharged = false;

    try {
      userTurnId ??= await append(uid, ctx, 'user', intent, message ?? INTENT_LABEL[intent]);

      const fixed = async (text) => {
        send('meta', { phase: ctx.phase, context: ctx.context, intent, hint_used: hintUsed, hint_charged: false, user_message_id: userTurnId });
        send('delta', { text });
        const id = await append(uid, ctx, 'assistant', intent, text);
        send('done', { message_id: id, model: null, phase: ctx.phase, hint_used: hintUsed, blocked: 0 });
      };

      // Unverified questions are never tutored.
      if (!ctx.verified) return await fixed(REPLY.unverified);

      if (intent === 'free') {
        const verdict = await isOffTopic(message, ctx, abort.signal);
        if (verdict === 'injection') return await fixed(REPLY.injection);
        if (verdict === 'off_topic') return await fixed(REPLY.offTopic);
      }

      // Solving help costs the hint penalty, exactly once, through use_hint.
      if (solving && CHARGED_INTENTS.has(intent) && !hintUsed) {
        const { rows } = await db.asUser(uid,
          'select public.use_hint(question_id => $1::uuid, context => $2::public.attempt_context) as result',
          [ctx.question_id, ctx.context]);
        hintCharged = Boolean(rows[0]?.result?.charged);
        hintUsed = hintCharged;
        ctx.hint_used = hintUsed;
      }

      send('meta', {
        phase: ctx.phase, context: ctx.context, intent, hint_used: hintUsed, hint_charged: hintCharged, user_message_id: userTurnId,
      });

      const guard = createLeakGuard(ctx, {
        onBlock: (sentence) => log.warn?.(
          `[tutor] leak guard blocked a sentence (user ${uid}, question ${ctx.question_id}): ${sentence.trim().slice(0, 200)}`),
      });
      let text = '';
      let model = null;
      const emit = (piece) => {
        if (!piece) return;
        text += piece;
        send('delta', { text: piece });
      };

      try {
        const opened = await openStream(getClient(), models(), {
          messages: buildMessages({ ctx, intent, message, history }),
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          timeoutMs: STREAM_TIMEOUT_MS,
          firstTokenMs: FIRST_TOKEN_MS,
          signal: abort.signal,
        }, { onFallback });
        model = opened.model;
        for await (const delta of opened.chunks) emit(guard ? guard.push(delta) : delta);
        emit(guard?.end());
      } catch (err) {
        if (abort.signal.aborted) {
          // The player closed the chat: keep what they saw.
          if (text.trim()) await append(uid, ctx, 'assistant', intent, text, model);
          return;
        }
        throw err;
      }

      const id = text.trim() ? await append(uid, ctx, 'assistant', intent, text, model) : null;
      send('done', { message_id: id, model, phase: ctx.phase, hint_used: hintUsed, blocked: guard?.blocked ?? 0 });
    } catch (err) {
      if (err instanceof LlmError) {
        log.error?.(`[tutor] every model failed: ${err.message}`);
        send('error', { error: { code: 'tutor_unavailable', message: 'The tutor is busy right now. Please try again in a minute.', hint_used: hintUsed, user_message_id: userTurnId } });
      } else {
        log.error?.('[tutor]', err);
        const code = err?.code && /^[0-9A-Z]{5}$/.test(err.code) ? err.code : 'internal';
        send('error', { error: { code, message: config.isProd ? 'Server error.' : String(err?.message ?? err), user_message_id: userTurnId } });
      }
    } finally {
      res.end();
    }
  });

  router.get('/history', requireUser, async (req, res) => {
    const q = parse(historyQuery, req.query);
    const messages = await loadHistory(req.user.id, q.question_id, q.context, 50);
    res.json({ available: available(), messages });
  });

  return router;
}

export default createTutorRouter();
