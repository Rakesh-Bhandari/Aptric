import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// vercel.json ships the security headers. The Content-Security-Policy allows the
// one inline script in index.html (the theme bootstrap) by hash, so editing that
// script without updating the hash would blank the whole site in production.
const config = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

const headerValue = (name: string) =>
  config.headers.find((h) => h.source === '/(.*)')?.headers.find((h) => h.key === name)?.value ?? '';

describe('security headers (vercel.json)', () => {
  const csp = headerValue('Content-Security-Policy');

  it('allows exactly the inline scripts index.html has, by hash', () => {
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(inline.length).toBeGreaterThan(0);
    const hashes = inline.map((script) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`);
    const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src ')) ?? '';
    for (const hash of hashes) expect(scriptSrc).toContain(hash);
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('forbids framing, plugins and foreign base URLs', () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it('sets the standard hardening headers', () => {
    expect(headerValue('Strict-Transport-Security')).toMatch(/max-age=\d{7,}/);
    expect(headerValue('X-Content-Type-Options')).toBe('nosniff');
    expect(headerValue('X-Frame-Options')).toBe('DENY');
    expect(headerValue('Referrer-Policy')).not.toBe('');
  });
});
