// Server-side leak guard for the tutor while the player is still solving.
// The model's output is buffered by sentence; a sentence that states the
// final answer (the correct option's letter or number phrased as the answer,
// its text or value presented as the result, or the worked explanation's
// final value) is replaced before it reaches the browser.

import { optionLetter } from './prompt.js';

export const BLOCKED_SENTENCE = "(I won't give the final answer yet. Try the next step!)";

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

/** Plain text for matching: LaTeX and Markdown markup removed, thousands separators dropped. */
export function normalize(text) {
  return String(text ?? '')
    .replace(/\\(?:text|mathrm|mathbf|textbf|operatorname)\s*\{([^}]*)\}/g, '$1')
    .replace(/\\d?frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, '$1/$2')
    .replace(/\\(?:times|cdot)/g, '×')
    .replace(/\\(?:approx)/g, '≈')
    .replace(/\\(?:left|right|displaystyle|quad|qquad)\b/g, '')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\%/g, '%')
    .replace(/[$`{}]|\*\*|__/g, '')
    .replace(/(\d),(?=\d{2,3}\b)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const NUM = String.raw`(-?\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?`;
const toValue = (whole, denom) => (denom ? Number(whole) / Number(denom) : Number(whole));

/** The option's value when it is a number with optional currency/units ("₹1,050", "72 km/h", "3/4", "12.5%"). */
export function numericValue(body) {
  const t = normalize(body);
  const m = new RegExp(String.raw`^(?:₹|rs\.?|inr|\$)?\s*${NUM}\s*(?:%|[a-z°²³/ .]{0,15})?$`, 'i').exec(t);
  return m ? toValue(m[1], m[2]) : null;
}

// Words that present a value as the outcome ("= 72", "is 72", "answer: 72").
const CUE = String.raw`(?:=|≈|:|\b(?:is|are|was|equals?|gives?|giving|comes?(?: out)? to|becomes?|answer|result|total|therefore|hence|thus|so|get|gets|got|makes?)\b)`;
const cueNumbers = (sentence) =>
  [...sentence.matchAll(new RegExp(String.raw`${CUE}\s*(?:[^\d\s-]{0,4}\s?)?${NUM}`, 'gi'))].map((m) => toValue(m[1], m[2]));

const same = (a, b) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-6);

/** The final value of the worked explanation: the last value after a result cue. */
export function finalValue(explanation) {
  const values = cueNumbers(normalize(explanation));
  return values.length ? values.at(-1) : null;
}

const RESULT_WORDS = /\b(answer|correct|right|therefore|hence|thus|so the|must be|is the|equals?|result)\b|=/i;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A guard for one reply, or null when nothing needs guarding (answered).
 * push(text) returns the text that is safe to send now; end() flushes the rest.
 */
export function createLeakGuard(ctx, { onBlock } = {}) {
  if (ctx.phase !== 'solving' || !ctx.answer_key) return null;
  const options = ctx.question.options;
  const position = ctx.answer_key.correct_position;
  const correct = options.find((o) => o.id === ctx.answer_key.correct_option_id);
  const letter = optionLetter(position);
  const number = position + 1;
  const isLast = position === options.length - 1;

  const values = new Set();
  const optionValue = correct ? numericValue(correct.body) : null;
  if (optionValue !== null) values.add(optionValue);
  const explained = finalValue(ctx.answer_key.explanation);
  if (explained !== null) values.add(explained);

  const optionText = correct ? normalize(correct.body).toLowerCase() : '';
  const textRe = optionText.length >= 3 && optionValue === null
    ? new RegExp(String.raw`(^|[^a-z0-9])${escape(optionText)}([^a-z0-9]|$)`, 'i')
    : null;

  const leaks = (raw) => {
    const s = normalize(raw);
    if (!s) return false;

    // "the answer is C", "option (C)", "go with C", "C is correct".
    for (const m of s.matchAll(/\b(?:answers?|options?|choices?|correct|right one|pick|choose|select|go with|mark)\b[^.\n]{0,24}?(?:\(([a-j])\)|\b([a-j])\b(?![\w'’-]))/gi)) {
      const l = m[1] ? m[1].toUpperCase() : m[2] === m[2].toUpperCase() ? m[2] : null;
      if (l === letter) return true;
    }
    for (const m of s.matchAll(/\b(?:option|choice)\s*\(?([a-j])\)?(?![\w'’-])/gi)) {
      if (m[1].toUpperCase() === letter) return true;
    }
    for (const m of s.matchAll(/(?:\(([a-j])\)|\b([A-J])\b)[^.\n]{0,20}?\b(?:is|are|looks|seems)\s+(?:the\s+)?(?:correct|right|answer)\b/gi)) {
      const l = m[1] ? m[1].toUpperCase() : m[2];
      if (l === letter) return true;
    }
    // "option 3", "the third option", "the last option".
    for (const m of s.matchAll(/\b(?:option|choice)\s*(?:#|no\.?\s*|number\s*)?(\d{1,2})\b/gi)) {
      if (Number(m[1]) === number) return true;
    }
    for (const m of s.matchAll(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last)\s+(?:option|choice)\b/gi)) {
      const word = m[1].toLowerCase();
      if (word === 'last' ? isLast : ORDINALS.indexOf(word) === position) return true;
    }
    // The correct option's value, or the explanation's final value, as a result.
    if (values.size && cueNumbers(s).some((v) => [...values].some((w) => same(v, w)))) return true;
    // The correct option's text presented as the result.
    if (textRe && textRe.test(s) && RESULT_WORDS.test(s)) return true;
    return false;
  };

  let buffer = '';
  let blocked = 0;
  let lastWasBlock = false;

  const check = (sentence) => {
    if (!leaks(sentence)) {
      if (sentence.trim()) lastWasBlock = false;
      return sentence;
    }
    blocked += 1;
    onBlock?.(sentence);
    const lead = sentence.match(/^\s*/)[0];
    const trail = sentence.match(/\s*$/)[0];
    if (lastWasBlock) return trail.includes('\n') ? trail : '';
    lastWasBlock = true;
    return `${lead}${BLOCKED_SENTENCE}${trail || ' '}`;
  };

  // Sentence ends: . ! ? followed by whitespace, or a line break.
  const BOUNDARY = /[.!?](?=\s)\s*|\n+/g;

  return {
    push(text) {
      buffer += text;
      let out = '';
      let start = 0;
      let m;
      BOUNDARY.lastIndex = 0;
      while ((m = BOUNDARY.exec(buffer))) {
        const end = m.index + m[0].length;
        out += check(buffer.slice(start, end));
        start = end;
      }
      buffer = buffer.slice(start);
      return out;
    },
    end() {
      const rest = buffer;
      buffer = '';
      return rest ? check(rest) : '';
    },
    get blocked() {
      return blocked;
    },
  };
}
