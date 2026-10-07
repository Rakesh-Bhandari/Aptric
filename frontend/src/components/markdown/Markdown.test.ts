import { describe, expect, it } from 'vitest';
import { renderPostMarkdown } from './Markdown';

describe('renderPostMarkdown (text other players wrote)', () => {
  it('keeps the small Markdown set and KaTeX', () => {
    expect(renderPostMarkdown('**bold** and *soft* and `code`')).toBe('<strong>bold</strong> and <em>soft</em> and <code>code</code>');
    expect(renderPostMarkdown('speed is $v^2$')).toContain('katex');
  });
  it('shows raw HTML as text', () => {
    const out = renderPostMarkdown('hi <img src=x onerror=alert(1)> <script>alert(1)</script> <b onclick="x()">b</b>');
    expect(out).not.toMatch(/<(img|script|b)\b/i);
    expect(out).toContain('&lt;img');
    expect(out).toContain('&lt;script&gt;');
  });
  it('never renders images', () => {
    const out = renderPostMarkdown('![cute cat](https://example.com/cat.png)');
    expect(out).not.toContain('<img');
    expect(out).toContain('cute cat');
  });
  it('turns links into text unless the author is verified', () => {
    expect(renderPostMarkdown('[notes](https://example.com/n)')).toBe('notes');
    const linked = renderPostMarkdown('[notes](https://example.com/n)', { links: true });
    expect(linked).toContain('href="https://example.com/n"');
    expect(linked).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(linked).toContain('target="_blank"');
  });
  it('never links javascript: or data: URLs, even for verified authors', () => {
    expect(renderPostMarkdown('[x](javascript:alert(1))', { links: true })).not.toContain('href');
    expect(renderPostMarkdown('[x](data:text/html;base64,AAAA)', { links: true })).not.toContain('href');
  });
  it('does not render headings, tables or rules from a post', () => {
    expect(renderPostMarkdown('# Big')).not.toMatch(/<h1/);
    expect(renderPostMarkdown('line one\nline two')).toContain('<br');
  });
});
