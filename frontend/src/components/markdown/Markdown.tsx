import { memo, useMemo } from 'react';
import { Marked, type TokenizerAndRendererExtension } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { cn } from '@/lib/utils';

const renderMath = (tex: string, displayMode: boolean) =>
  katex.renderToString(tex, { displayMode, throwOnError: false, strict: 'ignore', trust: false, maxExpand: 500 });

// Math is tokenized before Markdown so `_` and `*` inside formulas survive:
//   display: $$...$$ or \[...\]      inline: $...$ or \(...\)
// Inline $...$ follows Pandoc's rule (no space just inside the dollars, no digit
// right after the closing one) so prices like "$5 and $10" stay plain text.
const INLINE_DOLLAR = /^\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/;
const INLINE_PAREN = /^\\\(([\s\S]+?)\\\)/;
const DISPLAY = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])/;

const mathBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start: (src) => src.match(/^(?:\$\$|\\\[)/m)?.index,
  tokenizer(src) {
    const m = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n|$)/.exec(src);
    if (m) return { type: 'mathBlock', raw: m[0], text: (m[1] ?? m[2]).trim() };
    return undefined;
  },
  renderer: (token) => `<div class="math-display">${renderMath(token.text as string, true)}</div>`,
};

const mathInline: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start: (src) => src.match(/\$|\\\(|\\\[/)?.index,
  tokenizer(src) {
    let m = DISPLAY.exec(src);
    if (m) return { type: 'mathInline', raw: m[0], text: (m[1] ?? m[2]).trim(), display: true };
    m = INLINE_PAREN.exec(src) || INLINE_DOLLAR.exec(src);
    if (m) return { type: 'mathInline', raw: m[0], text: m[1].trim(), display: false };
    return undefined;
  },
  renderer: (token) => renderMath(token.text as string, Boolean(token.display)),
};

const markdown = new Marked({ gfm: true, breaks: false, extensions: [mathBlock, mathInline] });
const inlineMarkdown = new Marked({ gfm: true, extensions: [mathInline] });

// Posts and replies are written by players, so they get a strict subset: raw HTML is shown as text,
// images become their alt text, and links are plain text unless the author is verified.
const escapeText = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const safeHref = (href: string) => (/^https?:\/\//i.test(href) ? href : null);
const strictRenderers = (links: boolean) => ({
  html: ({ text }: { text: string }) => escapeText(text),
  image: ({ text }: { text: string }) => escapeText(text),
  link(this: { parser: { parseInline: (t: unknown) => string } }, { href, tokens }: { href: string; tokens: unknown }) {
    const inner = this.parser.parseInline(tokens);
    const url = links ? safeHref(href) : null;
    return url ? `<a href="${escapeText(url)}" rel="noopener noreferrer nofollow ugc" target="_blank">${inner}</a>` : inner;
  },
});
const postMarkdown = (links: boolean) =>
  new Marked({ gfm: true, breaks: true, extensions: [mathInline], renderer: strictRenderers(links) as never });
const postNoLinks = postMarkdown(false);
const postLinks = postMarkdown(true);

// A separate sanitizer, so the stricter rules never touch question content.
const FORBIDDEN_TAGS = ['img', 'picture', 'source', 'video', 'audio', 'iframe', 'object', 'embed', 'form', 'input', 'button',
  'textarea', 'select', 'style', 'link', 'meta', 'base', 'script', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'hr'];
let postPurify: ReturnType<typeof DOMPurify> | null = null;
const purifyPost = (html: string) => {
  postPurify ??= DOMPurify(window);
  return postPurify.sanitize(html, { FORBID_TAGS: FORBIDDEN_TAGS, FORBID_ATTR: ['src', 'srcset', 'onerror', 'onclick'], ALLOW_DATA_ATTR: false, ADD_ATTR: ['target'] });
};

/** Strict rendering for text other players wrote (community posts and replies). */
export const renderPostMarkdown = (text: string, { links = false }: { links?: boolean } = {}) => {
  let html: string;
  try {
    html = (links ? postLinks : postNoLinks).parseInline(text) as string;
  } catch {
    html = escapeText(text);
  }
  return purifyPost(html);
};

export const renderMarkdown = (text: string, inline = false) => {
  let html: string;
  try {
    html = (inline ? inlineMarkdown.parseInline(text) : markdown.parse(text)) as string;
  } catch {
    html = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
  }
  return DOMPurify.sanitize(html);
};

/**
 * Renders untrusted Markdown (AI/admin-authored question content) with KaTeX
 * math as sanitized HTML. `inline` skips block elements (for option labels).
 */
export const Markdown = memo(({ text, className, inline = false, strict = false, links = false }: {
  text: string | null | undefined; className?: string; inline?: boolean;
  /** For text other players wrote: no raw HTML, no images, links only when `links` (a verified author). */
  strict?: boolean; links?: boolean;
}) => {
  const html = useMemo(() => (text ? (strict ? renderPostMarkdown(text, { links }) : renderMarkdown(text, inline)) : ''), [text, inline, strict, links]);
  if (!text) return null;
  const Tag = inline || strict ? 'span' : 'div';
  return <Tag className={cn(!inline && !strict && 'prose-question', className)} dangerouslySetInnerHTML={{ __html: html }} />;
});
Markdown.displayName = 'Markdown';

export default Markdown;
