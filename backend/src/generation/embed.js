// Embeddings from any OpenAI-compatible /embeddings API (OpenRouter, OpenAI,
// ...). The database stores vector(384), so the model must accept
// `dimensions: 384` (OpenAI text-embedding-3-*) or natively return 384.

export const EMBEDDING_DIMENSIONS = 384;

export function apiEmbedder({ baseUrl, apiKey, model, referer, timeoutMs = 30_000 }) {
  return async (text) => {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(referer ? { 'HTTP-Referer': referer } : {}),
        'X-Title': 'Aptric',
      },
      body: JSON.stringify({ model, input: text, dimensions: EMBEDDING_DIMENSIONS }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`embedding ${model} returned ${res.status}: ${body.slice(0, 300)}`);
    let vector;
    try {
      vector = JSON.parse(body)?.data?.[0]?.embedding;
    } catch {
      throw new Error(`embedding ${model} returned a non-JSON response`);
    }
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`embedding ${model} returned ${Array.isArray(vector) ? vector.length : 'no'} dimensions, need ${EMBEDDING_DIMENSIONS}`);
    }
    // Unit length, so cosine similarity is comparable across providers.
    const norm = Math.hypot(...vector) || 1;
    return vector.map((x) => x / norm);
  };
}
