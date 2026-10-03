// Aptric Tutor client (backend/src/routes/tutor.js). Replies stream as
// server-sent events over a POST, so this reads the response body itself;
// auth and token refresh are the same as every other API call (http.ts).

import { ApiError, api, authorizedFetch, parseResponse, qs } from './http';

export type TutorIntent = 'hint' | 'steps' | 'next_step' | 'understand' | 'concept' | 'explain' | 'training' | 'free';
export type TutorContext = 'daily' | 'practice';
export type TutorPhase = 'solving' | 'answered';

export interface TutorMessage {
  id: string;
  role: 'user' | 'assistant';
  intent: TutorIntent | null;
  content: string;
  created_at?: string;
}

/** Sent before the reply: whether this turn used (and charged) the hint. */
export interface TutorMeta {
  phase: TutorPhase;
  context: TutorContext;
  intent: TutorIntent;
  hint_used: boolean;
  hint_charged: boolean;
  user_message_id: string | null;
}

export interface TutorDone {
  message_id: string | null;
  model: string | null;
  phase: TutorPhase;
  hint_used: boolean;
  /** Sentences the leak guard replaced. */
  blocked: number;
}

export interface TutorRequest {
  questionId: string;
  context: TutorContext;
  intent: TutorIntent;
  message?: string | null;
  /** Retry a stored question instead of sending a new one. */
  historyId?: string | null;
}

export interface TutorHandlers {
  onMeta?: (meta: TutorMeta) => void;
  onDelta?: (text: string) => void;
}

/** Splits an SSE stream into { event, data } records. */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let event = 'message';
        const data: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
        }
        if (data.length) yield { event, data: data.join('\n') };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Sends one tutor turn and streams the reply. Resolves with the `done` event;
 * rejects with an ApiError for refusals before the stream (409
 * tutor_requires_give_up, 403 tutor_locked, 503 tutor_unavailable, 429, ...)
 * and for `error` events mid-stream (details.user_message_id allows a retry).
 */
export async function streamTutor(req: TutorRequest, handlers: TutorHandlers = {}, signal?: AbortSignal): Promise<TutorDone> {
  const res = await authorizedFetch('POST', '/tutor/chat', {
    question_id: req.questionId,
    context: req.context,
    intent: req.intent,
    ...(req.message ? { message: req.message } : {}),
    ...(req.historyId ? { history_id: req.historyId } : {}),
  }, signal);
  if (!res.ok || !res.headers.get('content-type')?.startsWith('text/event-stream') || !res.body) {
    await parseResponse(res);
    throw new ApiError(res.status, 'tutor_bad_response', 'Unexpected response from the tutor.');
  }

  for await (const { event, data } of readEvents(res.body)) {
    const payload = JSON.parse(data);
    if (event === 'meta') handlers.onMeta?.(payload as TutorMeta);
    else if (event === 'delta') handlers.onDelta?.((payload as { text: string }).text);
    else if (event === 'done') return payload as TutorDone;
    else if (event === 'error') {
      const { code, message, ...details } = (payload as { error: { code: string; message: string } & Record<string, unknown> }).error;
      throw new ApiError(503, code, message, details);
    }
  }
  throw new ApiError(0, 'network', 'The tutor stopped before finishing.');
}

/** The stored conversation for one question, and whether the tutor is configured. */
export const getTutorHistory = (questionId: string, context: TutorContext) =>
  api<{ available: boolean; messages: TutorMessage[] }>('GET', `/tutor/history${qs({ question_id: questionId, context })}`);
