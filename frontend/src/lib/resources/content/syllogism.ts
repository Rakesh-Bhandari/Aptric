import type { EducationalTopicContent } from '../types';

export const SYLLOGISM_CONTENT: EducationalTopicContent = {
  documentId: 'APT-PUB-29',
  sectionSlug: 'logical-reasoning',
  sectionName: 'Logical Reasoning',
  topicSlug: 'deductive-reasoning',
  topicName: 'Deductive Reasoning',
  subtopicSlug: 'syllogism',
  subtopicName: 'Syllogism',
  title: 'Syllogisms: Categorical Propositions, "Only a Few", and Venn Logic',
  learningObjective:
    'Master standard 4-proposition categorical syllogisms, modern placement patterns ("Only a few", "At least some"), minimal-overlap Venn diagram techniques, and formal possibility evaluation.',
  introduction:
    'A syllogism is a form of deductive reasoning where a conclusion is drawn from two or more given premises. In aptitude exams (TCS NQT, Infosys, Cognizant, IBPS PO, SBI PO), syllogisms test whether you can adhere strictly to deductive logic without allowing real-world facts or intuition to distort the validity of a conclusion. If a premise states "All cats are dogs", you must accept it as absolute truth within the logical universe of that question.',
  prerequisites: [
    { title: 'Venn Diagrams (2-set and 3-set fundamentals)' },
    { title: 'Basic Propositional Logic' },
  ],
  coreConcepts: [
    {
      heading: '1. The Four Categorical Propositions',
      body: 'Standard syllogisms utilize four classical proposition types:\n- **A-type (Universal Positive):** "All S are P" (Every member of set S is inside set P; $S \\subseteq P$).\n- **E-type (Universal Negative):** "No S is P" (Sets S and P are completely disjoint; $S \\cap P = \\emptyset$).\n- **I-type (Particular Positive):** "Some S are P" (There is an intersection of at least one element; $S \\cap P \\neq \\emptyset$).\n- **O-type (Particular Negative):** "Some S are not P" (There is at least one element in S that is outside P).',
    },
    {
      heading: '2. Definite Conclusion vs Possibility',
      body: 'A conclusion is logically valid (definite) if and only if it holds true across EVERY conceivable valid Venn diagram that satisfies the premises. If there exists even one diagram where the conclusion fails, it is not definitely true. Conversely, a "possibility" conclusion is valid if there exists AT LEAST ONE valid Venn diagram where it can hold without violating any given premise.',
    },
    {
      heading: '3. Modern Keywords: "Only a Few", "Each", "Seldom"',
      body: 'Modern recruitment and banking tests use nuanced qualifiers:\n- **"Only a few A are B":** This combines TWO statements: "Some A are B" AND "Some A are NOT B". It strictly prevents "All A are B" from ever being a possibility.\n- **"Only A are B":** Means "All B are A", and no other category can ever be B.\n- **"At least some / A few / Frequently / Many":** All mathematically translate to standard "Some".',
    },
  ],
  definitionsAndNotation: [
    { term: 'Premise', definition: 'A given statement accepted as indisputable fact for the duration of the problem.' },
    { term: 'Conclusion', definition: 'A deduced statement that must follow inevitably from the premises.' },
    { term: 'Basic (Minimal Overlap) Diagram', definition: 'A Venn diagram drawn showing only the minimum required relationship demanded by the premises.' },
    { term: 'Complementary Pair (Either-Or)', definition: 'Two conclusions having the same subject and predicate where one is positive and one is negative (e.g. Some A are B + No A is B), neither being individually certain, but together exhausting all possibilities.' },
  ],
  formulas: [
    {
      name: 'Conversion Rules for Propositions',
      formula: '\\text{All S are P} \\implies \\text{Some P are S}; \\quad \\text{No S is P} \\implies \\text{No P is S}; \\quad \\text{Some S are P} \\implies \\text{Some P are S}',
      explanation: 'States the valid reciprocal inferences that can be drawn from single categorical statements.',
      assumptions: '"Some S are not P" does NOT convert to "Some P are not S".',
    },
    {
      name: 'The "Only a Few" Decomposition',
      formula: '\\text{Only a few } A \\text{ are } B \\iff (\\text{Some } A \\text{ are } B) \\land (\\text{Some } A \\text{ are not } B)',
      explanation: 'Essential modern rule: ensures positive overlap while guaranteeing non-overlap exists.',
      assumptions: 'Set A cannot be fully enclosed within Set B.',
    },
    {
      name: 'Either-Or Complementary Conditions',
      formula: '1. \\text{ Same subject and predicate} \\quad 2. \\text{ Both individual conclusions false} \\quad 3. \\text{ One positive, one negative pair}',
      explanation: 'Satisfying all 3 conditions guarantees an "Either I or II follows" verdict.',
      assumptions: 'Valid pairs: (Some + No) or (All + Some not). The pair (All + No) is NOT an either-or pair.',
    },
  ],
  workedExamples: [
    {
      title: 'Example 1: Standard Placement Syllogism',
      difficulty: 'easy',
      examContext: 'TCS NQT / Wipro Quantitative Reasoning',
      question:
        '**Statements:**\n1. All laptops are devices.\n2. All devices are electronics.\n\n**Conclusions:**\nI. All laptops are electronics.\nII. Some electronics are laptops.\n\nWhich of the conclusions logically follows?',
      solution:
        '1. Translate statements into set inclusions:\n   - Laptops $\\subseteq$ Devices.\n   - Devices $\\subseteq$ Electronics.\n2. Transitivity: Laptops $\\subseteq$ Devices $\\subseteq$ Electronics $\\implies$ Laptops $\\subseteq$ Electronics.\n3. Evaluate Conclusion I: "All laptops are electronics" $\\implies$ True by transitivity.\n4. Evaluate Conclusion II: Since the set Laptops is a non-empty subset of Electronics, there exist elements in Electronics that are Laptops ("Some electronics are laptops") $\\implies$ True.\n5. Therefore, both Conclusion I and II follow.',
      verification: 'Draw concentric circles: Laptops inside Devices, Devices inside Electronics. Both statements hold in every valid rendering.',
      answer: 'Both conclusions I and II follow.',
    },
    {
      title: 'Example 2: The "Only a Few" Banking Pattern',
      difficulty: 'medium',
      examContext: 'IBPS PO / SBI PO Prelims / Infosys DSE',
      question:
        '**Statements:**\n1. Only a few rivers are lakes.\n2. All lakes are oceans.\n3. No ocean is a pond.\n\n**Conclusions:**\nI. Some rivers are oceans.\nII. All rivers can never be lakes.\nIII. No lake is a pond.\n\nWhich conclusions follow?',
      solution:
        '1. Deconstruct statements:\n   - Statement 1: "Only a few rivers are lakes" means Some rivers are lakes AND Some rivers are NOT lakes.\n   - Statement 2: All lakes are oceans (Lakes $\\subseteq$ Oceans).\n   - Statement 3: Oceans $\\cap$ Ponds = $\\emptyset$.\n2. Analyze Conclusion I ("Some rivers are oceans"):\n   - The part of rivers that overlaps with lakes is also inside oceans (since All lakes are oceans).\n   - Thus, Some rivers are definitely oceans. (Conclusion I follows).\n3. Analyze Conclusion II ("All rivers can never be lakes"):\n   - Statement 1 explicitly demands that "Some rivers are NOT lakes".\n   - Therefore, it is impossible for All rivers to become lakes.\n   - Thus, Conclusion II follows.\n4. Analyze Conclusion III ("No lake is a pond"):\n   - Lakes are inside oceans. Oceans have zero overlap with ponds.\n   - Therefore, lakes can never touch ponds. (Conclusion III follows).\n5. All conclusions I, II, and III follow.',
      verification: 'Test the possibility: Can all rivers be lakes? No, directly contradicts "only a few". Can any lake be a pond? No, violates "no ocean is a pond". Verified.',
      answer: 'All conclusions I, II, and III follow.',
    },
    {
      title: 'Example 3: Possibility and Disjoint Sets',
      difficulty: 'hard',
      examContext: 'CAT Logical Reasoning / SBI PO Mains',
      question:
        '**Statements:**\n1. Some red are blue.\n2. Some blue are green.\n3. No green is yellow.\n\n**Conclusions:**\nI. Some red being yellow is a possibility.\nII. All blue can never be yellow.\n\nWhich conclusions follow?',
      solution:
        '1. Analyze Conclusion I ("Some red being yellow is a possibility"):\n   - Yellow only has a restriction against Green (No green is yellow).\n   - There is no direct or indirect restriction between Red and Yellow.\n   - We can easily draw a diagram where Yellow intersects Red without touching Green.\n   - Since a valid diagram exists, this possibility is TRUE. Conclusion I follows.\n2. Analyze Conclusion II ("All blue can never be yellow"):\n   - Part of Blue overlaps with Green ("Some blue are green").\n   - That specific portion of Blue that is Green can NEVER be Yellow (because No green is yellow).\n   - Therefore, the entire set of Blue can never be inside Yellow.\n   - This is a definite fact: All blue can never be yellow.\n   - Conclusion II follows.\n3. Both conclusions I and II follow.',
      verification: 'Try to put all blue inside yellow: this would force the blue-green overlap inside yellow, contradicting "no green is yellow". Thus Conclusion II is ironclad.',
      answer: 'Both conclusions I and II follow.',
    },
  ],
  alternativeMethods: [
    {
      name: 'The Minimal-Overlap Venn Technique',
      description:
        'Draw the basic diagram with minimum possible intersections between circles. Use this baseline to quickly test definite conclusions. If a definite conclusion fails in the minimal diagram, discard it immediately. For possibility conclusions, intentionally draw maximum permissible overlap to see if any premise is violated.',
      whenValid: 'Applicable to 100% of syllogism types, especially complex 4-statement scenarios.',
      whenItFails: 'Requires strict discipline to avoid drawing unstated overlaps in the basic diagram.',
    },
    {
      name: 'The 100-50 Tick-Cross Method',
      description:
        'Assign weights: Universal statements distribute their subject (100); Negative statements distribute their predicate (100); Particular statements do not distribute (50). An undistributed term (50) in premises can never become distributed (100) in conclusions.',
      whenValid: 'Fast for simple 2-statement classic syllogisms without drawing diagrams.',
      whenItFails: 'Extremely cumbersome and error-prone for modern "Only a few" and "Possibility" statements.',
    },
  ],
  tipsAndTricks: [
    '"Can be" indicates a possibility check; "Can never be" indicates a definite negative assertion.',
    'If all premises are positive, no definite negative conclusion can ever follow.',
    'A statement like "Only dogs are cats" converts to "All cats are dogs" with the strict rule that cats cannot overlap with anything else.',
    'Always verify both terms in an "Either-Or" choice: they must have the same subject and predicate and complementary signs (e.g., Some + No).',
  ],
  commonMistakes: [
    {
      mistake: 'Assuming "Some A are B" implies "Some A are not B".',
      whyItHappens: 'In colloquial human conversation, "some" often implies "not all". In formal logic, "Some" strictly means "at least one", which is completely compatible with "All".',
      howToAvoid: 'Never assume the negative half of "some" unless the statement explicitly says "Only a few".',
    },
    {
      mistake: 'Treating "All A are B and No B is C" as an Either-Or pair.',
      whyItHappens: 'Confusing contrary statements with contradictory statements.',
      howToAvoid: 'Remember that "All" and "No" can both be false at the same time. The valid pairs are (Some + No) and (All + Some not).',
    },
    {
      mistake: 'Using real-world factual knowledge to evaluate conclusions.',
      whyItHappens: 'Common sense intuition overrides deductive rules.',
      howToAvoid: 'Treat premise categories as abstract algebraic sets ($X, Y, Z$) to avoid emotional or empirical bias.',
    },
  ],
  difficultyProgression: [
    {
      level: 'Foundational (Easy)',
      characteristics: '2 simple premises (All / Some); direct transitive conclusions; no negative statements.',
      typicalExam: 'TCS NQT Foundation, Wipro, Capgemini.',
    },
    {
      level: 'Standard (Medium)',
      characteristics: '3 premises involving "No" and "Some not"; basic possibility conclusions; Either-Or cases.',
      typicalExam: 'Infosys DSE, Cognizant GenC Next, Bank PO Prelims.',
    },
    {
      level: 'Advanced (Hard)',
      characteristics: 'Complex 4-premise sets with "Only a few", "Can never be", and multiple nested possibilities.',
      typicalExam: 'SBI PO Mains, IBPS PO Mains, CAT LR.',
    },
  ],
  practiceQuestions: [
    {
      id: 'syl-pq-1',
      stem: '**Statements:**\n1. All pens are markers.\n2. Some markers are erasers.\n\n**Conclusions:**\nI. Some pens are erasers.\nII. Some erasers are markers.\n\nWhich conclusion(s) follow?',
      options: ['Only I follows', 'Only II follows', 'Either I or II follows', 'Both I and II follow'],
      correctIndex: 1,
      difficulty: 'easy',
      explanation:
        'Conclusion I: There is no necessary overlap between pens and erasers; they may be completely separate. Thus I does not follow.\nConclusion II: Since Some markers are erasers, it converts directly to Some erasers are markers. Thus II follows.',
    },
    {
      id: 'syl-pq-2',
      stem: '**Statements:**\n1. No car is a bike.\n2. All bikes are trucks.\n\n**Conclusions:**\nI. No car is a truck.\nII. Some trucks are bikes.\n\nWhich conclusion(s) follow?',
      options: ['Only I follows', 'Only II follows', 'Either I or II follows', 'Both I and II follow'],
      correctIndex: 1,
      difficulty: 'easy',
      explanation:
        'Conclusion I: Car cannot be bike, but truck is larger than bike and can easily enclose car without touching bike. Thus I does not follow.\nConclusion II: All bikes are trucks $\\implies$ Some trucks are bikes. Thus II definitely follows.',
    },
    {
      id: 'syl-pq-3',
      stem: '**Statements:**\n1. Some apples are mangoes.\n2. No mango is a banana.\n\n**Conclusions:**\nI. Some apples are not bananas.\nII. All bananas can be apples.\n\nWhich conclusion(s) follow?',
      options: ['Only I follows', 'Only II follows', 'Neither I nor II follows', 'Both I and II follow'],
      correctIndex: 3,
      difficulty: 'medium',
      explanation:
        'Conclusion I: The portion of apples that are mangoes can never be bananas (since No mango is a banana). Thus, those apples are not bananas. I definitely follows.\nConclusion II: Bananas cannot touch mangoes, but they can easily sit inside the non-mango portion of apples. Thus it is a valid possibility. II follows. Both follow.',
    },
    {
      id: 'syl-pq-4',
      stem: '**Statements:**\n1. Only a few books are novel.\n2. All novels are stories.\n\n**Conclusions:**\nI. All books can never be novels.\nII. Some stories are books.\n\nWhich conclusion(s) follow?',
      options: ['Only I follows', 'Only II follows', 'Neither I nor II follows', 'Both I and II follow'],
      correctIndex: 3,
      difficulty: 'medium',
      explanation:
        'Statement 1 says "Only a few books are novel" $\\implies$ Some books are NOT novels. Therefore, All books can never be novels (Conclusion I follows).\nSince books overlap with novels, and all novels are stories, stories must overlap with books (Conclusion II follows). Both follow.',
    },
    {
      id: 'syl-pq-5',
      stem: '**Statements:**\n1. Some tables are chairs.\n2. Some chairs are desks.\n\n**Conclusions:**\nI. Some tables are desks.\nII. No table is a desk.\n\nWhich conclusion(s) follow?',
      options: ['Only I follows', 'Only II follows', 'Either I or II follows', 'Neither I nor II follows'],
      correctIndex: 2,
      difficulty: 'medium',
      explanation:
        'Neither I nor II follows definitely on its own. However, they share the same subject (tables) and predicate (desks), one is a particular positive (Some) and the other is a universal negative (No). Either desks intersect tables, or they do not. Therefore, this forms a perfect complementary pair: Either I or II follows.',
    },
  ],
  revisionSummary: [
    '"All A are B" $\\implies$ Some B are A. "No A is B" $\\implies$ No B is A. "Some A are B" $\\implies$ Some B are A.',
    '"Only a few A are B" = (Some A are B) + (Some A are not B).',
    'Possibility is true if AT LEAST ONE valid diagram works without contradicting premises.',
    'Either-Or requires: Same subject & predicate, both individually indefinite, and a (Some + No) or (All + Some not) relationship.',
  ],
  faqs: [
    {
      question: 'What is the exact meaning of "Only a few" in syllogisms?',
      answer:
        '"Only a few A are B" is a compound statement: it means that while some A are indeed B, there is also definitely another portion of A that is NOT B. This means that "All A are B" can NEVER be true, even as a possibility.',
    },
    {
      question: 'Why is "All A are B" and "No A is B" not an Either-Or pair?',
      answer:
        'In formal logic, two contrary statements can both be false at the same time. For example, if "Some A are B and Some A are not B" is true, then both "All A are B" is false and "No A is B" is false. Since both can be simultaneously false, they do not exhaust all possibilities and cannot form an Either-Or pair.',
    },
    {
      question: 'Should real-world knowledge affect a syllogism answer?',
      answer: 'No. Treat the premises as the complete logical universe and select only conclusions that necessarily follow from them, even if the premises describe an unusual situation.',
    },
  ],
  relatedTopics: [
    {
      title: 'Venn Diagrams',
      href: '/resources/logical-reasoning/non-verbal-reasoning/venn-diagrams',
      relationship: 'prerequisite',
      description: 'Teaches spatial set intersections used to model syllogism truth diagrams.',
    },
    {
      title: 'Statement & Conclusion',
      href: '/resources/logical-reasoning/deductive-reasoning/statement-and-conclusion',
      relationship: 'next-step',
      description: 'Extends formal deductive rigor to qualitative verbal arguments and policies.',
    },
  ],
  editorialReview: 'Editorial review pending; this material has not been independently certified.',
};
