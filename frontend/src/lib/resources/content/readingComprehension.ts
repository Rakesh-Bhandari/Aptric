import type { EducationalTopicContent } from '../types';

export const READING_COMPREHENSION_CONTENT: EducationalTopicContent = {
  documentId: 'APT-PUB-35',
  sectionSlug: 'verbal-ability',
  sectionName: 'Verbal Ability',
  topicSlug: 'reading',
  topicName: 'Reading',
  subtopicSlug: 'reading-comprehension',
  subtopicName: 'Reading Comprehension',
  title: 'Reading Comprehension: Structural Mapping, Author Tone, and Inferential Deduction',
  learningObjective:
    'Master structural paragraph mapping, main idea synthesis, tone and register identification, evidence-based inferential deduction, and elimination of out-of-scope answer traps under strict placement time constraints.',
  introduction:
    'Reading Comprehension (RC) is the cornerstone of Verbal Ability assessments across TCS NQT, Infosys, CAT, XAT, and Bank PO exams. Rather than testing passive reading speed, modern aptitude RC evaluates active analytical processing: can you distinguish the author\'s central thesis from mere supporting data? Can you deduce unstated but mandatory logical consequences without falling for emotionally attractive or extreme distractors?',
  prerequisites: [
    { title: 'Sentence Structure and Grammar', href: '/resources/verbal-ability/grammar/sentence-correction' },
    { title: 'Contextual Vocabulary', href: '/resources/verbal-ability/vocabulary/synonyms-and-antonyms' },
  ],
  coreConcepts: [
    {
      heading: '1. Structural Paragraph Mapping',
      body: 'Do not attempt to memorize factual details during your first read. Instead, construct a mental map of paragraph functions:\n- **Paragraph 1:** What issue is introduced? Is the author taking a stance or surveying existing perspectives?\n- **Paragraph 2–3:** Are these supporting examples, counter-arguments, or technological shifts?\n- **Conclusion:** Did the author offer a resolution, a warning, or a neutral summary?\nWhen a question refers to a specific detail, your mental map guides you straight to the relevant sentence without frantic re-reading.',
    },
    {
      heading: '2. The Inference Contract: What Must Be True',
      body: 'In aptitude tests, an **inference** is not an imaginative guess or a plausible real-world possibility. An inference is a statement that MUST be true if the passage is assumed to be true. If a passage states: "All modern autonomous vehicles tested in urban centers require LIDAR sensors", you can validly infer: "An autonomous vehicle operating without LIDAR has not been validated in urban testing." You cannot infer: "LIDAR is superior to camera-only vision systems"—even if that happens to be true in the real world.',
    },
    {
      heading: '3. Identifying Author Tone and Attitude',
      body: 'Tone reflects the author\'s emotional and intellectual orientation toward the subject matter:\n- **Analytical / Objective:** Uses neutral data, balanced pros/cons, and avoids emotive adjectives.\n- **Critical / Skeptical:** Questions underlying assumptions, highlights flaws, and uses cautious modifiers ("purportedly", "dubious").\n- **Didactic:** Intends to educate, instruct, or impart an ethical or technical principle.\n- **Dogmatic:** Expresses personal opinions as unassailable truths with absolutist wording.',
    },
  ],
  definitionsAndNotation: [
    { term: 'Central Idea / Primary Purpose', definition: 'The overarching reason the author wrote the passage; must encompass the entire argument, not merely one illustrative paragraph.' },
    { term: 'Valid Inference', definition: 'A deductive conclusion that logically cannot be false if the text\'s statements are true.' },
    { term: 'Extreme Distractor', definition: 'A trap option containing absolutist words ("always", "never", "only", "completely", "must") when the author was cautious or qualified.' },
    { term: 'Distortion Trap', definition: 'An answer choice that reuses identical vocabulary from the text but alters the causal direction or relation between words.' },
  ],
  formulas: [
    {
      name: 'The Four-Step RC Answering Protocol',
      formula: '\\text{Map Text Structure} \\longrightarrow \\text{Read Question Stem} \\longrightarrow \\text{Pre-phrase Answer} \\longrightarrow \\text{Eliminate Distractors}',
      explanation: 'Prevents being misled by persuasive answer choices that sound reasonable but answer a different question.',
      assumptions: 'Never look at options before formulating an initial unassisted answer prediction.',
    },
    {
      name: 'Option Elimination Criteria',
      formula: '\\text{Reject if: } \\text{Out of Scope} \\lor \\text{Extreme / Absolutist} \\lor \\text{Opposite / Distorted} \\lor \\text{True but Irrelevant}',
      explanation: 'Systematic filter ensuring that only unassailable evidence-backed choices survive.',
      assumptions: 'The correct choice may be rephrased in unfamiliar synonyms rather than verbatim text.',
    },
  ],
  workedExamples: [
    {
      title: 'Example 1: Passage Analysis & Main Idea',
      difficulty: 'medium',
      examContext: 'Campus Recruitment / TCS NQT Verbal Section',
      question:
        '**Read the passage:**\n"Artificial intelligence tools in modern software development have dramatically compressed the time required for boilerplate generation and routine refactoring. However, engineering velocity metrics that measure only lines of code or pull-request frequency risk mistaking volume for value. High-velocity generation without proportional automated regression testing and architectural oversight often accelerates the accumulation of technical debt, resulting in fragile systems that become disproportionately costly to maintain."\n\n**Question:** Which of the following best expresses the primary purpose of the author?\n\n**Options:**\nA) To advocate for a complete ban on artificial intelligence tools in production codebases.\nB) To argue that software engineering velocity metrics must be balanced with quality assurance and system architecture.\nC) To prove that manual coding produces fewer architectural defects than automated generation.\nD) To praise the unprecedented reduction in software delivery timelines achieved by modern tools.',
      solution:
        '1. Analyze paragraph structure:\n   - Line 1 acknowledges benefits of AI (shorter boilerplate generation time).\n   - Line 2 introduces contrast ("However...") critiquing simple velocity metrics.\n   - Line 3 explains the hazard: unmonitored velocity accelerates technical debt.\n2. Evaluate options:\n   - Option A is an **Extreme Distractor** ("complete ban"). The author acknowledges AI advantages in line 1.\n   - Option B matches the author\'s thesis: velocity metrics without architectural oversight and testing lead to debt.\n   - Option C is **Out of Scope**; the author never compares manual coding metrics with AI.\n   - Option D captures only the concession in line 1, ignoring the entire second half.\n3. Option B is the unambiguous primary purpose.',
      verification: 'Option B accurately synthesizes the full arc from velocity gains to the necessity of structural oversight.',
      answer: 'B) To argue that software engineering velocity metrics must be balanced with quality assurance and system architecture.',
    },
    {
      title: 'Example 2: Inferential Deduction Under Direct Textual Constraints',
      difficulty: 'hard',
      examContext: 'CAT Verbal / Bank PO Mains',
      question:
        '**Based on the passage in Example 1:**\nWhat can be logically inferred regarding engineering teams that evaluate developers exclusively by pull-request frequency?\n\n**Options:**\nA) They will inevitably suffer catastrophic production outages within six months.\nB) They are likely using automated testing suites superior to industry averages.\nC) They run the risk of incentivizing rapid code output at the expense of long-term maintainability.\nD) They fail to understand basic principles of modern agile software methodologies.',
      solution:
        '1. Check the exact text on velocity metrics: "engineering velocity metrics that measure only lines of code or pull-request frequency risk mistaking volume for value... accelerates the accumulation of technical debt, resulting in fragile systems that become disproportionately costly to maintain."\n2. Evaluate options:\n   - Option A is an **Extreme Distractor** ("inevitably suffer catastrophic outages within six months"). The text mentions risk of debt, not a six-month disaster countdown.\n   - Option B contradicts the text\'s point that high volume often lacks proportional automated testing.\n   - Option C directly paraphrases the author\'s argument: measuring only frequency risks volume over value and creates long-term maintainability costs.\n   - Option D is **Out of Scope**; the passage does not comment on developers\' knowledge of agile methodologies.\n3. Option C is the only mathematically and logically sound inference.',
      verification: 'Option C is directly grounded in lines 2–3 with no unsupported leaps.',
      answer: 'C) They run the risk of incentivizing rapid code output at the expense of long-term maintainability.',
    },
    {
      title: 'Example 3: Separating Evidence from an Unsupported Inference',
      difficulty: 'medium',
      examContext: 'Original reading-comprehension passage',
      question: 'Passage: “A pilot program reduced average bus delays on two routes during the first month. The transport agency said it would collect a full quarter of data before deciding whether to expand the program.” Which conclusion is best supported?',
      solution: '1. The passage reports an early improvement on two routes.\n2. The agency has not made a final expansion decision; it plans to collect more data first.\n3. It is therefore supported that the agency is evaluating the pilot further. It is not supported that the program will definitely expand or that the result will hold across the whole network.',
      verification: 'The answer follows directly from the stated plan to collect a full quarter of data. It avoids turning a limited early result into a universal claim.',
      answer: 'The agency is gathering additional evidence before deciding whether to expand the program.',
    },
  ],
  alternativeMethods: [
    {
      name: 'The Keywords In Context (KWIC) Reverse Search',
      description:
        'For specific factual questions, identify a unique anchor word in the question stem (e.g. "LIDAR", "amortization", "enzymatic") and scan directly to its occurrence in the passage. Read two sentences before and two sentences after to verify full context before selecting an answer.',
      whenValid: 'Fast for detail and factual retrieval questions.',
      whenItFails: 'Unusable for tone, central thesis, or overarching inference questions.',
    },
  ],
  tipsAndTricks: [
    'Beware of choices that reuse verbatim phrases from the passage; examiners frequently use exact words in wrong options to lure careless readers.',
    'Extreme words ("always", "never", "all", "impossible", "solely") are wrong over 80% of the time in RC options unless the author was explicitly absolutist.',
    'Look for transition signposts: "However", "Nevertheless", "In contrast" indicate that the author\'s true viewpoint is about to be revealed.',
    'Always read the question stem carefully: did it ask for "Which of the following does NOT support" or "Which is LEAST likely"?',
  ],
  commonMistakes: [
    {
      mistake: 'Selecting an option because it is a true real-world fact, even though it is not stated in or supported by the passage.',
      whyItHappens: 'Relying on prior domain knowledge rather than the text.',
      howToAvoid: 'Hold every answer choice strictly accountable to the four corners of the provided text.',
    },
    {
      mistake: 'Choosing an answer that reflects only one paragraph when asked for the Primary Purpose of the passage.',
      whyItHappens: 'Mistaking a local supporting example for the overarching central thesis.',
      howToAvoid: 'The primary purpose must encompass all paragraphs; if an option only summarizes paragraph 2, it is a narrow distractor.',
    },
  ],
  difficultyProgression: [
    {
      level: 'Foundational (Easy)',
      characteristics: 'Short 200-word passages; direct factual questions; vocabulary-in-context with obvious synonyms.',
      typicalExam: 'TCS NQT Foundation, Wipro, Capgemini.',
    },
    {
      level: 'Standard (Medium)',
      characteristics: '300–400 word passages; central theme synthesis; indirect inference; identifying tone.',
      typicalExam: 'Infosys DSE, Cognizant GenC Next, Bank PO Prelims.',
    },
    {
      level: 'Advanced (Hard)',
      characteristics: 'Dense abstract passages (philosophy, economics, cognitive science); subtle authorial stance; multi-level inference.',
      typicalExam: 'CAT VARC, XAT, GMAT.',
    },
  ],
  practiceQuestions: [
    {
      id: 'rc-pq-1',
      stem: 'Which tone is best exhibited by an author who writes: "While proponents champion quantum annealing as a panacea for cryptographic vulnerabilities, empirical benchmarks suggest such enthusiasm may be severely premature until decoherence rates are stabilized"?',
      options: ['Enthusiastic and celebratory', 'Cautious and skeptical', 'Dismissive and sarcastic', 'Indifferent and disinterested'],
      correctIndex: 1,
      difficulty: 'easy',
      explanation:
        'The author points out that enthusiasm "may be severely premature" and highlights required conditions ("until decoherence rates are stabilized"). This is reasoned, cautious skepticism, not celebration or emotional dismissal.',
    },
    {
      id: 'rc-pq-2',
      stem: 'If an author states that "urban green corridors have been shown to reduce ambient temperatures, yet metropolitan councils routinely deprioritize their maintenance due to budgetary shortfalls", which conclusion is most supported?',
      options: [
        'Metropolitan councils believe ambient temperatures have no effect on citizens.',
        'Financial considerations often override ecological interventions in municipal decisions.',
        'Urban green corridors are too expensive to be adopted in any modern city.',
        'Metropolitan councils will soon eliminate all public parks.',
      ],
      correctIndex: 1,
      difficulty: 'easy',
      explanation:
        'The text states councils deprioritize maintenance "due to budgetary shortfalls". This directly demonstrates that financial constraints override the recognized ecological benefit (reducing temperatures). Other options are extreme or unstated.',
    },
    {
      id: 'rc-pq-3',
      stem: 'Passage: “The library extended its opening hours during exam week. Attendance rose, but the report did not compare the period with a non-exam week.” Which statement is justified?',
      options: ['Longer hours alone caused the rise', 'Attendance rose during the extended-hours period', 'Attendance will rise every month', 'Students prefer libraries to online study'],
      correctIndex: 1,
      difficulty: 'easy',
      explanation: 'The passage directly reports a rise during the period. It does not establish causation or support claims about other months or study preferences.',
    },
    {
      id: 'rc-pq-4',
      stem: 'A passage presents a claim, then introduces a study with mixed results and ends by recommending more research. Which tone is most likely?',
      options: ['Cautiously analytical', 'Triumphant', 'Mocking', 'Unconditionally certain'],
      correctIndex: 0,
      difficulty: 'medium',
      explanation: 'Mixed evidence and a call for further research signal qualification and analysis rather than certainty, celebration, or ridicule.',
    },
    {
      id: 'rc-pq-5',
      stem: 'Passage: “Several small schools adopted the reading program. Teachers reported stronger participation, although standardized reading scores were not measured.” What cannot be concluded from this evidence alone?',
      options: ['Teachers reported stronger participation', 'The program was used in several small schools', 'The program improved standardized reading scores', 'The passage describes an adoption of the program'],
      correctIndex: 2,
      difficulty: 'medium',
      explanation: 'The passage explicitly says standardized reading scores were not measured, so improvement in those scores cannot be inferred.',
    },
  ],
  revisionSummary: [
    'Main Idea = What the author wants the reader to conclude across the ENTIRE text.',
    'Inference = What MUST be true based exclusively on textual premises.',
    'Extreme words ("always", "never", "only") almost always signal invalid distractors.',
    'Map paragraph functions during your first pass; retrieve granular details on demand.',
  ],
  faqs: [
    {
      question: 'Should I read the questions before reading the passage?',
      answer:
        'In placement exams with short passages (under 300 words), glancing at question stems for 20 seconds can prime your brain for key terms. For dense CAT/Bank PO passages, read the passage first to grasp overall flow, because inference questions require understanding context rather than keyword matching.',
    },
    {
      question: 'How do I handle passages on abstract topics I know nothing about?',
      answer:
        'A lack of domain knowledge can actually be an advantage because you won\'t bring outside biases into your deductions. Treat the terms like abstract variables and focus purely on the relationships and logical links the author constructs between them.',
    },
    {
      question: 'What is the difference between a plausible idea and a valid inference?',
      answer: 'A valid inference must follow from the passage. A plausible idea may be reasonable in the real world but still be unsupported by the text.',
    },
  ],
  relatedTopics: [
    {
      title: 'Para Jumbles',
      href: '/resources/verbal-ability/reading/para-jumbles',
      relationship: 'next-step',
      description: 'Applies structural transition and coherence analysis to reassemble disordered sentences.',
    },
    {
      title: 'Sentence Correction',
      href: '/resources/verbal-ability/grammar/sentence-correction',
      relationship: 'prerequisite',
      description: 'Strengthens syntactic comprehension of modifiers and clause relationships in complex sentences.',
    },
  ],
  editorialReview: 'Editorial review pending; this material has not been independently certified.',
};
