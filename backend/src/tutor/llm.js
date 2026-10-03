// Plain chat completions (no response_format) against an OpenAI-compatible
// API, streamed. Same request shape as ../generation/llm.js; used by the
// tutor with free models (OpenRouter `:free`, Groq, a local Ollama).

export class LlmError extends Error {
  constructor(message, status = null, { timeout = false } = {}) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
    this.timeout = timeout;
  }

  /** Worth trying the next model: rate limited, server error, timeout, network, retired model. */
  get retryable() {
    return this.timeout || this.status === null || this.status === 404 || this.status === 408
      || this.status === 429 || this.status >= 500;
  }
}

const isLocal = (url) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)(:\d+)?(\/|$)/i.test(url ?? '');
const isOpenRouter = (url) => /(^|\/\/|\.)openrouter\.ai(\/|:|$)/i.test(url ?? '');

/** Whether the tutor can run: a key, or a local server (Ollama) that needs none. */
export const tutorAvailable = (settings) => Boolean(settings?.baseUrl && (settings.apiKey || isLocal(settings.baseUrl)));

/**
 * Models to try, in order. On OpenRouter only free (`:free`) models are used
 * unless allowPaidModels is set; other providers (Groq's free tier, Ollama)
 * are taken as configured.
 */
export function tutorModels(settings) {
  const all = [...new Set([settings.model, ...(settings.fallbackModels ?? [])].filter(Boolean))];
  if (settings.allowPaidModels || !isOpenRouter(settings.baseUrl)) return all;
  return all.filter((m) => m.endsWith(':free'));
}

/** Text deltas from an OpenAI-style SSE body (`data: {...}` lines, `data: [DONE]`). */
async function* sseDeltas(body, model) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue; // comments (": OPENROUTER PROCESSING"), event names
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json?.error) {
        const status = Number(json.error.code) || null;
        throw new LlmError(`${model}: ${json.error.message ?? 'stream error'}`, status);
      }
      const delta = json?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta) yield delta;
    }
  }
}

/**
 * { stream(req), complete(req) } for one OpenAI-compatible endpoint.
 * req: { model, messages, temperature, maxTokens, timeoutMs, firstTokenMs?, signal? }
 */
export function chatClient({ baseUrl, apiKey, referer, fetchImpl = (...args) => fetch(...args) }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const post = async (req, stream, c) => {
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        signal: c.controller.signal,
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          'Content-Type': 'application/json',
          ...(referer ? { 'HTTP-Referer': referer } : {}),
          'X-Title': 'Aptric Tutor',
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          temperature: req.temperature,
          max_tokens: req.maxTokens,
          stream,
        }),
      });
    } catch (err) {
      throw abortError(err, req, c);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LlmError(`${req.model} returned ${res.status}: ${text.slice(0, 300)}`, res.status);
    }
    return res;
  };

  // Aborts on the caller's signal, on the overall timeout, and when no token
  // has arrived within firstTokenMs.
  const controllerFor = (req) => {
    const controller = new AbortController();
    let reason = null;
    const stop = (why) => {
      if (controller.signal.aborted) return;
      reason = why;
      controller.abort();
    };
    const total = setTimeout(() => stop('timeout'), req.timeoutMs ?? 60_000);
    const first = setTimeout(() => stop('timeout'), req.firstTokenMs ?? req.timeoutMs ?? 60_000);
    const onAbort = () => stop('aborted');
    req.signal?.addEventListener('abort', onAbort, { once: true });
    if (req.signal?.aborted) stop('aborted');
    return {
      controller,
      reason: () => reason,
      gotFirst: () => clearTimeout(first),
      done: () => {
        clearTimeout(total);
        clearTimeout(first);
        req.signal?.removeEventListener('abort', onAbort);
      },
    };
  };

  const abortError = (err, req, c) => {
    if (err instanceof LlmError) return err;
    if (c.controller.signal.aborted && c.reason() === 'timeout') {
      return new LlmError(`${req.model} timed out`, null, { timeout: true });
    }
    if (c.controller.signal.aborted) return Object.assign(new LlmError(`${req.model}: aborted`), { aborted: true });
    return new LlmError(`${req.model}: ${err?.message ?? err}`);
  };

  async function* stream(req) {
    const c = controllerFor(req);
    try {
      const res = await post(req, true, c);
      let any = false;
      try {
        for await (const delta of sseDeltas(res.body, req.model)) {
          if (!any) c.gotFirst();
          any = true;
          yield delta;
        }
      } catch (err) {
        throw abortError(err, req, c);
      }
      if (!any) throw new LlmError(`${req.model} returned no content`, 502);
    } finally {
      c.done();
    }
  }

  async function complete(req) {
    const c = controllerFor(req);
    try {
      const res = await post(req, false, c);
      let json;
      try {
        json = await res.json();
      } catch (err) {
        throw abortError(err, req, c);
      }
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new LlmError(`${req.model} returned no content`, 502);
      return content;
    } finally {
      c.done();
    }
  }

  return { stream, complete };
}

/**
 * Opens a stream on the first model that answers. A model that fails before
 * its first token with a retryable error (429, 5xx, timeout, ...) hands over
 * to the next; once text has flowed, errors propagate. Returns the model used
 * and an async iterator of text deltas.
 */
export async function openStream(client, models, req, { onFallback } = {}) {
  let lastError = new LlmError('no tutor model configured', 503);
  for (const [i, model] of models.entries()) {
    const it = client.stream({ ...req, model })[Symbol.asyncIterator]();
    try {
      const first = await it.next();
      if (first.done) throw new LlmError(`${model} returned no content`, 502);
      async function* chunks() {
        yield first.value;
        for (;;) {
          const next = await it.next();
          if (next.done) return;
          yield next.value;
        }
      }
      return { model, chunks: chunks() };
    } catch (err) {
      lastError = err instanceof LlmError ? err : new LlmError(String(err?.message ?? err));
      if (err?.aborted || !lastError.retryable || i === models.length - 1) throw lastError;
      onFallback?.(model, lastError);
    }
  }
  throw lastError;
}

/** One non-streamed completion with the same fallback rules. */
export async function completeWithFallback(client, models, req, { onFallback } = {}) {
  let lastError = new LlmError('no tutor model configured', 503);
  for (const [i, model] of models.entries()) {
    try {
      return { model, text: await client.complete({ ...req, model }) };
    } catch (err) {
      lastError = err instanceof LlmError ? err : new LlmError(String(err?.message ?? err));
      if (err?.aborted || !lastError.retryable || i === models.length - 1) throw lastError;
      onFallback?.(model, lastError);
    }
  }
  throw lastError;
}
