# Question bank prompts

One Claude Code prompt per subtopic (53 in all). Each prompt has a session write 50 questions (15 easy, 25 medium, 10 hard) for its subtopic, re-solve every one, and insert them straight into Supabase through the Supabase MCP server. Run each in its own session so they can go in parallel.

**How to use:** open a new Claude Code session with the Supabase connector enabled, paste the contents of one file below, and let it run. Questions are inserted as `in_review` with `source = 'ai'`, `model = 'claude-code'` and `prompt_version = 'claude-code-bank/2026-10-02.1'`, so they show up in the admin review queue and can be found or rolled back together:

```sql
select count(*) from public.questions where prompt_version = 'claude-code-bank/2026-10-02.1';
```

Exact duplicates are skipped by `content_hash`, so re-running a prompt is safe. These questions have no embeddings yet; the API's generation pipeline embeds them the next time it runs in their subtopic, so later AI jobs still de-duplicate against them.

The files are generated: edit `build.mjs` and run `node prompts/question-bank/build.mjs`.

| # | Section | Topic | Subtopic | Prompt |
| --- | --- | --- | --- | --- |
| 1 | Quantitative Aptitude | Arithmetic | Number System | [01-quantitative-aptitude--number-system.md](01-quantitative-aptitude--number-system.md) |
| 2 | Quantitative Aptitude | Arithmetic | Percentages | [02-quantitative-aptitude--percentages.md](02-quantitative-aptitude--percentages.md) |
| 3 | Quantitative Aptitude | Arithmetic | Profit & Loss | [03-quantitative-aptitude--profit-and-loss.md](03-quantitative-aptitude--profit-and-loss.md) |
| 4 | Quantitative Aptitude | Arithmetic | Simple & Compound Interest | [04-quantitative-aptitude--simple-and-compound-interest.md](04-quantitative-aptitude--simple-and-compound-interest.md) |
| 5 | Quantitative Aptitude | Arithmetic | Ratio & Proportion | [05-quantitative-aptitude--ratio-and-proportion.md](05-quantitative-aptitude--ratio-and-proportion.md) |
| 6 | Quantitative Aptitude | Arithmetic | Averages | [06-quantitative-aptitude--averages.md](06-quantitative-aptitude--averages.md) |
| 7 | Quantitative Aptitude | Arithmetic | Mixtures & Alligations | [07-quantitative-aptitude--mixtures-and-alligations.md](07-quantitative-aptitude--mixtures-and-alligations.md) |
| 8 | Quantitative Aptitude | Arithmetic | Problems on Ages | [08-quantitative-aptitude--problems-on-ages.md](08-quantitative-aptitude--problems-on-ages.md) |
| 9 | Quantitative Aptitude | Time, Work & Distance | Time & Work | [09-quantitative-aptitude--time-and-work.md](09-quantitative-aptitude--time-and-work.md) |
| 10 | Quantitative Aptitude | Time, Work & Distance | Pipes & Cisterns | [10-quantitative-aptitude--pipes-and-cisterns.md](10-quantitative-aptitude--pipes-and-cisterns.md) |
| 11 | Quantitative Aptitude | Time, Work & Distance | Time, Speed & Distance | [11-quantitative-aptitude--time-speed-distance.md](11-quantitative-aptitude--time-speed-distance.md) |
| 12 | Quantitative Aptitude | Time, Work & Distance | Problems on Trains | [12-quantitative-aptitude--trains.md](12-quantitative-aptitude--trains.md) |
| 13 | Quantitative Aptitude | Time, Work & Distance | Boats & Streams | [13-quantitative-aptitude--boats-and-streams.md](13-quantitative-aptitude--boats-and-streams.md) |
| 14 | Quantitative Aptitude | Counting & Probability | Permutations & Combinations | [14-quantitative-aptitude--permutations-and-combinations.md](14-quantitative-aptitude--permutations-and-combinations.md) |
| 15 | Quantitative Aptitude | Counting & Probability | Probability | [15-quantitative-aptitude--probability.md](15-quantitative-aptitude--probability.md) |
| 16 | Quantitative Aptitude | Geometry & Mensuration | Mensuration | [16-quantitative-aptitude--mensuration.md](16-quantitative-aptitude--mensuration.md) |
| 17 | Quantitative Aptitude | Geometry & Mensuration | Geometry | [17-quantitative-aptitude--geometry.md](17-quantitative-aptitude--geometry.md) |
| 18 | Quantitative Aptitude | Algebra | Equations & Inequalities | [18-quantitative-aptitude--equations-and-inequalities.md](18-quantitative-aptitude--equations-and-inequalities.md) |
| 19 | Quantitative Aptitude | Algebra | Progressions | [19-quantitative-aptitude--progressions.md](19-quantitative-aptitude--progressions.md) |
| 20 | Quantitative Aptitude | Algebra | Logarithms | [20-quantitative-aptitude--logarithms.md](20-quantitative-aptitude--logarithms.md) |
| 21 | Quantitative Aptitude | Data Sufficiency | Data Sufficiency | [21-quantitative-aptitude--data-sufficiency.md](21-quantitative-aptitude--data-sufficiency.md) |
| 22 | Logical Reasoning | Verbal Reasoning | Number & Letter Series | [22-logical-reasoning--series.md](22-logical-reasoning--series.md) |
| 23 | Logical Reasoning | Verbal Reasoning | Coding-Decoding | [23-logical-reasoning--coding-decoding.md](23-logical-reasoning--coding-decoding.md) |
| 24 | Logical Reasoning | Verbal Reasoning | Blood Relations | [24-logical-reasoning--blood-relations.md](24-logical-reasoning--blood-relations.md) |
| 25 | Logical Reasoning | Verbal Reasoning | Direction Sense | [25-logical-reasoning--direction-sense.md](25-logical-reasoning--direction-sense.md) |
| 26 | Logical Reasoning | Arrangements & Puzzles | Seating Arrangement | [26-logical-reasoning--seating-arrangement.md](26-logical-reasoning--seating-arrangement.md) |
| 27 | Logical Reasoning | Arrangements & Puzzles | Puzzles | [27-logical-reasoning--puzzles.md](27-logical-reasoning--puzzles.md) |
| 28 | Logical Reasoning | Arrangements & Puzzles | Input-Output | [28-logical-reasoning--input-output.md](28-logical-reasoning--input-output.md) |
| 29 | Logical Reasoning | Deductive Reasoning | Syllogism | [29-logical-reasoning--syllogism.md](29-logical-reasoning--syllogism.md) |
| 30 | Logical Reasoning | Deductive Reasoning | Statement & Conclusion | [30-logical-reasoning--statement-and-conclusion.md](30-logical-reasoning--statement-and-conclusion.md) |
| 31 | Logical Reasoning | Clocks & Calendars | Clocks | [31-logical-reasoning--clocks.md](31-logical-reasoning--clocks.md) |
| 32 | Logical Reasoning | Clocks & Calendars | Calendars | [32-logical-reasoning--calendars.md](32-logical-reasoning--calendars.md) |
| 33 | Logical Reasoning | Non-Verbal Reasoning | Cubes & Dice | [33-logical-reasoning--cubes-and-dice.md](33-logical-reasoning--cubes-and-dice.md) |
| 34 | Logical Reasoning | Non-Verbal Reasoning | Venn Diagrams | [34-logical-reasoning--venn-diagrams.md](34-logical-reasoning--venn-diagrams.md) |
| 35 | Verbal Ability | Reading | Reading Comprehension | [35-verbal-ability--reading-comprehension.md](35-verbal-ability--reading-comprehension.md) |
| 36 | Verbal Ability | Reading | Para Jumbles | [36-verbal-ability--para-jumbles.md](36-verbal-ability--para-jumbles.md) |
| 37 | Verbal Ability | Reading | Cloze Test | [37-verbal-ability--cloze-test.md](37-verbal-ability--cloze-test.md) |
| 38 | Verbal Ability | Grammar & Usage | Sentence Correction | [38-verbal-ability--sentence-correction.md](38-verbal-ability--sentence-correction.md) |
| 39 | Verbal Ability | Grammar & Usage | Fill in the Blanks | [39-verbal-ability--fill-in-the-blanks.md](39-verbal-ability--fill-in-the-blanks.md) |
| 40 | Verbal Ability | Vocabulary | Synonyms & Antonyms | [40-verbal-ability--synonyms-and-antonyms.md](40-verbal-ability--synonyms-and-antonyms.md) |
| 41 | Verbal Ability | Vocabulary | Idioms & Phrases | [41-verbal-ability--idioms-and-phrases.md](41-verbal-ability--idioms-and-phrases.md) |
| 42 | Data Interpretation | Tables & Caselets | Tables | [42-data-interpretation--tables.md](42-data-interpretation--tables.md) |
| 43 | Data Interpretation | Tables & Caselets | Caselets | [43-data-interpretation--caselets.md](43-data-interpretation--caselets.md) |
| 44 | Data Interpretation | Charts | Bar Charts | [44-data-interpretation--bar-charts.md](44-data-interpretation--bar-charts.md) |
| 45 | Data Interpretation | Charts | Line Graphs | [45-data-interpretation--line-graphs.md](45-data-interpretation--line-graphs.md) |
| 46 | Data Interpretation | Charts | Pie Charts | [46-data-interpretation--pie-charts.md](46-data-interpretation--pie-charts.md) |
| 47 | Data Interpretation | Mixed | Mixed Graphs | [47-data-interpretation--mixed-graphs.md](47-data-interpretation--mixed-graphs.md) |
| 48 | Technical Aptitude | Programming | Output Prediction | [48-technical-aptitude--output-prediction.md](48-technical-aptitude--output-prediction.md) |
| 49 | Technical Aptitude | Programming | Object-Oriented Programming | [49-technical-aptitude--oop.md](49-technical-aptitude--oop.md) |
| 50 | Technical Aptitude | Programming | Data Structures & Algorithms | [50-technical-aptitude--dsa.md](50-technical-aptitude--dsa.md) |
| 51 | Technical Aptitude | CS Fundamentals | DBMS | [51-technical-aptitude--dbms.md](51-technical-aptitude--dbms.md) |
| 52 | Technical Aptitude | CS Fundamentals | Operating Systems | [52-technical-aptitude--operating-systems.md](52-technical-aptitude--operating-systems.md) |
| 53 | Technical Aptitude | CS Fundamentals | Computer Networks | [53-technical-aptitude--computer-networks.md](53-technical-aptitude--computer-networks.md) |
