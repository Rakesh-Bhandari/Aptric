import React from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Renders untrusted markdown (AI/admin-authored question content) as sanitized HTML.
const Markdown = ({ text }) => {
    if (!text) return null;
    let html;
    try { html = marked.parse(String(text)); } catch (e) { html = String(text); }
    return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;
};

export default Markdown;
