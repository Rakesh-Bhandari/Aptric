import React, { useMemo } from 'react';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const renderMath = (tex, displayMode) =>
    katex.renderToString(tex, { displayMode, throwOnError: false, strict: 'ignore', trust: false, maxExpand: 500 });

// Math, tokenized before Markdown so `_` and `*` inside formulas survive:
//   display: $$...$$ or \[...\]      inline: $...$ or \(...\)
// Inline $...$ follows Pandoc's rule (no space just inside the dollars, no digit
// right after the closing one) so prices like "$5 and $10" stay plain text.
const INLINE_DOLLAR = /^\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/;
const INLINE_PAREN = /^\\\(([\s\S]+?)\\\)/;
const DISPLAY = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])/;

const markdown = new Marked({
    gfm: true,
    extensions: [
        {
            name: 'mathBlock',
            level: 'block',
            start: (src) => src.match(/^(?:\$\$|\\\[)/m)?.index,
            tokenizer(src) {
                const m = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n|$)/.exec(src);
                if (m) return { type: 'mathBlock', raw: m[0], text: (m[1] ?? m[2]).trim() };
                return undefined;
            },
            renderer: (token) => `<div class="math-display">${renderMath(token.text, true)}</div>`,
        },
        {
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
            renderer: (token) => renderMath(token.text, token.display),
        },
    ],
});

const renderMarkdown = (text) => {
    let html;
    try { html = markdown.parse(String(text)); } catch { html = String(text); }
    return DOMPurify.sanitize(html);
};

// Renders untrusted markdown (AI/admin-authored question content), with KaTeX
// math, as sanitized HTML.
const Markdown = ({ text, className }) => {
    const html = useMemo(() => (text ? renderMarkdown(text) : ''), [text]);
    if (!text) return null;
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
};

export default Markdown;
