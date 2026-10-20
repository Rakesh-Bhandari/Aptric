import type { SectionMeta, SubtopicMeta, TopicMeta } from './types';

export const RESOURCE_SECTIONS: SectionMeta[] = [
  {
    id: 'sec-qa',
    slug: 'quantitative-aptitude',
    name: 'Quantitative Aptitude',
    description: 'Arithmetic, numerical computation, algebra, geometry, counting, and probability.',
    sortOrder: 1,
    iconName: 'Calculator',
    topics: [
      {
        id: 'top-qa-arithmetic',
        slug: 'arithmetic',
        name: 'Arithmetic',
        description: 'Core numerical operations, ratios, percentages, and financial math.',
        sortOrder: 1,
        sectionSlug: 'quantitative-aptitude',
        subtopics: [
          {
            id: 'sub-qa-01',
            slug: 'number-system',
            name: 'Number System',
            description: 'Divisibility rules, HCF & LCM, factors, cyclicity, remainders, and trailing zeroes.',
            sortOrder: 1,
            topicSlug: 'arithmetic',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: true,
          },
          {
            id: 'sub-qa-02',
            slug: 'percentages',
            name: 'Percentages',
            description: 'Fraction-percent equivalence, percentage change, successive discounts, and base conversions.',
            sortOrder: 2,
            topicSlug: 'arithmetic',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: true,
          },
          {
            id: 'sub-qa-03',
            slug: 'profit-and-loss',
            name: 'Profit & Loss',
            description: 'Cost price, selling price, markups, discounts, false weights, and break-even analysis.',
            sortOrder: 3,
            topicSlug: 'arithmetic',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-qa-04',
            slug: 'simple-and-compound-interest',
            name: 'Simple & Compound Interest',
            description: 'Annual/quarterly compounding, effective interest rate, CI-SI difference, and depreciation.',
            sortOrder: 4,
            topicSlug: 'arithmetic',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-qa-05',
            slug: 'ratio-and-proportion',
            name: 'Ratio & Proportion',
            description: 'Compounded ratios, direct/inverse proportion, partnerships, and coin division.',
            sortOrder: 5,
            topicSlug: 'arithmetic',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-qa-06',
            slug: 'averages',
            name: 'Averages',
            description: 'Arithmetic mean, weighted averages, deviation method, and combined group metrics.',
            sortOrder: 6,
            topicSlug: 'arithmetic',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-qa-07',
            slug: 'mixtures-and-alligations',
            name: 'Mixtures & Alligations',
            description: 'Alligation cross rule, concentration ratios, and repeated liquid dilution.',
            sortOrder: 7,
            topicSlug: 'arithmetic',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-qa-08',
            slug: 'problems-on-ages',
            name: 'Problems on Ages',
            description: 'Age equations, constant age difference property, and past/future age ratios.',
            sortOrder: 8,
            topicSlug: 'arithmetic',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
        ],
      },
      {
        id: 'top-qa-twd',
        slug: 'time-work-distance',
        name: 'Time, Work & Distance',
        description: 'Rate problems, efficiency, motion mechanics, and relative velocity.',
        sortOrder: 2,
        sectionSlug: 'quantitative-aptitude',
        subtopics: [
          {
            id: 'sub-qa-09',
            slug: 'time-and-work',
            name: 'Time & Work',
            description: 'LCM unit work method, efficiency ratios, alternate day cycles, and wages.',
            sortOrder: 1,
            topicSlug: 'time-work-distance',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-qa-10',
            slug: 'pipes-and-cisterns',
            name: 'Pipes & Cisterns',
            description: 'Inlet and outlet filling rates, leaks, and alternating valve schedules.',
            sortOrder: 2,
            topicSlug: 'time-work-distance',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-qa-11',
            slug: 'time-speed-distance',
            name: 'Time, Speed & Distance',
            description: 'Conversion units, average speed harmonic formula, and relative motion.',
            sortOrder: 3,
            topicSlug: 'time-work-distance',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-qa-12',
            slug: 'trains',
            name: 'Problems on Trains',
            description: 'Crossing poles and extended platforms, opposite and same direction passing.',
            sortOrder: 4,
            topicSlug: 'time-work-distance',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-qa-13',
            slug: 'boats-and-streams',
            name: 'Boats & Streams',
            description: 'Still water vs current speed, upstream and downstream calculations.',
            sortOrder: 5,
            topicSlug: 'time-work-distance',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
        ],
      },
      {
        id: 'top-qa-cp',
        slug: 'counting-and-probability',
        name: 'Counting & Probability',
        description: 'Permutations, combinations, arrangement restrictions, and chance.',
        sortOrder: 3,
        sectionSlug: 'quantitative-aptitude',
        subtopics: [
          {
            id: 'sub-qa-14',
            slug: 'permutations-and-combinations',
            name: 'Permutations & Combinations',
            description: 'Fundamental counting principle, nPr, nCr, string method, and circular permutations.',
            sortOrder: 1,
            topicSlug: 'counting-and-probability',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-qa-15',
            slug: 'probability',
            name: 'Probability',
            description: 'Sample space, independent events, addition theorem, and conditional chance.',
            sortOrder: 2,
            topicSlug: 'counting-and-probability',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
        ],
      },
      {
        id: 'top-qa-geom',
        slug: 'geometry-and-mensuration',
        name: 'Geometry & Mensuration',
        description: '2D/3D shapes, circles, triangles, surface areas, and volumes.',
        sortOrder: 4,
        sectionSlug: 'quantitative-aptitude',
        subtopics: [
          {
            id: 'sub-qa-16',
            slug: 'mensuration',
            name: 'Mensuration',
            description: 'Perimeter, area, surface areas and volume of cylinders, cones, and spheres.',
            sortOrder: 1,
            topicSlug: 'geometry-and-mensuration',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-qa-17',
            slug: 'geometry',
            name: 'Geometry',
            description: 'Angles, triangle similarity, Pythagoras theorem, and circle chord properties.',
            sortOrder: 2,
            topicSlug: 'geometry-and-mensuration',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
        ],
      },
      {
        id: 'top-qa-alg',
        slug: 'algebra',
        name: 'Algebra',
        description: 'Equations, inequalities, sequences, and logarithmic properties.',
        sortOrder: 5,
        sectionSlug: 'quantitative-aptitude',
        subtopics: [
          {
            id: 'sub-qa-18',
            slug: 'equations-and-inequalities',
            name: 'Equations & Inequalities',
            description: 'Linear systems, quadratic roots, Vieta formulas, and inequality reversals.',
            sortOrder: 1,
            topicSlug: 'algebra',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-qa-19',
            slug: 'progressions',
            name: 'Progressions',
            description: 'AP, GP, nth terms, sum formulas, and infinite convergent series.',
            sortOrder: 2,
            topicSlug: 'algebra',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-qa-20',
            slug: 'logarithms',
            name: 'Logarithms',
            description: 'Log laws, change of base theorem, characteristics, and domain constraints.',
            sortOrder: 3,
            topicSlug: 'algebra',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
        ],
      },
      {
        id: 'top-qa-ds',
        slug: 'data-sufficiency',
        name: 'Data Sufficiency',
        description: 'Testing whether given information is sufficient to solve mathematical problems.',
        sortOrder: 6,
        sectionSlug: 'quantitative-aptitude',
        subtopics: [
          {
            id: 'sub-qa-21',
            slug: 'data-sufficiency',
            name: 'Data Sufficiency',
            description: 'Evaluating uniqueness and sufficiency under standard 5-option decision logic.',
            sortOrder: 1,
            topicSlug: 'data-sufficiency',
            sectionSlug: 'quantitative-aptitude',
            hasAuthoredContent: false,
          },
        ],
      },
    ],
  },
  {
    id: 'sec-lr',
    slug: 'logical-reasoning',
    name: 'Logical Reasoning',
    description: 'Verbal reasoning, puzzles, seating arrangements, deductions, and spatial logic.',
    sortOrder: 2,
    iconName: 'Brain',
    topics: [
      {
        id: 'top-lr-vr',
        slug: 'verbal-reasoning',
        name: 'Verbal Reasoning',
        description: 'Pattern matching, relationships, directional sense, and codes.',
        sortOrder: 1,
        sectionSlug: 'logical-reasoning',
        subtopics: [
          {
            id: 'sub-lr-22',
            slug: 'series',
            name: 'Number & Letter Series',
            description: 'Arithmetic/geometric progressions, difference of differences, and letter positions.',
            sortOrder: 1,
            topicSlug: 'verbal-reasoning',
            sectionSlug: 'logical-reasoning',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-lr-23',
            slug: 'coding-decoding',
            name: 'Coding-Decoding',
            description: 'Letter shifts, reverse pairs, substitution, and message deciphering.',
            sortOrder: 2,
            topicSlug: 'verbal-reasoning',
            sectionSlug: 'logical-reasoning',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-lr-24',
            slug: 'blood-relations',
            name: 'Blood Relations',
            description: 'Family tree diagrams, generation levels, and coded relationship puzzles.',
            sortOrder: 3,
            topicSlug: 'verbal-reasoning',
            sectionSlug: 'logical-reasoning',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-lr-25',
            slug: 'direction-sense',
            name: 'Direction Sense',
            description: 'Cardinal and intercardinal compass tracking, turns, angles, and displacement.',
            sortOrder: 4,
            topicSlug: 'verbal-reasoning',
            sectionSlug: 'logical-reasoning',
            hasAuthoredContent: false,
          },
        ],
      },
      {
        id: 'top-lr-puz',
        slug: 'arrangements-and-puzzles',
        name: 'Arrangements & Puzzles',
        description: 'Linear rows, circular tables, floor grids, and sequential steps.',
        sortOrder: 2,
        sectionSlug: 'logical-reasoning',
        subtopics: [
          {
            id: 'sub-lr-26',
            slug: 'seating-arrangement',
            name: 'Seating Arrangement',
            description: 'Linear rows and circular inward/outward arrangements with constraint splitting.',
            sortOrder: 1,
            topicSlug: 'arrangements-and-puzzles',
            sectionSlug: 'logical-reasoning',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-lr-27',
            slug: 'puzzles',
            name: 'Puzzles',
            description: 'Floor scheduling, box stacking, multi-attribute grids, and elimination.',
            sortOrder: 2,
            topicSlug: 'arrangements-and-puzzles',
            sectionSlug: 'logical-reasoning',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-lr-28',
            slug: 'input-output',
            name: 'Input-Output',
            description: 'Sequential step rearrangements, word sorting, and machine pattern analysis.',
            sortOrder: 3,
            topicSlug: 'arrangements-and-puzzles',
            sectionSlug: 'logical-reasoning',
            hasAuthoredContent: false,
          },
        ],
      },
      {
        id: 'top-lr-ded',
        slug: 'deductive-reasoning',
        name: 'Deductive Reasoning',
        description: 'Categorical syllogisms, Venn verification, and statement logic.',
        sortOrder: 3,
        sectionSlug: 'logical-reasoning',
        subtopics: [
          {
            id: 'sub-lr-29',
            slug: 'syllogism',
            name: 'Syllogism',
            description: 'Categorical logic, "Only a few", Venn overlap, and possibility conclusions.',
            sortOrder: 1,
            topicSlug: 'deductive-reasoning',
            sectionSlug: 'logical-reasoning',
            hasAuthoredContent: true,
          },
          {
            id: 'sub-lr-30',
            slug: 'statement-and-conclusion',
            name: 'Statement & Conclusion',
            description: 'Evaluating definite conclusions without unstated real-world assumptions.',
            sortOrder: 2,
            topicSlug: 'deductive-reasoning',
            sectionSlug: 'logical-reasoning',
            hasAuthoredContent: false,
          },
        ],
      },
      {
        id: 'top-lr-time',
        slug: 'clocks-and-calendars',
        name: 'Clocks & Calendars',
        description: 'Hand angles, coincidence times, odd days, leap centuries, and cycles.',
        sortOrder: 4,
        sectionSlug: 'logical-reasoning',
        subtopics: [
          {
            id: 'sub-lr-31',
            slug: 'clocks',
            name: 'Clocks',
            description: 'Clock hand angle formula, coincidence, right angles, and faulty clock error.',
            sortOrder: 1,
            topicSlug: 'clocks-and-calendars',
            sectionSlug: 'logical-reasoning',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-lr-32',
            slug: 'calendars',
            name: 'Calendars',
            description: 'Odd day calculation, Gregorian leap rules, reference anchors, and repeating years.',
            sortOrder: 2,
            topicSlug: 'clocks-and-calendars',
            sectionSlug: 'logical-reasoning',
            hasAuthoredContent: false,
          },
        ],
      },
      {
        id: 'top-lr-nonverbal',
        slug: 'non-verbal-reasoning',
        name: 'Non-Verbal Reasoning',
        description: '3D cube cuts, dice face rotation, and set relationship diagrams.',
        sortOrder: 5,
        sectionSlug: 'logical-reasoning',
        subtopics: [
          {
            id: 'sub-lr-33',
            slug: 'cubes-and-dice',
            name: 'Cubes & Dice',
            description: 'Painted cube cut formulas, opposite face rules, and net folding.',
            sortOrder: 1,
            topicSlug: 'non-verbal-reasoning',
            sectionSlug: 'logical-reasoning',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-lr-34',
            slug: 'venn-diagrams',
            name: 'Venn Diagrams',
            description: 'Conceptual class relationships and 3-set quantitative region counting.',
            sortOrder: 2,
            topicSlug: 'non-verbal-reasoning',
            sectionSlug: 'logical-reasoning',
            hasAuthoredContent: false,
          },
        ],
      },
    ],
  },
  {
    id: 'sec-va',
    slug: 'verbal-ability',
    name: 'Verbal Ability',
    description: 'Reading comprehension, sentence correction, grammar, and vocabulary.',
    sortOrder: 3,
    iconName: 'BookOpen',
    topics: [
      {
        id: 'top-va-read',
        slug: 'reading',
        name: 'Reading',
        description: 'Textual analysis, sentence ordering, and contextual blank filling.',
        sortOrder: 1,
        sectionSlug: 'verbal-ability',
        subtopics: [
          {
            id: 'sub-va-35',
            slug: 'reading-comprehension',
            name: 'Reading Comprehension',
            description: 'Central idea extraction, tone identification, evidence-based inferences, and traps.',
            sortOrder: 1,
            topicSlug: 'reading',
            sectionSlug: 'verbal-ability',
            hasAuthoredContent: true,
          },
          {
            id: 'sub-va-36',
            slug: 'para-jumbles',
            name: 'Para Jumbles',
            description: 'Identifying opening sentences, mandatory pairs, acronyms, and transitions.',
            sortOrder: 2,
            topicSlug: 'reading',
            sectionSlug: 'verbal-ability',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-va-37',
            slug: 'cloze-test',
            name: 'Cloze Test',
            description: 'Passage context skimming, tone matching, and collocation-based word choice.',
            sortOrder: 3,
            topicSlug: 'reading',
            sectionSlug: 'verbal-ability',
            hasAuthoredContent: false,
          },
        ],
      },
      {
        id: 'top-va-gram',
        slug: 'grammar',
        name: 'Grammar & Usage',
        description: 'Grammar mechanics, modifiers, subject-verb agreement, and phrasing.',
        sortOrder: 2,
        sectionSlug: 'verbal-ability',
        subtopics: [
          {
            id: 'sub-va-38',
            slug: 'sentence-correction',
            name: 'Sentence Correction',
            description: 'Subject-verb agreement, pronoun ambiguity, dangling modifiers, and parallelism.',
            sortOrder: 1,
            topicSlug: 'grammar',
            sectionSlug: 'verbal-ability',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-va-39',
            slug: 'fill-in-the-blanks',
            name: 'Fill in the Blanks',
            description: 'Single and double blank completions using logical conjunction signal words.',
            sortOrder: 2,
            topicSlug: 'grammar',
            sectionSlug: 'verbal-ability',
            hasAuthoredContent: false,
          },
        ],
      },
      {
        id: 'top-va-vocab',
        slug: 'vocabulary',
        name: 'Vocabulary',
        description: 'Etymology, root words, semantic nuance, and idiomatic expressions.',
        sortOrder: 3,
        sectionSlug: 'verbal-ability',
        subtopics: [
          {
            id: 'sub-va-40',
            slug: 'synonyms-and-antonyms',
            name: 'Synonyms & Antonyms',
            description: 'Roots, prefixes, suffixes, connotations, and contextual vocabulary meaning.',
            sortOrder: 1,
            topicSlug: 'vocabulary',
            sectionSlug: 'verbal-ability',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-va-41',
            slug: 'idioms-and-phrases',
            name: 'Idioms & Phrases',
            description: 'Common exam idioms, figurative definitions, and phrasal verb usage.',
            sortOrder: 2,
            topicSlug: 'vocabulary',
            sectionSlug: 'verbal-ability',
            hasAuthoredContent: false,
          },
        ],
      },
    ],
  },
  {
    id: 'sec-di',
    slug: 'data-interpretation',
    name: 'Data Interpretation',
    description: 'Tabular computation, bar charts, trend lines, pie distributions, and caselets.',
    sortOrder: 4,
    iconName: 'BarChart2',
    topics: [
      {
        id: 'top-di-tab',
        slug: 'tables-and-caselets',
        name: 'Tables & Caselets',
        description: 'Tabular data extraction, growth rates, and converting textual narrative into numbers.',
        sortOrder: 1,
        sectionSlug: 'data-interpretation',
        subtopics: [
          {
            id: 'sub-di-42',
            slug: 'tables',
            name: 'Tables',
            description: 'Row/column totals, percentage shares, growth rate, and ratio comparison methods.',
            sortOrder: 1,
            topicSlug: 'tables-and-caselets',
            sectionSlug: 'data-interpretation',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-di-43',
            slug: 'caselets',
            name: 'Caselets',
            description: 'Structuring descriptive paragraphs into tables, Venn models, and matrix deduction.',
            sortOrder: 2,
            topicSlug: 'tables-and-caselets',
            sectionSlug: 'data-interpretation',
            hasAuthoredContent: false,
          },
        ],
      },
      {
        id: 'top-di-chart',
        slug: 'charts',
        name: 'Charts',
        description: 'Clustered bars, cumulative trend curves, and 360-degree pie charts.',
        sortOrder: 2,
        sectionSlug: 'data-interpretation',
        subtopics: [
          {
            id: 'sub-di-44',
            slug: 'bar-charts',
            name: 'Bar Charts',
            description: 'Grouped, stacked, and subdivided bars, axis scales, and ratio estimation.',
            sortOrder: 1,
            topicSlug: 'charts',
            sectionSlug: 'data-interpretation',
            hasAuthoredContent: true,
          },
          {
            id: 'sub-di-45',
            slug: 'line-graphs',
            name: 'Line Graphs',
            description: 'Trend analysis, slopes, CAGR estimation, and multi-line intersection points.',
            sortOrder: 2,
            topicSlug: 'charts',
            sectionSlug: 'data-interpretation',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-di-46',
            slug: 'pie-charts',
            name: 'Pie Charts',
            description: 'Degree-to-percent conversion (3.6 factor), dual pie totals, and sector differences.',
            sortOrder: 3,
            topicSlug: 'charts',
            sectionSlug: 'data-interpretation',
            hasAuthoredContent: false,
          },
        ],
      },
      {
        id: 'top-di-mix',
        slug: 'mixed-di',
        name: 'Mixed',
        description: 'Multi-source data problems combining charts, tables, and graphs.',
        sortOrder: 3,
        sectionSlug: 'data-interpretation',
        subtopics: [
          {
            id: 'sub-di-47',
            slug: 'mixed-graphs',
            name: 'Mixed Graphs',
            description: 'Cross-referencing table metrics with pie distributions and bar charts.',
            sortOrder: 1,
            topicSlug: 'mixed-di',
            sectionSlug: 'data-interpretation',
            hasAuthoredContent: false,
          },
        ],
      },
    ],
  },
  {
    id: 'sec-ta',
    slug: 'technical-aptitude',
    name: 'Technical Aptitude',
    description: 'Programming logic, OOP pillars, algorithms, DBMS, operating systems, and networks.',
    sortOrder: 5,
    iconName: 'Code',
    topics: [
      {
        id: 'top-ta-prog',
        slug: 'programming',
        name: 'Programming',
        description: 'Code tracing, object models, memory models, and data structure complexity.',
        sortOrder: 1,
        sectionSlug: 'technical-aptitude',
        subtopics: [
          {
            id: 'sub-ta-48',
            slug: 'output-prediction',
            name: 'Output Prediction',
            description: 'Execution tracing, pre/post increment, pointer arithmetic, recursion, and scope.',
            sortOrder: 1,
            topicSlug: 'programming',
            sectionSlug: 'technical-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-ta-49',
            slug: 'oop',
            name: 'Object-Oriented Programming',
            description: 'Encapsulation, inheritance, runtime polymorphism, virtual functions, and interfaces.',
            sortOrder: 2,
            topicSlug: 'programming',
            sectionSlug: 'technical-aptitude',
            hasAuthoredContent: true,
          },
          {
            id: 'sub-ta-50',
            slug: 'dsa',
            name: 'Data Structures & Algorithms',
            description: 'Big O asymptotic bounds, arrays, linked lists, stacks, queues, and BST traversals.',
            sortOrder: 3,
            topicSlug: 'programming',
            sectionSlug: 'technical-aptitude',
            hasAuthoredContent: false,
          },
        ],
      },
      {
        id: 'top-ta-cs',
        slug: 'cs-fundamentals',
        name: 'CS Fundamentals',
        description: 'Database normalization, OS scheduling, deadlock, and network protocols.',
        sortOrder: 2,
        sectionSlug: 'technical-aptitude',
        subtopics: [
          {
            id: 'sub-ta-51',
            slug: 'dbms',
            name: 'DBMS',
            description: 'Relational algebra, SQL joins, Normal forms (1NF-BCNF), and ACID guarantees.',
            sortOrder: 1,
            topicSlug: 'cs-fundamentals',
            sectionSlug: 'technical-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-ta-52',
            slug: 'operating-systems',
            name: 'Operating Systems',
            description: 'Process states, CPU scheduling (FCFS, SJF, RR), Coffman deadlocks, and paging.',
            sortOrder: 2,
            topicSlug: 'cs-fundamentals',
            sectionSlug: 'technical-aptitude',
            hasAuthoredContent: false,
          },
          {
            id: 'sub-ta-53',
            slug: 'computer-networks',
            name: 'Computer Networks',
            description: 'OSI/TCP-IP layers, IPv4 CIDR subnetting, 3-way handshake, and DNS/HTTP.',
            sortOrder: 3,
            topicSlug: 'cs-fundamentals',
            sectionSlug: 'technical-aptitude',
            hasAuthoredContent: false,
          },
        ],
      },
    ],
  },
];

// Flat list of all 53 subtopics in canonical sequence
export const ALL_SUBTOPICS: SubtopicMeta[] = RESOURCE_SECTIONS.flatMap((sec) =>
  sec.topics.flatMap((top) => top.subtopics)
);

export function getAllSections(): SectionMeta[] {
  return RESOURCE_SECTIONS.map((section) => ({
    ...section,
    topics: section.topics.map((topic) => ({
      ...topic,
      subtopics: topic.subtopics.filter((subtopic) => subtopic.hasAuthoredContent),
    })).filter((topic) => topic.subtopics.length > 0),
  })).filter((section) => section.topics.length > 0);
}

export function getSectionBySlug(slug: string): SectionMeta | undefined {
  return getAllSections().find((s) => s.slug === slug);
}

export function getTopicBySlug(sectionSlug: string, topicSlug: string): TopicMeta | undefined {
  const sec = getSectionBySlug(sectionSlug);
  return sec?.topics.find((t) => t.slug === topicSlug);
}

export function getSubtopicBySlug(subtopicSlug: string, sectionSlug?: string): SubtopicMeta | undefined {
  if (sectionSlug) {
    const sec = getSectionBySlug(sectionSlug);
    if (!sec) return undefined;
    for (const top of sec.topics) {
      const match = top.subtopics.find((st) => st.slug === subtopicSlug);
      if (match) return match;
    }
    return undefined;
  }
  return ALL_SUBTOPICS.find((st) => st.slug === subtopicSlug);
}

export function getSubtopicNavigation(subtopicSlug: string) {
  const index = ALL_SUBTOPICS.findIndex((st) => st.slug === subtopicSlug);
  if (index === -1) return { prev: undefined, next: undefined };

  const prev = index > 0 ? ALL_SUBTOPICS[index - 1] : undefined;
  const next = index < ALL_SUBTOPICS.length - 1 ? ALL_SUBTOPICS[index + 1] : undefined;

  const prevRef = prev
    ? {
        title: prev.name,
        href: `/resources/${prev.sectionSlug}/${prev.topicSlug}/${prev.slug}`,
        sectionName: RESOURCE_SECTIONS.find((s) => s.slug === prev.sectionSlug)?.name ?? '',
      }
    : undefined;

  const nextRef = next
    ? {
        title: next.name,
        href: `/resources/${next.sectionSlug}/${next.topicSlug}/${next.slug}`,
        sectionName: RESOURCE_SECTIONS.find((s) => s.slug === next.sectionSlug)?.name ?? '',
      }
    : undefined;

  return { prev: prevRef, next: nextRef };
}

export interface SearchResult {
  kind: 'section' | 'topic' | 'subtopic';
  title: string;
  description: string;
  href: string;
  sectionName: string;
  badgeText: string;
}

export function searchCatalogue(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResult[] = [];

  for (const sec of getAllSections()) {
    if (sec.name.toLowerCase().includes(q) || sec.description.toLowerCase().includes(q)) {
      results.push({
        kind: 'section',
        title: sec.name,
        description: sec.description,
        href: `/resources/${sec.slug}`,
        sectionName: sec.name,
        badgeText: 'Section',
      });
    }

    for (const top of sec.topics) {
      if (top.name.toLowerCase().includes(q) || top.description.toLowerCase().includes(q)) {
        results.push({
          kind: 'topic',
          title: top.name,
          description: top.description,
          href: `/resources/${sec.slug}#${top.slug}`,
          sectionName: sec.name,
          badgeText: `${sec.name} › Topic`,
        });
      }

      for (const st of top.subtopics) {
        if (
          st.name.toLowerCase().includes(q) ||
          st.description.toLowerCase().includes(q) ||
          st.slug.toLowerCase().includes(q)
        ) {
          results.push({
            kind: 'subtopic',
            title: st.name,
            description: st.description,
            href: `/resources/${sec.slug}/${top.slug}/${st.slug}`,
            sectionName: sec.name,
            badgeText: `${sec.name} › ${top.name}`,
          });
        }
      }
    }
  }

  return results.slice(0, 15);
}
