// content_hash and embedding helpers. contentHash must stay identical to
// private.content_hash() in the database (see supabase/README.md).

// Lower-case, every run of characters other than [a-z0-9] becomes one space, trimmed.
export function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// sha256 hex of the normalised stem, a newline, then the normalised options
// sorted and newline-joined (so reordered options still collide).
export async function contentHash(stem: string, options: string[]): Promise<string> {
  const text = [normalise(stem), ...options.map(normalise).sort()].join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// What gets embedded for similarity: the stem plus the options, so the same
// question with different numbers is not automatically a near-duplicate.
export function embeddingText(stem: string, options: string[]): string {
  return `${stem}\n${options.join('\n')}`;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

// pgvector text format.
export function toVector(v: number[]): string {
  return `[${v.join(',')}]`;
}
