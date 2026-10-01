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
export const Markdown = memo(({ text, className, inline = false }: { text: string | null | undefined; className?: string; inline?: boolean }) => {
  const html = useMemo(() => (text ? renderMarkdown(text, inline) : ''), [text, inline]);
  if (!text) return null;
  const Tag = inline ? 'span' : 'div';
  return <Tag className={cn(!inline && 'prose-question', className)} dangerouslySetInnerHTML={{ __html: html }} />;
});
Markdown.displayName = 'Markdown';

export default Markdown;
