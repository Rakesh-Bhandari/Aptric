// Chat completions with structured (JSON schema) output against an
// OpenAI-compatible API. Defaults to OpenRouter.
export class LlmError extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export function openAiCompatible(config) {
  return async (req) => {
    let res;
    try {
      res = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(req.timeoutMs),
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          ...(config.referer ? { 'HTTP-Referer': config.referer } : {}),
          'X-Title': 'Aptric',
        },
        body: JSON.stringify({
          model: req.model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          temperature: req.temperature,
          max_tokens: req.maxTokens,
          response_format: {
            type: 'json_schema',
            json_schema: { name: req.schemaName, strict: true, schema: req.schema },
          },
          // OpenRouter: only route to providers that honour response_format.
          provider: { require_parameters: true },
        }),
      });
    }
    catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
      throw new LlmError(timedOut ? `${req.model} timed out after ${req.timeoutMs} ms` : `${req.model}: ${err.message}`);
    }
    const text = await res.text();
    if (!res.ok)
      throw new LlmError(`${req.model} returned ${res.status}: ${text.slice(0, 300)}`, res.status);
    let content;
    try {
      content = JSON.parse(text)?.choices?.[0]?.message?.content;
    }
    catch {
      throw new LlmError(`${req.model} returned a non-JSON response`);
    }
    if (typeof content !== 'string' || !content.trim())
      throw new LlmError(`${req.model} returned no content`);
    try {
      return JSON.parse(content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
    }
    catch {
      throw new LlmError(`${req.model} returned content that is not JSON`);
    }
  };
}
