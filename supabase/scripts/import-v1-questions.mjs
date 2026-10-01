#!/usr/bin/env node
// Migrates v1 questions (TiDB/MySQL `questions` table) into the v2 tables.
//
//   node supabase/scripts/import-v1-questions.mjs [options] <export files...> > v1-import.sql
//   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f v1-import.sql
//
// Reads the export and writes a single-transaction SQL script; it never
// connects to either database. Every imported question lands as
// status = 'in_review', source = 'import': v1 answer keys were AI-generated
// and may be wrong, so a reviewer checks each one before publishing.
//
// Export formats (detected by extension):
//   .sql          mysqldump / TiDB Dumpling SQL (CREATE TABLE + INSERT ... VALUES)
//   .csv          header row required (Dumpling --filetype csv, or any CSV export)
//   .json/.ndjson array of row objects, or one object per line
// Dumpling writes the schema to a separate *-schema.sql file; pass it too
// when the INSERTs have no column list.
//
// Options:
//   --out <file>            write SQL here instead of stdout
//   --report <file>         write a per-question CSV (planned outcome, subtopic, notes)
//   --include-rejected      also import v1 questions with status 'rejected'
//   --csv-backslash-escapes CSV fields use \" \\ \n escapes (Dumpling's default)
//
// Re-runnable: private.v1_question_import records every v1 question already
// handled, and content_hash collisions with existing v2 questions are kept as
// 'duplicate' instead of inserted twice.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';

// v1 database.sql column order, used when a dump has neither a column list
// nor a CREATE TABLE for `questions`.
const V1_COLUMNS = [
  'question_id', 'qid', 'question_text', 'question_hash', 'options', 'correct_answer_index',
  'explanation', 'hint', 'difficulty', 'category', 'status', 'generated_for_date', 'created_at',
];

// v1 category -> v2 section slug. v1 'Puzzles' was a section; in v2 it is a
// Logical Reasoning subtopic.
const CATEGORY_SECTIONS = {
  'quantitative aptitude': 'quantitative-aptitude',
  'logical reasoning': 'logical-reasoning',
  'verbal ability': 'verbal-ability',
  'data interpretation': 'data-interpretation',
  'technical aptitude': 'technical-aptitude',
  'puzzles': 'logical-reasoning',
};

// Keyword rules per section, most specific first:
// [topic slug, subtopic slug, anchor, ...supporting patterns].
// The first rule whose anchor matches wins (a train question mentions speed,
// so Trains must come before Time, Speed & Distance). With no anchor match,
// the rule matching the most supporting patterns wins if it matches 2+.
// Anything else goes to the section's inactive 'v1-unsorted' topic.
const RULES = {
  'quantitative-aptitude': [
    ['data-sufficiency', 'data-sufficiency', /sufficient to answer|\bstatements?\s*(i|1)\b[\s\S]*\b(alone|sufficient)\b|data (in the statements? )?(is|are) (sufficient|adequate)/],
    ['time-work-distance', 'trains', /\btrains?\b/, /\bplatform\b/, /\b(pole|lamp[- ]?post|signal post)\b/],
    ['time-work-distance', 'boats-and-streams', /\bboats?\b|\b(up|down)stream\b/, /\bstream\b|current of the (river|water)/, /\brow(s|ing)?\b/],
    ['time-work-distance', 'pipes-and-cisterns', /\bpipes?\b|\bcisterns?\b/, /\btanks?\b/, /\bleak/, /\b(fill|empty)\b/],
    ['arithmetic', 'simple-and-compound-interest', /\binterest\b/, /\bprincipal\b/, /\bcompound(ed)?\b/, /per annum|\bp\.?\s?a\.?\b/],
    ['arithmetic', 'profit-and-loss', /\b(profit|loss|cost price|selling price|marked price)\b/, /\bdiscount\b/, /\bgain\b/, /\b[cs]\.p\.?\b/],
    ['arithmetic', 'mixtures-and-alligations', /\b(mixtures?|alligation)\b/, /\bmilk\b|\bwater\b|\balcohol\b|\bacid\b/, /\bvessel\b|\bcontainer\b/, /\breplaced\b|\bdrawn off\b/],
    ['arithmetic', 'problems-on-ages', /\bages?\b|\byears? (ago|hence)\b/, /\byears? old\b/, /\b(older|younger)\b/],
    ['time-work-distance', 'time-and-work', /\bwork\b|\bwages?\b/, /\b(complete|finish)(es|ed)?\b/, /\bdays?\b/, /efficien/],
    ['time-work-distance', 'time-speed-distance', /\bspeed\b|km\s*\/\s*h|kmph|\bm\/s\b/, /\bdistance\b/, /\b(km|kilomet(er|re)s?)\b/, /\b(hours?|minutes?)\b/],
    ['counting-and-probability', 'probability', /probabilit/, /\b(dice|die|coins?)\b/, /\b(cards?|deck)\b/, /\b(at random|randomly)\b/],
    ['counting-and-probability', 'permutations-and-combinations', /\b(permutations?|combinations?|in how many ways|number of ways)\b|letters of the word/, /\b(arrange(d|ments?)?)\b/, /\b(committee|choose|select(ed|ion)?)\b/],
    ['algebra', 'logarithms', /\blog(arithm)?s?\b|\blog\s*[_(\d]|\bln\s*\(/],
    ['algebra', 'progressions', /\bprogressions?\b|\b[agh]\.\s?p\.|common (difference|ratio)/, /\bnth term|\b\d+(st|nd|rd|th) term\b/, /sum of (the )?first \d+/],
    ['geometry-and-mensuration', 'mensuration', /\b(area|volume|perimeter|circumference|surface)\b/, /\b(cylinder|cone|sphere|hemisphere|cuboid|cube|prism|pyramid|rectangle|square)\b/, /\b(radius|diameter)\b/],
    ['geometry-and-mensuration', 'geometry', /\b(triangle|polygon|quadrilateral|rhombus|trapezium|parallelogram|chord|tangent|hypotenuse)\b|\bangles?\b/, /\bdegrees?\b/, /\b(circle|arc|parallel|perpendicular|similar|congruent)\b/, /\b(coordinate|slope)\b/],
    ['algebra', 'equations-and-inequalities', /\b(equations?|quadratic|polynomial|inequalit(y|ies))\b/, /\broots?\b/, /\b[xyz]\s*[\^²]|\b\d*[xyz]\s*[-+=<>]/, /\bsolve\b/],
    ['arithmetic', 'averages', /\baverages?\b|\bmean\b/],
    ['arithmetic', 'percentages', /\bper\s?cent|%/],
    ['arithmetic', 'ratio-and-proportion', /\b(ratios?|proportion(al)?|partnership)\b/, /\b\d+\s*:\s*\d+\b/, /\bpartners?\b|\bshares?\b/],
    ['arithmetic', 'number-system', /\b(divisib\w*|remainder|primes?|h\.?c\.?f|l\.?c\.?m|gcd|unit('?s)? digit)\b/, /\bdivided by\b/, /\b(factors?|multiples?)\b/, /\bdigits?\b/, /\b(integers?|decimals?|fractions?|surds?|indices|square root|cube root)\b/],
  ],
  'logical-reasoning': [
    ['arrangements-and-puzzles', 'input-output', /\binput\b/, /\bmachine\b|\brearrangement\b/, /\bstep\s*[ivx\d]+\b/],
    ['deductive-reasoning', 'syllogism', /\bsyllogism\b|\b(all|some|no)\s+\w+\s+(are|is)\b[\s\S]*\bconclusions?\b/, /\b(all|some|no)\s+\w+\s+(are|is)\b/, /\bconclusions?\b/],
    ['deductive-reasoning', 'statement-and-conclusion', /\b(conclusions?|assumptions?|inferences?|courses? of action)\b/, /\bstatements?\b/, /\bfollows?\b|\bimplicit\b|\bargument/],
    ['verbal-reasoning', 'coding-decoding', /\bcoded?\b|\bcode language\b|\bwritten as\b/, /\bdecod/],
    ['clocks-and-calendars', 'clocks', /\bclocks?\b|\b(hour|minute) hand\b/, /\bhands\b|\bwatch\b/, /o'?\s?clock\b/],
    ['clocks-and-calendars', 'calendars', /\bcalendar\b|\bleap year\b|\bday of the week\b/, /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/, /\b(january|february|march|april|june|july|august|september|october|november|december)\b/],
    ['non-verbal-reasoning', 'cubes-and-dice', /\bcubes?\b|\bdice\b/, /\bfaces?\b|\bpainted\b/, /\bopposite\b/],
    ['non-verbal-reasoning', 'venn-diagrams', /\bvenn\b/, /\bdiagram\b/, /\bneither\b|\bboth\b/],
    ['arrangements-and-puzzles', 'seating-arrangement', /\b(seated|sitting|sits?)\b|\b(circular|round|rectangular) table\b/, /\bin a row\b|\bfacing\b/, /\b(immediate|second to the) (left|right)\b|\bto the (left|right) of\b/],
    ['verbal-reasoning', 'direction-sense', /\b(north|south|east|west)(wards?)?\b|\bturns? (left|right)\b/, /\bwalks?\b|\bdirection\b/, /\b(km|met(er|re)s?)\b/],
    ['verbal-reasoning', 'blood-relations', /\b(father|mother|son|daughter|brother|sister|uncle|aunt|nephew|niece|husband|wife|cousin|grand(father|mother|son|daughter))\b|in-law\b/, /\brelat(ed|ion|ionship)\b/],
    ['arrangements-and-puzzles', 'puzzles', /\bpuzzle\b|\bfloors?\b/, /\bboxes\b|\bwho among\b|\beach of them\b/, /\bdifferent (colou?rs?|cities|professions|subjects)\b/],
    ['verbal-reasoning', 'series', /\bseries\b|\b(next|missing|wrong) (number|term|letter)\b|what comes next/, /\d+\s*,\s*\d+\s*,\s*\d+/, /\b[a-z]{1,3}\s*,\s*[a-z]{1,3}\s*,\s*[a-z]{1,3}\s*,/],
  ],
  'verbal-ability': [
    ['reading', 'reading-comprehension', /\bpassage\b/, /\bthe author\b|according to the/, /read the following/],
    ['reading', 'para-jumbles', /\bjumble|\brearrange\b|\b(logical|coherent) (order|sequence)\b/, /\bp\s*q\s*r\s*s\b/],
    ['reading', 'cloze-test', /\bcloze\b|\bblanks? (numbered|marked)\b/],
    ['vocabulary', 'idioms-and-phrases', /\bidioms?\b|\bphrases?\b/],
    ['vocabulary', 'synonyms-and-antonyms', /\bsynonyms?\b|\bantonyms?\b|\b(opposite|similar|same|closest|nearest)( in)? meaning\b|\bmeaning of\b/],
    ['grammar', 'fill-in-the-blanks', /\bblanks?\b|_{2,}|\bfill in\b/],
    ['grammar', 'sentence-correction', /\berror\b|\bgrammatical|\bunderlined\b|\b(correct|incorrect|improve)(s|ion|ly)?\b/],
  ],
  'data-interpretation': [
    ['charts', 'pie-charts', /\bpie\b/, /\bsectors?\b|\bcentral angle\b/],
    ['charts', 'bar-charts', /\bbar (chart|graph|diagram)s?\b|\bhistogram\b/],
    ['charts', 'line-graphs', /\bline (graph|chart)s?\b/],
    ['tables-and-caselets', 'tables', /\btable\b|\btabular\b/, /\bcolumns?\b|\brows?\b/],
    ['tables-and-caselets', 'caselets', /\bcaselet\b|\bfollowing (information|paragraph)\b/],
  ],
  'technical-aptitude': [
    ['programming', 'output-prediction', /\boutput\b|\bwhat will be printed\b/, /printf|cout|print\s*\(|console\.log|system\.out|#include|int main|\bdef \w+\(/, /\b(following|given) (code|program|snippet)\b/],
    ['programming', 'oop', /\b(oops?|class|subclass|superclass|object|inheritance|inherit|polymorphism|encapsulation|abstraction|overload\w*|overrid\w*|constructor|destructor)\b/, /\b(virtual|interface)\b/],
    ['cs-fundamentals', 'dbms', /\bsql\b|\bdbms\b|\bdatabases?\b|\bnormal(i[sz]ation| form)\b/, /\b(primary|foreign|candidate) key\b/, /\b(join|query|transaction|acid|schema|relational)\b/],
    ['cs-fundamentals', 'operating-systems', /\boperating systems?\b|\b(kernel|deadlock|semaphore|mutex|paging|page fault|virtual memory|context switch)\b/, /\b(process(es)?|threads?|scheduling)\b/],
    ['cs-fundamentals', 'computer-networks', /\bnetwork\w*|\b(tcp|udp|osi|dns|http|https|subnet|ethernet|router|mac address)\b/, /\bprotocol\b|\bbandwidth\b|\b(lan|wan|ip)\b/],
    ['programming', 'dsa', /\b(array|linked list|stack|queue|tree|graph|heap|hash table|sorting|algorithm|recursion|dynamic programming)\b|\btime complexity\b/, /\b(sort|search(ing)?|binary)\b/, /\bo\s*\(\s*(n|1|log)/],
  ],
};

const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = { files: [], out: null, report: null, includeRejected: false, csvBackslash: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--report') opts.report = argv[++i];
    else if (a === '--include-rejected') opts.includeRejected = true;
    else if (a === '--csv-backslash-escapes') opts.csvBackslash = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
    else opts.files.push(a);
  }
  return opts;
}

// ---------------------------------------------------------------------------
// SQL dump parsing (mysqldump / Dumpling)
// ---------------------------------------------------------------------------

// Splits a dump into top-level statements, skipping comments and never
// splitting inside quoted strings (question text may itself contain SQL).
function* sqlStatements(text) {
  let start = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === "'" || c === '"' || c === '`') {
      i++;
      while (i < n && text[i] !== c) {
        if (text[i] === '\\' && c !== '`') i++;
        i++;
      }
      i++;
    } else if (c === '-' && text[i + 1] === '-' && /\s/.test(text[i + 2] ?? ' ')) {
      const end = text.indexOf('\n', i);
      i = end === -1 ? n : end + 1;
    } else if (c === '#') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? n : end + 1;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
    } else if (c === ';') {
      yield text.slice(start, i);
      start = ++i;
    } else {
      i++;
    }
  }
  if (text.slice(start).trim()) yield text.slice(start);
}

function stripComments(stmt) {
  return stmt.replace(/^(\s*(--[^\n]*\n|#[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, '');
}

const ESCAPES = { '0': '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a' };

// Parses the `(...), (...)` tuples after VALUES. Returns arrays of
// string | null (numbers stay strings; the caller converts).
function parseTuples(s, pos) {
  const rows = [];
  const n = s.length;
  const ws = () => { while (pos < n && /\s/.test(s[pos])) pos++; };
  for (;;) {
    ws();
    if (s[pos] !== '(') break;
    pos++;
    const row = [];
    for (;;) {
      ws();
      let value;
      // Charset introducer / _binary prefix: _utf8mb4'...'
      const intro = /^_[a-z0-9]+(?=\s*')/i.exec(s.slice(pos, pos + 20));
      if (intro) { pos += intro[0].length; ws(); }
      if (s[pos] === "'" || s[pos] === '"') {
        const q = s[pos++];
        let out = '';
        while (pos < n) {
          const c = s[pos];
          if (c === '\\') {
            const e = s[pos + 1];
            out += ESCAPES[e] ?? e;
            pos += 2;
          } else if (c === q && s[pos + 1] === q) {
            out += q;
            pos += 2;
          } else if (c === q) {
            pos++;
            break;
          } else {
            out += c;
            pos++;
          }
        }
        value = out;
      } else {
        const m = /^[^,)\s]+/.exec(s.slice(pos, pos + 200));
        if (!m) throw new Error(`Unparseable value near: ${s.slice(pos, pos + 60)}`);
        pos += m[0].length;
        value = /^null$/i.test(m[0]) ? null
          : /^0x[0-9a-f]*$/i.test(m[0]) ? Buffer.from(m[0].slice(2), 'hex').toString('utf8')
          : m[0];
      }
      row.push(value);
      ws();
      if (s[pos] === ',') { pos++; continue; }
      if (s[pos] === ')') { pos++; break; }
      throw new Error(`Expected , or ) near: ${s.slice(pos, pos + 60)}`);
    }
    rows.push(row);
    ws();
    if (s[pos] === ',') { pos++; continue; }
    break;
  }
  return rows;
}

const TABLE = '(?:`?[\\w$]+`?\\.)?`?questions`?';
const CREATE_RE = new RegExp(`^CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${TABLE}\\s*\\(`, 'i');
const INSERT_RE = new RegExp(`^(?:INSERT|REPLACE)\\s+(?:IGNORE\\s+)?INTO\\s+${TABLE}\\s*(\\(([^)]*)\\))?\\s*VALUES\\s*`, 'i');

function columnsFromCreate(stmt) {
  const cols = [];
  for (const line of stmt.split('\n')) {
    const m = /^\s*`([^`]+)`\s+\w/.exec(line);
    if (m) cols.push(m[1]);
  }
  return cols;
}

function readSqlDumps(texts) {
  let createCols = null;
  const inserts = [];
  for (const text of texts) {
    for (const raw of sqlStatements(text)) {
      const stmt = stripComments(raw);
      if (CREATE_RE.test(stmt)) createCols = columnsFromCreate(stmt);
      const m = INSERT_RE.exec(stmt);
      if (m) inserts.push({ stmt, valuesAt: m[0].length, cols: m[2] ? m[2].split(',').map(c => c.trim().replace(/`/g, '')) : null });
    }
  }
  const rows = [];
  for (const ins of inserts) {
    const cols = ins.cols ?? createCols ?? V1_COLUMNS;
    for (const tuple of parseTuples(ins.stmt, ins.valuesAt)) {
      if (tuple.length !== cols.length) {
        throw new Error(`INSERT has ${tuple.length} values but ${cols.length} columns (${cols.join(', ')}). ` +
          'Pass the CREATE TABLE (Dumpling *-schema.sql) alongside the data files.');
      }
      rows.push(Object.fromEntries(cols.map((c, i) => [c, tuple[i]])));
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// CSV / JSON
// ---------------------------------------------------------------------------
function readCsv(text, backslash) {
  const records = [];
  let row = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  let i = 0;
  const n = text.length;
  const endField = () => {
    row.push(!wasQuoted && field === '\\N' ? null : field);
    field = '';
    wasQuoted = false;
  };
  while (i < n) {
    const c = text[i];
    if (quoted) {
      if (backslash && c === '\\') {
        const e = text[i + 1];
        field += e === 'N' ? '\\N' : (ESCAPES[e] ?? e);
        i += 2;
      } else if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
      } else if (c === '"') {
        quoted = false;
        i++;
      } else {
        field += c;
        i++;
      }
    } else if (c === '"' && field === '') {
      quoted = wasQuoted = true;
      i++;
    } else if (c === ',') {
      endField();
      i++;
    } else if (c === '\n' || c === '\r') {
      endField();
      if (row.some(f => f !== '' && f !== null) || row.length > 1) records.push(row);
      row = [];
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== '' || row.length) {
    endField();
    records.push(row);
  }
  const [header, ...data] = records;
  if (!header || !header.includes('question_text')) {
    throw new Error('CSV export needs a header row naming the v1 columns (question_text, options, ...).');
  }
  return data.map(r => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? null])));
}

function readJson(text) {
  const t = text.trim();
  if (t.startsWith('[')) return JSON.parse(t);
  return t.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

// Lower-case, every run of characters other than [a-z0-9] becomes one space,
// trimmed. Same rule as the v1 question_hash, applied to stem and options.
export function normalise(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// sha256 hex of the normalised stem, a newline, then the normalised options
// sorted and newline-joined (so reordered options still collide).
export function contentHash(stem, options) {
  const opts = options.map(normalise).sort();
  return createHash('sha256').update([normalise(stem), ...opts].join('\n')).digest('hex');
}

function parseOptions(raw) {
  let opts = raw;
  if (typeof raw === 'string') {
    try { opts = JSON.parse(raw); } catch { return null; }
  }
  if (!Array.isArray(opts)) return null;
  opts = opts.map(o => (o === null || o === undefined ? '' : String(o)).trim());
  // Drop "A) ", "B. " style labels when every option carries them in order.
  const labelled = opts.every((o, i) => new RegExp(`^\\(?${String.fromCharCode(65 + i)}[).:]\\s+\\S`, 'i').test(o));
  if (labelled && opts.length > 1) opts = opts.map(o => o.replace(/^\(?[a-z][).:]\s+/i, ''));
  return opts;
}

function classify(sectionSlug, category, stem, options) {
  if (category === 'puzzles') return { topic: 'arrangements-and-puzzles', subtopic: 'puzzles', by: 'category:puzzles' };
  const text = `${stem}\n${options.join('\n')}`.toLowerCase();
  let best = null;
  for (const [topic, subtopic, anchor, ...supporting] of RULES[sectionSlug]) {
    const m = anchor.exec(text);
    if (m) return { topic, subtopic, by: `keyword:${m[0].trim().slice(0, 40)}` };
    const score = supporting.filter(p => p.test(text)).length;
    if (score >= 2 && (!best || score > best.score)) best = { topic, subtopic, score };
  }
  if (best) return { topic: best.topic, subtopic: best.subtopic, by: `keywords:${best.score}` };
  return { topic: 'v1-unsorted', subtopic: 'unsorted', by: 'unsorted' };
}

function clean(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).replace(/\r\n/g, '\n').trim();
  return t === '' ? null : t;
}

function mapRow(row, opts) {
  const notes = [];
  const v1Id = Number.parseInt(row.question_id, 10);
  const qid = clean(row.qid) ?? `#${row.question_id}`;
  const category = (clean(row.category) ?? '').toLowerCase();
  const v1Status = (clean(row.status) ?? 'published').toLowerCase(); // pre-006 dumps have no status: all were live
  const base = { v1_question_id: v1Id, v1_qid: qid, v1_category: row.category ?? '', v1_status: v1Status };
  const skip = reason => ({ ...base, skip: reason });

  if (!Number.isInteger(v1Id)) return skip('missing question_id');
  if (v1Status === 'rejected' && !opts.includeRejected) return skip('v1 status rejected');

  const stem = clean(row.question_text);
  if (!stem) return skip('empty question_text');
  if (stem.length > 10000) return skip('question_text over 10000 chars');

  const sectionSlug = CATEGORY_SECTIONS[category];
  if (!sectionSlug) return skip(`unknown category "${row.category}"`);

  const options = parseOptions(row.options);
  if (!options) return skip('options is not a JSON array');
  if (options.length < 2 || options.length > 10) return skip(`${options.length} options (need 2-10)`);
  if (options.some(o => o === '')) return skip('empty option');
  if (options.some(o => o.length > 2000)) return skip('option over 2000 chars');
  if (new Set(options.map(normalise)).size !== options.length) notes.push('duplicate options');

  let difficulty = (clean(row.difficulty) ?? '').toLowerCase();
  if (!DIFFICULTIES.has(difficulty)) {
    notes.push(`difficulty "${row.difficulty}" -> medium`);
    difficulty = 'medium';
  }

  let correctIndex = Number.parseInt(row.correct_answer_index, 10);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
    notes.push(`no answer key: correct_answer_index ${row.correct_answer_index} out of range`);
    correctIndex = null;
  }

  let explanation = clean(row.explanation);
  if (!explanation) notes.push('no explanation');
  if (explanation && explanation.length > 10000) {
    notes.push('no answer key: explanation over 10000 chars');
    correctIndex = null;
    explanation = null;
  }
  let hint = clean(row.hint);
  if (hint && hint.length > 2000) {
    notes.push('hint over 2000 chars dropped');
    hint = null;
  }

  let createdAt = clean(row.created_at);
  if (createdAt && (createdAt.startsWith('0000') || Number.isNaN(Date.parse(createdAt.replace(' ', 'T'))))) createdAt = null;

  const cls = classify(sectionSlug, category, stem, options);
  return {
    ...base,
    section_slug: sectionSlug,
    topic_slug: cls.topic,
    subtopic_slug: cls.subtopic,
    classified_by: cls.by,
    stem,
    options,
    correct_index: correctIndex,
    explanation,
    hint,
    difficulty,
    content_hash: contentHash(stem, options),
    created_at: createdAt,
    notes: notes.length ? notes.join('; ') : null,
  };
}

// ---------------------------------------------------------------------------
// SQL output
// ---------------------------------------------------------------------------
function dollarQuote(s) {
  let tag = 'v1';
  for (let n = 0; s.includes(`$${tag}$`); n++) tag = `v1_${n}`;
  return `$${tag}$${s}$${tag}$`;
}

function buildSql(rows) {
  const out = [];
  out.push(`-- Generated by supabase/scripts/import-v1-questions.mjs on ${new Date().toISOString()}.
-- ${rows.length} v1 questions. Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <this file>
begin;

create temporary table v1_stage (
  v1_question_id  integer primary key,
  v1_qid          text not null,
  v1_category     text not null,
  v1_status       text,
  section_slug    text not null,
  topic_slug      text not null,
  subtopic_slug   text not null,
  classified_by   text not null,
  stem            text not null,
  options         jsonb not null,
  correct_index   integer,
  explanation     text,
  hint            text,
  difficulty      public.question_difficulty not null,
  content_hash    text not null,
  created_at      timestamptz,
  notes           text,
  subtopic_id     uuid,
  question_id     uuid,
  outcome         text
) on commit drop;
`);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map(r => {
      const { skip, ...rest } = r;
      return rest;
    });
    out.push(`insert into v1_stage
select * from jsonb_populate_recordset(null::v1_stage, ${dollarQuote(JSON.stringify(chunk))}::jsonb);
`);
  }
  out.push(`
-- Already handled by an earlier run.
delete from v1_stage s
using private.v1_question_import m
where m.v1_question_id = s.v1_question_id or m.v1_qid = s.v1_qid;

update v1_stage s
set subtopic_id = sub.id, question_id = gen_random_uuid()
from public.sections sec
join public.topics top on top.section_id = sec.id
join public.subtopics sub on sub.topic_id = top.id
where sec.slug = s.section_slug and top.slug = s.topic_slug and sub.slug = s.subtopic_slug;

do $check$
declare
  missing text;
begin
  select string_agg(distinct section_slug || '/' || topic_slug || '/' || subtopic_slug, ', ')
    into missing from v1_stage where subtopic_id is null;
  if missing is not null then
    raise exception 'Subtopics not found (run the taxonomy migrations first): %', missing;
  end if;
end;
$check$;

with ins as (
  insert into public.questions (id, subtopic_id, stem, difficulty, status, source, content_hash, created_at)
  select question_id, subtopic_id, stem, difficulty, 'in_review', 'import', content_hash, coalesce(created_at, now())
  from v1_stage
  order by v1_question_id
  on conflict (content_hash) do nothing
  returning id
)
update v1_stage s set outcome = 'inserted' from ins where ins.id = s.question_id;

-- Same content already in v2: link to that question instead.
update v1_stage s
set outcome = 'duplicate', question_id = q.id
from public.questions q
where s.outcome is null and q.content_hash = s.content_hash;

insert into public.question_options (question_id, position, body)
select s.question_id, (o.ord - 1)::smallint, o.body
from v1_stage s
cross join lateral jsonb_array_elements_text(s.options) with ordinality as o (body, ord)
where s.outcome = 'inserted';

-- v1 answer keys are unverified; questions stay in_review until a reviewer
-- confirms (or fixes) the key and publishes.
insert into public.question_answers (question_id, correct_option_id, explanation, hint)
select s.question_id, qo.id, coalesce(s.explanation, ''), s.hint
from v1_stage s
join public.question_options qo on qo.question_id = s.question_id and qo.position = s.correct_index
where s.outcome = 'inserted';

insert into private.v1_question_import
  (v1_question_id, v1_qid, question_id, outcome, v1_category, v1_status, classified_by, notes)
select v1_question_id, v1_qid, question_id, outcome, v1_category, v1_status, classified_by, notes
from v1_stage;

select section_slug, topic_slug, subtopic_slug, outcome, count(*) as questions
from v1_stage
group by grouping sets ((section_slug, topic_slug, subtopic_slug, outcome), ())
order by 1, 2, 3, 4;

commit;
`);
  return out.join('\n');
}

function csvField(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildReport(results) {
  const cols = ['v1_question_id', 'v1_qid', 'v1_category', 'v1_status', 'planned', 'section_slug',
    'topic_slug', 'subtopic_slug', 'classified_by', 'difficulty', 'has_answer_key', 'notes'];
  const lines = [cols.join(',')];
  for (const r of results) {
    lines.push([
      r.v1_question_id, r.v1_qid, r.v1_category, r.v1_status, r.skip ? `skip: ${r.skip}` : 'import',
      r.section_slug, r.topic_slug, r.subtopic_slug, r.classified_by, r.difficulty,
      r.skip ? '' : r.correct_index !== null, r.notes,
    ].map(csvField).join(','));
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.files.length) {
    process.stderr.write('usage: import-v1-questions.mjs [--out f.sql] [--report f.csv] [--include-rejected] [--csv-backslash-escapes] <export files...>\n');
    process.exit(opts.help ? 0 : 2);
  }

  const sqlTexts = [];
  let rows = [];
  for (const file of opts.files) {
    const text = readFileSync(file, 'utf8');
    const ext = extname(file).toLowerCase();
    if (ext === '.sql') sqlTexts.push(text);
    else if (ext === '.csv') rows.push(...readCsv(text, opts.csvBackslash));
    else if (ext === '.json' || ext === '.ndjson' || ext === '.jsonl') rows.push(...readJson(text));
    else throw new Error(`${file}: unsupported extension (use .sql, .csv, .json or .ndjson)`);
  }
  if (sqlTexts.length) rows.push(...readSqlDumps(sqlTexts));

  const results = rows.map(r => mapRow(r, opts)).sort((a, b) => (a.v1_question_id ?? 0) - (b.v1_question_id ?? 0));

  // Keep the oldest copy of anything that normalises to the same content.
  const seenHash = new Map();
  const seenId = new Set();
  for (const r of results) {
    if (r.skip) continue;
    if (seenId.has(r.v1_question_id)) { r.skip = 'duplicate question_id in export'; continue; }
    seenId.add(r.v1_question_id);
    const first = seenHash.get(r.content_hash);
    if (first !== undefined) r.skip = `duplicate of v1 ${first}`;
    else seenHash.set(r.content_hash, r.v1_qid);
  }

  const toImport = results.filter(r => !r.skip);
  const sql = buildSql(toImport);
  if (opts.out) writeFileSync(opts.out, sql);
  else process.stdout.write(sql);
  if (opts.report) writeFileSync(opts.report, buildReport(results));

  const count = (list, key) => list.reduce((m, r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1), new Map());
  const lines = [`v1 rows read: ${results.length}`, `to import (status in_review): ${toImport.length}`];
  for (const [reason, n] of count(results.filter(r => r.skip), r => r.skip.replace(/ of v1 .*/, ''))) lines.push(`  skipped, ${reason}: ${n}`);
  for (const [sec, n] of count(toImport, r => `${r.section_slug}/${r.subtopic_slug}`)) lines.push(`  ${sec}: ${n}`);
  lines.push(`without answer key: ${toImport.filter(r => r.correct_index === null).length}`);
  process.stderr.write(lines.join('\n') + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
}
