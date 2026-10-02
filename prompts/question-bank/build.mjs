// Builds one Claude Code prompt per subtopic: each prompt has a session write
// 50 questions for that subtopic and insert them into Supabase through the
// Supabase MCP server (execute_sql). Run: node prompts/question-bank/build.mjs
//
// The taxonomy below mirrors supabase/migrations/20261001000010_taxonomy_seed.sql.
// Edit COVERAGE/FORMAT here and re-run rather than editing the generated files.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));
const PROMPT_VERSION = 'claude-code-bank/2026-10-02.1';
const MIX = { easy: 15, medium: 25, hard: 10 };
const TOTAL = MIX.easy + MIX.medium + MIX.hard;

const SECTIONS = {
  'quantitative-aptitude': { name: 'Quantitative Aptitude', tags: ['tcs-nqt', 'infosys', 'amcat', 'cat', 'bank-po', 'ssc'] },
  'logical-reasoning': { name: 'Logical Reasoning', tags: ['tcs-nqt', 'infosys', 'amcat', 'cat', 'bank-po', 'ssc'] },
  'verbal-ability': { name: 'Verbal Ability', tags: ['tcs-nqt', 'infosys', 'amcat', 'cat', 'bank-po', 'ssc'] },
  'data-interpretation': { name: 'Data Interpretation', tags: ['tcs-nqt', 'infosys', 'amcat', 'cat', 'bank-po', 'ssc'] },
  'technical-aptitude': { name: 'Technical Aptitude', tags: ['tcs-nqt', 'infosys', 'amcat', 'gate'] },
};

// [section, topicSlug, topicName, subSlug, subName, coverage, formatNotes?]
const SUBTOPICS = [
  // Quantitative Aptitude
  ['quantitative-aptitude', 'arithmetic', 'Arithmetic', 'number-system', 'Number System',
    'divisibility rules, HCF and LCM (including word problems), remainders and cyclicity of unit digits, factors and number of divisors, prime numbers, trailing zeros in factorials, simplification and BODMAS, surds and indices, recurring decimals as fractions.'],
  ['quantitative-aptitude', 'arithmetic', 'Arithmetic', 'percentages', 'Percentages',
    'percentage change, successive increases/decreases, fraction-percentage conversions, population and depreciation, election and examination (pass mark) problems, income/expenditure and savings, price-consumption (expenditure constant), "x% more than / less than" comparisons.'],
  ['quantitative-aptitude', 'arithmetic', 'Arithmetic', 'profit-and-loss', 'Profit & Loss',
    'cost price, selling price and profit %, marked price and discounts, successive discounts, false weights and dishonest dealers, buying x selling y articles, break-even, profit on cost vs on selling price, partnership profit sharing.'],
  ['quantitative-aptitude', 'arithmetic', 'Arithmetic', 'simple-and-compound-interest', 'Simple & Compound Interest',
    'simple interest, compound interest annual/half-yearly/quarterly, difference between CI and SI for 2 and 3 years, sum doubling/tripling, installments, rate changing between years, effective annual rate.'],
  ['quantitative-aptitude', 'arithmetic', 'Arithmetic', 'ratio-and-proportion', 'Ratio & Proportion',
    'simplifying and combining ratios, dividing an amount in a ratio, mean/third/fourth proportional, coins and notes, income and expenditure ratios, changing ratios by adding/removing quantities, variation (direct and inverse).'],
  ['quantitative-aptitude', 'arithmetic', 'Arithmetic', 'averages', 'Averages',
    'simple and weighted averages, average after adding/removing/replacing a member, average of consecutive numbers, cricket batting averages, average speed, age-based average problems, correcting a wrongly recorded value.'],
  ['quantitative-aptitude', 'arithmetic', 'Arithmetic', 'mixtures-and-alligations', 'Mixtures & Alligations',
    'rule of alligation, mixing two or three varieties at a target price, milk-water and alcohol concentration, repeated removal and replacement, mixing solutions to reach a strength, mean price of a mixture.'],
  ['quantitative-aptitude', 'arithmetic', 'Arithmetic', 'problems-on-ages', 'Problems on Ages',
    'present/past/future age relations, ratio of ages now and after n years, sum and difference of ages, ages of family members (three or more people), age as a fraction or multiple of another, average age of a group.'],
  ['quantitative-aptitude', 'time-work-distance', 'Time, Work & Distance', 'time-and-work', 'Time & Work',
    'individual and combined work rates, one person leaving midway, alternate days, efficiency comparisons, men-days and man-hours (M1D1H1 = M2D2H2), wages shared by work done, work with negative contributors.'],
  ['quantitative-aptitude', 'time-work-distance', 'Time, Work & Distance', 'pipes-and-cisterns', 'Pipes & Cisterns',
    'filling and emptying pipes together, leaks, pipes opened at different times, pipes closed after some time, alternate opening, tank capacity from rates, partly filled tanks.'],
  ['quantitative-aptitude', 'time-work-distance', 'Time, Work & Distance', 'time-speed-distance', 'Time, Speed & Distance',
    'unit conversion (km/h and m/s), average speed for equal distances, relative speed (same and opposite directions), meeting and overtaking, late/early arrival with changed speed, circular track meetings, races and head starts.'],
  ['quantitative-aptitude', 'time-work-distance', 'Time, Work & Distance', 'trains', 'Problems on Trains',
    'train crossing a pole/person and a platform/bridge, two trains crossing in the same and opposite directions, train passing a moving person, finding train length or speed, trains starting from two stations and meeting.'],
  ['quantitative-aptitude', 'time-work-distance', 'Time, Work & Distance', 'boats-and-streams', 'Boats & Streams',
    'upstream and downstream speeds, speed in still water and of the stream, round trips, time ratios upstream vs downstream, distance from total journey time, boats meeting on a river.'],
  ['quantitative-aptitude', 'counting-and-probability', 'Counting & Probability', 'permutations-and-combinations', 'Permutations & Combinations',
    'fundamental counting principle, arrangements of words with repeated letters, vowels together/apart, circular arrangements, selections with restrictions (at least / at most), committees, distributing identical/distinct objects, handshakes and diagonals, forming numbers from digits.'],
  ['quantitative-aptitude', 'counting-and-probability', 'Counting & Probability', 'probability', 'Probability',
    'coins and dice, cards from a standard deck, balls drawn from bags with and without replacement, complementary events, independent events, conditional probability, odds in favour/against, probability with arrangements.'],
  ['quantitative-aptitude', 'geometry-and-mensuration', 'Geometry & Mensuration', 'mensuration', 'Mensuration',
    'area and perimeter of rectangles, triangles, circles, trapeziums and composite figures; paths around fields; surface area and volume of cubes, cuboids, cylinders, cones, spheres and hemispheres; melting and recasting; percentage change in area/volume.'],
  ['quantitative-aptitude', 'geometry-and-mensuration', 'Geometry & Mensuration', 'geometry', 'Geometry',
    'angles and parallel lines, triangle properties (angle sum, similarity, Pythagoras, centres), quadrilaterals and polygons (interior/exterior angles), circle theorems (chords, tangents, inscribed angles), coordinate geometry (distance, midpoint, slope, line equations).',
    'Describe every figure fully in words (no images). Give all lengths and angles needed.'],
  ['quantitative-aptitude', 'algebra', 'Algebra', 'equations-and-inequalities', 'Equations & Inequalities',
    'linear equations in one and two variables, word problems leading to equations, quadratic equations (roots, sum and product of roots, nature of roots), comparing two quantities from quadratics (bank PO style), linear and modulus inequalities, maximum/minimum of expressions.'],
  ['quantitative-aptitude', 'algebra', 'Algebra', 'progressions', 'Progressions',
    'nth term and sum of arithmetic progressions, geometric progressions and infinite GP sums, arithmetic/geometric means, inserting means, word problems (savings, seats in rows), sums of squares and cubes of natural numbers.'],
  ['quantitative-aptitude', 'algebra', 'Algebra', 'logarithms', 'Logarithms',
    'laws of logarithms, change of base, simplifying expressions, solving logarithmic and exponential equations, number of digits using log10, comparing logarithmic values, characteristic and mantissa.',
    'Use KaTeX for every logarithm, e.g. $\\log_{2} 32$.'],
  ['quantitative-aptitude', 'data-sufficiency', 'Data Sufficiency', 'data-sufficiency', 'Data Sufficiency',
    'data sufficiency on numbers, ages, percentages, profit and loss, time and work, speed, geometry and arrangements.',
    'Each stem gives a question and two statements labelled I and II. Use exactly these four options in this order: "Statement I alone is sufficient, but statement II alone is not", "Statement II alone is sufficient, but statement I alone is not", "Both statements together are sufficient, but neither alone is", "The statements together are not sufficient". Vary which one is correct.'],

  // Logical Reasoning
  ['logical-reasoning', 'verbal-reasoning', 'Verbal Reasoning', 'series', 'Number & Letter Series',
    'missing term and wrong term in number series (differences, squares/cubes, primes, multiplication-addition patterns, alternating series), letter series by position jumps, alphanumeric series, letter-group series.'],
  ['logical-reasoning', 'verbal-reasoning', 'Verbal Reasoning', 'coding-decoding', 'Coding-Decoding',
    'letter shifting, reverse alphabet coding, letter-to-number coding (positions, sums), word coding in sentences (common-word method), substitution coding, coding of mathematical operators, mixed letter-number-symbol codes.'],
  ['logical-reasoning', 'verbal-reasoning', 'Verbal Reasoning', 'blood-relations', 'Blood Relations',
    'direct relation statements, pointing-to-a-photograph puzzles, coded relations (A + B means A is the father of B), family trees of three generations, gender deduction from statements.'],
  ['logical-reasoning', 'verbal-reasoning', 'Verbal Reasoning', 'direction-sense', 'Direction Sense',
    'final direction after turns, shortest distance from start (Pythagoras), facing direction after rotations in degrees, shadows at sunrise/sunset, relative positions of several people or places, coded directions.'],
  ['logical-reasoning', 'arrangements-and-puzzles', 'Arrangements & Puzzles', 'seating-arrangement', 'Seating Arrangement',
    'linear rows facing north/south, two parallel rows facing each other, circular tables facing centre/outside, square and rectangular tables, arrangements with an extra attribute (profession, colour).',
    'Most stems state a full arrangement scenario (5–8 people with clues) and ask one question about it. Each stem must repeat the whole scenario so it stands alone. The clues must lead to exactly one arrangement (or at least one answer to the question asked).'],
  ['logical-reasoning', 'arrangements-and-puzzles', 'Arrangements & Puzzles', 'puzzles', 'Puzzles',
    'floor puzzles, scheduling across days or months, matching people to multiple attributes, ordering and ranking (heights, weights, positions in a queue), box stacking, comparison puzzles.',
    'Each stem must contain the full puzzle and its clues, and must have a unique answer. Check uniqueness by solving the whole puzzle before writing options.'],
  ['logical-reasoning', 'arrangements-and-puzzles', 'Arrangements & Puzzles', 'input-output', 'Input-Output',
    'machine input-output rearrangement of words and numbers step by step (sorting, swapping, arithmetic on numbers), finding a given step, the last step, the number of steps, or the position of an element in a step.',
    'Show the rule through an example input and its steps in a Markdown code block, then give a new input and ask a question about it. Check every step by hand.'],
  ['logical-reasoning', 'deductive-reasoning', 'Deductive Reasoning', 'syllogism', 'Syllogism',
    'two- and three-statement syllogisms with all/some/no, "some not" conclusions, either-or (complementary pair) cases, possibility conclusions ("can be true"), the only-a-few form.',
    'Use options such as "Only conclusion I follows", "Only conclusion II follows", "Both I and II follow", "Neither I nor II follows" (or "Either I or II follows" in place of one of them when relevant).'],
  ['logical-reasoning', 'deductive-reasoning', 'Deductive Reasoning', 'statement-and-conclusion', 'Statement & Conclusion',
    'statement and conclusions, statement and assumptions, course of action, cause and effect, strengthening and weakening arguments.',
    'Keep scenarios realistic and neutral (business, education, civic life). The keyed option must follow strictly from the statement, not from outside knowledge.'],
  ['logical-reasoning', 'clocks-and-calendars', 'Clocks & Calendars', 'clocks', 'Clocks',
    'angle between hands at a given time, times when hands coincide/are opposite/at right angles, mirror and water images of clocks, clocks gaining or losing time, number of times hands meet in a day.'],
  ['logical-reasoning', 'clocks-and-calendars', 'Clocks & Calendars', 'calendars', 'Calendars',
    'day of the week for a given date (odd days method), leap year rules (including century years), years with the same calendar, number of particular weekdays in a month or year, day after n days.',
    'Every date you use must be a real date with the correct weekday; verify with the odd-days method twice.'],
  ['logical-reasoning', 'non-verbal-reasoning', 'Non-Verbal Reasoning', 'cubes-and-dice', 'Cubes & Dice',
    'painted cube cut into smaller cubes (faces painted on 0/1/2/3 sides), cuboids painted in different colours, standard dice (opposite faces sum to 7), opposite faces from two or more positions of a die, nets described in words.',
    'Describe every die position as text, e.g. "In position 1 the top shows 2, the front 3, the right 5." No images.'],
  ['logical-reasoning', 'non-verbal-reasoning', 'Non-Verbal Reasoning', 'venn-diagrams', 'Venn Diagrams',
    'counting with two- and three-set Venn diagrams (only A, exactly two, none), word problems on students, languages and sports, choosing the diagram that represents a relation between classes (described in words).',
    'When a question is about choosing a diagram, describe each option in words (e.g. "Three separate circles", "One circle inside another, third separate").'],

  // Verbal Ability
  ['verbal-ability', 'reading', 'Reading', 'reading-comprehension', 'Reading Comprehension',
    'main idea, specific detail, inference, author\'s tone and purpose, vocabulary in context, title selection, strengthening/weakening a claim in the passage.',
    'Write 10 original passages (200–350 words each; topics such as science, economics, history, technology, environment, psychology) with 5 questions per passage. Each stem repeats its full passage, then the question below a horizontal rule (---). Never use copyrighted text.'],
  ['verbal-ability', 'reading', 'Reading', 'para-jumbles', 'Para Jumbles',
    'ordering 4–5 sentences into a coherent paragraph, fixed first/last sentence variants, the odd sentence out, choosing the sentence that completes a paragraph.',
    'Label sentences P, Q, R, S (and T) in the stem; options are orders like "QPSR". Only one order may be coherent; check the logical connectors.'],
  ['verbal-ability', 'reading', 'Reading', 'cloze-test', 'Cloze Test',
    'contextual vocabulary, collocations, connectors and conjunctions, tense and grammar in context, prepositions.',
    'Each stem has a short original paragraph (80–150 words) with one blank marked "_____" (other blanks already filled), and asks for the best word or phrase for that blank.'],
  ['verbal-ability', 'grammar', 'Grammar & Usage', 'sentence-correction', 'Sentence Correction',
    'subject-verb agreement, tenses, pronouns and their antecedents, modifiers (dangling and misplaced), parallelism, prepositions, articles, comparison errors, conditionals, redundancy.',
    'Use the formats "Choose the grammatically correct sentence", "Which part of the sentence has an error?" (parts labelled A–D, with "No error" allowed as one option) and "Replace the underlined part" (mark it with **bold**). The explanation names the rule.'],
  ['verbal-ability', 'grammar', 'Grammar & Usage', 'fill-in-the-blanks', 'Fill in the Blanks',
    'single blanks (vocabulary and grammar), double blanks, prepositions, phrasal verbs, conjunctions, tense forms, commonly confused words (affect/effect, principle/principal).',
    'Mark blanks with "_____". For double blanks, each option is a pair like "ardent, dismissed".'],
  ['verbal-ability', 'vocabulary', 'Vocabulary', 'synonyms-and-antonyms', 'Synonyms & Antonyms',
    'synonyms, antonyms, words used in a sentence context, one-word substitution, spelling (choose the correctly spelt word), analogies of word meaning.',
    'Use words of the level seen in placement exams and CAT, not obscure ones. Wrong options must be real words with nearby meanings or look-alike spellings.'],
  ['verbal-ability', 'vocabulary', 'Vocabulary', 'idioms-and-phrases', 'Idioms & Phrases',
    'meanings of common English idioms and phrases, phrasal verbs, choosing the idiom that fits a sentence, idioms used in context, proverbs.',
    'Only standard, widely recognised idioms. The explanation gives the meaning and an example sentence.'],

  // Data Interpretation
  ['data-interpretation', 'tables-and-caselets', 'Tables & Caselets', 'tables', 'Tables',
    'percentage change between years, ratios, averages, totals, growth rates, comparisons across rows and columns, missing values derived from totals.',
    'Create 10 original data sets as Markdown tables (4–6 rows, 3–5 columns of realistic numbers: sales, production, students, revenue) with 5 questions each. Each stem repeats its full table, then the question. All numbers must make the arithmetic clean enough to solve without a calculator.'],
  ['data-interpretation', 'tables-and-caselets', 'Tables & Caselets', 'caselets', 'Caselets',
    'paragraph-based data (employees in departments, survey results, travel itineraries), extracting values, building a table mentally, percentages and ratios from the caselet.',
    'Create 10 original caselets (100–200 words of data in prose) with 5 questions each. Each stem repeats its full caselet. The data must be consistent and complete.'],
  ['data-interpretation', 'charts', 'Charts', 'bar-charts', 'Bar Charts',
    'reading values, percentage increase/decrease, ratios between bars, averages across years, stacked and grouped bar comparisons.',
    'Charts cannot be drawn, so present each bar chart as a Markdown table titled "Bar chart: …" with the bar values, saying it is a bar chart of those values (grouped or stacked as relevant). Create 10 data sets with 5 questions each; each stem repeats its data.'],
  ['data-interpretation', 'charts', 'Charts', 'line-graphs', 'Line Graphs',
    'trends, maximum/minimum change, percentage growth between points, comparing two or more lines, averages over periods, years where one line overtakes another.',
    'Present each line graph as a Markdown table titled "Line graph: …" (x-axis values as rows, one column per line). Create 10 data sets with 5 questions each; each stem repeats its data.'],
  ['data-interpretation', 'charts', 'Charts', 'pie-charts', 'Pie Charts',
    'central angles from percentages, values from percentages of a total, comparisons between sectors, two pie charts compared, combining a pie chart with a total.',
    'Present each pie chart as a Markdown table of sectors with percentages (summing to 100) or degrees (summing to 360), plus the total value where needed. Create 10 data sets with 5 questions each; each stem repeats its data.'],
  ['data-interpretation', 'mixed-di', 'Mixed', 'mixed-graphs', 'Mixed Graphs',
    'combinations of a table with a pie chart, a bar chart with a line graph, or two linked tables; questions that need values from both sources.',
    'Present each source as a labelled Markdown table ("Table 1", "Pie chart: …"). Create 10 data sets with 5 questions each; each stem repeats all its data.'],

  // Technical Aptitude
  ['technical-aptitude', 'programming', 'Programming', 'output-prediction', 'Output Prediction',
    'C pointers and arrays, operators and precedence, loops and recursion, static and global variables, string functions; Java and Python output (integer division, list slicing, mutability, string immutability, exceptions); C++ references and constructors.',
    'Put code in fenced Markdown blocks with the language (```c, ```java, ```python, ```cpp). Mix languages: roughly 20 C/C++, 15 Java, 15 Python. Code must compile/run as shown and behave the same on any standard compiler: avoid undefined behaviour unless the question is explicitly about it. Trace every program step by step in the explanation. Options may include "Compilation error" or "Runtime error" when plausible.'],
  ['technical-aptitude', 'programming', 'Programming', 'oop', 'Object-Oriented Programming',
    'classes and objects, encapsulation, inheritance types, polymorphism (overloading vs overriding), abstraction and interfaces, constructors and destructors, access modifiers, static members, virtual functions, SOLID basics, short code snippets in Java/C++/Python.'],
  ['technical-aptitude', 'programming', 'Programming', 'dsa', 'Data Structures & Algorithms',
    'time and space complexity, arrays and strings, linked lists, stacks and queues (including infix/postfix), trees and BST traversals, heaps, hashing, graphs (BFS/DFS, shortest paths), sorting and searching algorithms, recursion and dynamic programming basics.'],
  ['technical-aptitude', 'cs-fundamentals', 'CS Fundamentals', 'dbms', 'DBMS',
    'ER model, keys (primary, candidate, foreign), normalization (1NF to BCNF, functional dependencies), SQL queries (joins, GROUP BY/HAVING, subqueries, output of a given query on a given table), transactions and ACID, concurrency and serializability, indexing.',
    'For SQL output questions, give the table(s) as Markdown tables and the query in a ```sql block.'],
  ['technical-aptitude', 'cs-fundamentals', 'CS Fundamentals', 'operating-systems', 'Operating Systems',
    'processes and threads, CPU scheduling (FCFS, SJF, SRTF, round robin, priority; compute waiting/turnaround time), deadlocks and the banker\'s algorithm, synchronization (semaphores, mutex), memory management (paging, segmentation, page replacement FIFO/LRU/optimal and page faults), virtual memory, file systems.'],
  ['technical-aptitude', 'cs-fundamentals', 'CS Fundamentals', 'computer-networks', 'Computer Networks',
    'OSI and TCP/IP layers, IP addressing and subnetting (CIDR, number of hosts), TCP vs UDP, three-way handshake, flow and congestion control, routing basics, DNS, HTTP/HTTPS, switching, error detection (CRC, parity), network devices.'],
];

function prompt([section, topicSlug, topicName, subSlug, subName, coverage, format]) {
  const sec = SECTIONS[section];
  const tags = sec.tags.map((t) => `\`${t}\``).join(', ');
  return `# Generate ${TOTAL} questions: ${sec.name} › ${topicName} › ${subName}

You are working on **Aptric**, a daily aptitude practice app for Indian placement and competitive exams. Your job in this session: write **${TOTAL} original multiple-choice questions** for one subtopic and store them directly in the Supabase database using the Supabase MCP tools (\`execute_sql\`). Do not write files or change code; the database is the only output.

## Target

| | |
| --- | --- |
| Section | ${sec.name} (\`${section}\`) |
| Topic | ${topicName} (\`${topicSlug}\`) |
| Subtopic | ${subName} (\`${subSlug}\`) |
| Count | ${TOTAL}: ${MIX.easy} easy, ${MIX.medium} medium, ${MIX.hard} hard |

**Cover:** ${coverage} Spread the ${TOTAL} questions across all of these; no single idea should take more than about a fifth of the set.
${format ? `\n**Format for this subtopic:** ${format}\n` : ''}
**Difficulty:**
- **easy**: one or two steps, a single standard formula or idea; under a minute for a prepared candidate.
- **medium**: two to four steps or a combination of two ideas; typical of TCS NQT, AMCAT and Infosys.
- **hard**: multi-step reasoning, a non-obvious insight or careful case analysis; the hard end of CAT / bank PO, still solvable without a calculator in under four minutes.

## Step 1: check the database

Load the Supabase MCP tools (use ToolSearch for \`execute_sql\` and \`list_projects\` if they are deferred) and pick the Aptric project (\`list_projects\`; ask me if more than one could be it). Then run:

\`\`\`sql
select st.id as subtopic_id,
       (select count(*) from public.questions q where q.subtopic_id = st.id and q.status <> 'retired') as existing
from public.subtopics st
join public.topics t   on t.id = st.topic_id
join public.sections s on s.id = t.section_id
where s.slug = '${section}' and t.slug = '${topicSlug}' and st.slug = '${subSlug}';
\`\`\`

If no row comes back, stop and tell me: the taxonomy is not seeded. If \`existing\` is above 0, read the existing stems so you don't repeat them:

\`\`\`sql
select q.difficulty, left(q.stem, 300) as stem
from public.questions q
where q.subtopic_id = '<subtopic_id>' and q.status <> 'retired'
order by q.created_at desc
limit 200;
\`\`\`

## Step 2: write the questions (in 5 batches of 10)

Work in batches of 10 (each batch a mix of difficulties; across all five batches hit exactly ${MIX.easy} easy / ${MIX.medium} medium / ${MIX.hard} hard). For every question produce:

- \`stem\`: the full question in Markdown, self-contained (every number, fact, table or code it needs). Use KaTeX for maths (\`$\\frac{3}{4}$\`, \`$x^2$\`). Vary names, contexts and numbers; Indian context (₹, Indian names and cities) is welcome. No trivially reworded copies of another question (same structure with only numbers or names changed).
- \`options\`: exactly 4 distinct strings, no "A)"/"1." labels. Wrong options must be plausible (the results of common mistakes). Never "None of these" or "All of the above" (except where the format for this subtopic says otherwise).
- \`correct_index\`: 0-based index (0–3) of the single correct option. Spread the correct answer evenly over positions 0–3.
- \`difficulty\`: \`easy\`, \`medium\` or \`hard\`.
- \`est_seconds\`: seconds a prepared candidate needs (about 30–60 easy, 60–120 medium, 120–240 hard).
- \`explanation\`: a step-by-step Markdown solution that ends at the correct option.
- \`hint\`: one sentence pointing to the method without giving the answer, or \`null\`.
- \`tags\`: 1–3 exam tags from ${tags} that the question style fits.

**Verify before inserting.** For every question, solve it again from scratch without looking at your key, as an examiner would. Check the arithmetic digit by digit, that exactly one option is correct, that no wrong option is also defensible, and that the explanation agrees with the keyed option. Fix or replace any question that fails. Quality over speed: a wrong answer key is the worst possible outcome.

## Step 3: insert each batch

Insert each verified batch with one \`execute_sql\` call using exactly this statement, replacing only the JSON array between the \`$json$\` markers. The JSON must be valid: escape backslashes (\`\\\\frac\`) and double quotes (\`\\"\`) inside strings; no other SQL escaping is needed inside the \`$json$\` quotes. Questions go in as \`in_review\`, so an admin approves them in the review queue before learners see them.

\`\`\`sql
with sub as (
  select st.id
  from public.subtopics st
  join public.topics t   on t.id = st.topic_id
  join public.sections s on s.id = t.section_id
  where s.slug = '${section}' and t.slug = '${topicSlug}' and st.slug = '${subSlug}'
),
input as (
  select distinct on (h.hash) x.*, h.opts, h.hash
  from jsonb_to_recordset($json$
[
  {"stem": "...", "options": ["...", "...", "...", "..."], "correct_index": 0, "difficulty": "easy",
   "est_seconds": 45, "explanation": "...", "hint": "...", "tags": ["tcs-nqt"]}
]
$json$::jsonb) as x(stem text, options jsonb, correct_index int, difficulty public.question_difficulty,
                    est_seconds int, explanation text, hint text, tags text[])
  cross join lateral (
    select array(select jsonb_array_elements_text(x.options)) as opts,
           private.content_hash(x.stem, array(select jsonb_array_elements_text(x.options))) as hash
  ) h
  where jsonb_array_length(x.options) = 4 and x.correct_index between 0 and 3
  order by h.hash
),
new_q as (
  insert into public.questions (subtopic_id, stem, difficulty, est_seconds, status, source, content_hash, model, prompt_version)
  select sub.id, i.stem, i.difficulty, i.est_seconds, 'in_review', 'ai', i.hash, 'claude-code', '${PROMPT_VERSION}'
  from input i cross join sub
  on conflict (content_hash) do nothing
  returning id, content_hash
),
new_opts as (
  insert into public.question_options (question_id, position, body)
  select q.id, (o.ord - 1)::smallint, o.body
  from new_q q
  join input i on i.hash = q.content_hash
  cross join lateral unnest(i.opts) with ordinality as o (body, ord)
  returning id, question_id, position
),
new_keys as (
  insert into public.question_answers (question_id, correct_option_id, explanation, hint)
  select q.id, o.id, i.explanation, nullif(i.hint, '')
  from new_q q
  join input i    on i.hash = q.content_hash
  join new_opts o on o.question_id = q.id and o.position = i.correct_index
  returning question_id
),
new_tags as (
  insert into public.question_tags (question_id, tag)
  select distinct q.id, tg
  from new_q q
  join input i on i.hash = q.content_hash
  cross join lateral unnest(i.tags) as tg
  where tg in (select slug from public.tags)
  returning question_id
)
select (select count(*) from input)    as valid_unique,
       (select count(*) from new_q)    as inserted,
       (select count(*) from new_keys) as keyed,
       (select count(*) from new_tags) as tags_added;
\`\`\`

\`valid_unique\` below 10 means some items had the wrong option count, an out-of-range \`correct_index\`, or duplicated another item in the batch. \`inserted\` below \`valid_unique\` means those questions already exist in the bank (same normalised stem and options). \`keyed\` must equal \`inserted\`. Write replacements for anything that was dropped, so the subtopic ends with ${TOTAL} new questions. If the statement errors, nothing in that batch was saved: fix the JSON and run it again.

## Step 4: confirm

\`\`\`sql
select q.difficulty, count(*) as questions, count(a.question_id) as with_answer_key
from public.questions q
left join public.question_answers a on a.question_id = q.id
where q.subtopic_id = '<subtopic_id>' and q.prompt_version = '${PROMPT_VERSION}'
group by q.difficulty
order by q.difficulty;
\`\`\`

Every question must have an answer key, and the counts must be ${MIX.easy} easy, ${MIX.medium} medium, ${MIX.hard} hard (more if this prompt was run before). Finish by telling me the totals per difficulty, how many were dropped as duplicates, and anything you were unsure about.
`;
}

function slugFile(i, row) {
  return `${String(i + 1).padStart(2, '0')}-${row[0]}--${row[3]}.md`;
}

for (const f of readdirSync(OUT)) if (/^\d\d-.*\.md$/.test(f)) rmSync(join(OUT, f));
mkdirSync(OUT, { recursive: true });

SUBTOPICS.forEach((row, i) => writeFileSync(join(OUT, slugFile(i, row)), prompt(row)));

let index = `# Question bank prompts

One Claude Code prompt per subtopic (${SUBTOPICS.length} in all). Each prompt has a session write ${TOTAL} questions (${MIX.easy} easy, ${MIX.medium} medium, ${MIX.hard} hard) for its subtopic, re-solve every one, and insert them straight into Supabase through the Supabase MCP server. Run each in its own session so they can go in parallel.

**How to use:** open a new Claude Code session with the Supabase connector enabled, paste the contents of one file below, and let it run. Questions are inserted as \`in_review\` with \`source = 'ai'\`, \`model = 'claude-code'\` and \`prompt_version = '${PROMPT_VERSION}'\`, so they show up in the admin review queue and can be found or rolled back together:

\`\`\`sql
select count(*) from public.questions where prompt_version = '${PROMPT_VERSION}';
\`\`\`

Exact duplicates are skipped by \`content_hash\`, so re-running a prompt is safe. These questions have no embeddings yet; the API's generation pipeline embeds them the next time it runs in their subtopic, so later AI jobs still de-duplicate against them.

The files are generated: edit \`build.mjs\` and run \`node prompts/question-bank/build.mjs\`.

| # | Section | Topic | Subtopic | Prompt |
| --- | --- | --- | --- | --- |
`;
SUBTOPICS.forEach((row, i) => {
  const f = slugFile(i, row);
  index += `| ${i + 1} | ${SECTIONS[row[0]].name} | ${row[2]} | ${row[4]} | [${f}](${f}) |\n`;
});
writeFileSync(join(OUT, 'README.md'), index);
console.log(`wrote ${SUBTOPICS.length} prompts to ${OUT}`);
