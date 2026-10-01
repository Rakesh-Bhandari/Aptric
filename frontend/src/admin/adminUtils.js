import { useEffect, useState } from 'react';
import { loadTags, loadTaxonomy } from './api';

// Formatting helpers and hooks shared by the admin pages.

export const label = (value) => String(value ?? '').replace(/_/g, ' ');

export const formatDate = (value) => (value ? new Date(value).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—');

export const timeAgo = (value) => {
    if (!value) return '—';
    const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const units = [[60, 'min'], [24, 'h'], [30, 'd'], [12, 'mo']];
    let n = seconds / 60;
    for (const [size, unit] of units) {
        if (n < size) return `${Math.floor(n)} ${unit} ago`;
        n /= size;
    }
    return `${Math.floor(n)} y ago`;
};

// Markdown/LaTeX source reduced to one line of plain text for tables.
export const plain = (text, max = 140) => {
    const s = String(text ?? '').replace(/[`*_#>|]/g, '').replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// Taxonomy and tag catalog change rarely: load once per page load.
let taxonomyPromise = null;
let tagsPromise = null;

export const useTaxonomy = () => {
    const [taxonomy, setTaxonomy] = useState([]);
    useEffect(() => {
        let alive = true;
        taxonomyPromise ??= loadTaxonomy().catch((e) => { taxonomyPromise = null; throw e; });
        taxonomyPromise.then((t) => { if (alive) setTaxonomy(t); }).catch(() => {});
        return () => { alive = false; };
    }, []);
    return taxonomy;
};

export const useTags = () => {
    const [tags, setTags] = useState([]);
    useEffect(() => {
        let alive = true;
        tagsPromise ??= loadTags().catch((e) => { tagsPromise = null; throw e; });
        tagsPromise.then((t) => { if (alive) setTags(t); }).catch(() => {});
        return () => { alive = false; };
    }, []);
    return tags;
};

// subtopic id -> { section, topic, subtopic }
export const findSubtopic = (taxonomy, subtopicId) => {
    for (const section of taxonomy) {
        for (const topic of section.topics) {
            const subtopic = topic.subtopics.find((st) => st.id === subtopicId);
            if (subtopic) return { section, topic, subtopic };
        }
    }
    return null;
};

export const useDebounced = (value, ms = 300) => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return debounced;
};
