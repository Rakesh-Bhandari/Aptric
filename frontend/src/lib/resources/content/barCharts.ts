import type { EducationalTopicContent } from '../types';

export const BAR_CHARTS_CONTENT: EducationalTopicContent = {
  documentId: 'APT-PUB-44',
  sectionSlug: 'data-interpretation',
  sectionName: 'Data Interpretation',
  topicSlug: 'charts',
  topicName: 'Charts',
  subtopicSlug: 'bar-charts',
  subtopicName: 'Bar Charts',
  title: 'Bar Charts: Clustered, Stacked, and Percentage Bars with Fast Mental Calculations',
  learningObjective:
    'Master tabular data translation, axis scale reading, clustered/stacked bar decomposition, period-over-period percentage growth, and rapid ratio comparison without long division.',
  introduction:
    'Bar charts represent categorical and temporal data through proportional rectangular lengths. In campus placement tests (TCS NQT, Infosys, Capgemini, Cognizant) and competitive exams (SBI PO, IBPS, CAT), bar charts test your ability to extract exact values swiftly, distinguish absolute amounts from percentage shares, and compute comparative growth rates without getting bogged down in arithmetic.',
  prerequisites: [
    { title: 'Percentages and Growth Rates', href: '/resources/quantitative-aptitude/arithmetic/percentages' },
    { title: 'Ratio and Proportion', href: '/resources/quantitative-aptitude/arithmetic/ratio-and-proportion' },
    { title: 'Averages and Weighted Means', href: '/resources/quantitative-aptitude/arithmetic/averages' },
  ],
  coreConcepts: [
    {
      heading: '1. Types of Bar Charts',
      body: '- **Simple Bar Chart:** Displays a single continuous variable across categories or discrete time intervals.\n- **Clustered / Grouped Bar Chart:** Places multiple adjacent bars side-by-side for each category to allow immediate comparative analysis across products, companies, or demographic segments.\n- **Subdivided / Stacked Bar Chart:** Each bar represents a cumulative total, partitioned into color-coded segments representing component parts.\n- **Percentage Stacked Bar Chart:** Every bar is normalized to $100\\%$, illustrating relative percentage shares rather than absolute magnitudes.',
    },
    {
      heading: '2. Percentage Growth and Absolute Growth',
      body: 'Do not confuse absolute growth ($V_2 - V_1$) with percentage growth ($\\frac{V_2 - V_1}{V_1} \\times 100\\%$). A company whose revenue increases from ₹10 Cr to ₹15 Cr has experienced an absolute growth of ₹5 Cr and a percentage growth of $50\\%$. Another company whose revenue increases from ₹100 Cr to ₹110 Cr has a larger absolute growth (₹10 Cr) but a much smaller percentage growth ($10\\%$).',
    },
    {
      heading: '3. Rapid Fraction and Ratio Comparison Without Division',
      body: 'When comparing growth rates or ratios $\\frac{A}{B}$ across bars, avoid converting all fractions into long decimals. Use:\n- **Cross-Multiplication:** To compare $\\frac{43}{87}$ and $\\frac{49}{98}$, cross-multiply $43 \\times 98$ vs $49 \\times 87$.\n- **Numerator/Denominator Percentage Change Method:** If the numerator increases by a larger percentage than the denominator, the overall fraction increases.',
    },
  ],
  definitionsAndNotation: [
    { term: 'Baseline / Origin', definition: 'The zero reference point on the numerical axis. Watch out for truncated axes that exaggerate differences.' },
    { term: 'Compound Annual Growth Rate (CAGR)', definition: 'The constant geometric rate of return required for an initial value to grow to its final value over $n$ periods: $\\text{CAGR} = (V_f / V_i)^{1/n} - 1$.' },
    { term: 'Stacked Segment Value', definition: 'The value of an intermediate segment in a stacked bar is computed as: $\\text{Top Boundary} - \\text{Bottom Boundary}$, NOT the top boundary height alone.' },
  ],
  formulas: [
    {
      name: 'Percentage Growth Rate',
      formula: 'g\\% = \\left(\\frac{V_{\\text{final}} - V_{\\text{initial}}}{V_{\\text{initial}}}\\right) \\times 100\\%',
      explanation: 'Calculates the rate of increase relative to the starting period baseline.',
      assumptions: 'Initial period value must be positive ($V_{\\text{initial}} > 0$).',
    },
    {
      name: 'Segment Extraction in Stacked Bars',
      formula: '\\text{Component Value} = Y_{\\text{upper}} - Y_{\\text{lower}}',
      explanation: 'Prevents reading the cumulative total as the individual component value.',
      assumptions: 'Valid for stacked vertical bar charts.',
    },
  ],
  workedExamples: [
    {
      title: 'Example 1: Clustered Bar Analysis (Production vs Sales)',
      difficulty: 'easy',
      examContext: 'TCS NQT / Infosys Campus Recruitment',
      question:
        '**Data Table representing a clustered bar chart of electric scooter production and sales (in thousands):**\n\n| Year | Production (000s) | Sales (000s) |\n| :--- | :---: | :---: |\n| 2021 | 80 | 60 |\n| 2022 | 120 | 90 |\n| 2023 | 150 | 135 |\n| 2024 | 200 | 160 |\n\n**Question:** In which year was the ratio of Sales to Production the highest?',
      solution:
        '1. Compute the Sales-to-Production ratio for each year:\n   - 2021: $\\frac{60}{80} = \\frac{3}{4} = 0.750$ ($75.0\\%$)\n   - 2022: $\\frac{90}{120} = \\frac{3}{4} = 0.750$ ($75.0\\%$)\n   - 2023: $\\frac{135}{150} = \\frac{9}{10} = 0.900$ ($90.0\\%$)\n   - 2024: $\\frac{160}{200} = \\frac{4}{5} = 0.800$ ($80.0\\%$)\n2. Compare values: $0.900$ in 2023 is strictly greater than all other years.\n3. The highest ratio occurred in 2023.',
      verification: 'Unsold inventory was lowest in 2023 (only 10% unsold), confirming sales ratio was peak at 90%. Verified.',
      answer: '2023 (Ratio = 0.90 or 90%)',
    },
    {
      title: 'Example 2: Percentage Increase in Stacked Segments',
      difficulty: 'medium',
      examContext: 'Bank PO Prelims / Cognizant GenC Next',
      question:
        '**A stacked bar chart shows total corporate budget allocations across R&D, Marketing, and Operations (in ₹ Crores):**\n- In 2023: Total = ₹500 Cr (R&D = ₹125 Cr, Marketing = ₹175 Cr, Operations = ₹200 Cr).\n- In 2024: Total = ₹650 Cr (R&D = ₹180 Cr, Marketing = ₹210 Cr, Operations = ₹260 Cr).\n\n**Question:** Which department experienced the highest percentage budget increase from 2023 to 2024?',
      solution:
        '1. Compute percentage increase for each department:\n   - **R&D:** $\\frac{180 - 125}{125} \\times 100\\% = \\frac{55}{125} = \\frac{11}{25} = 44.0\\%$\n   - **Marketing:** $\\frac{210 - 175}{175} \\times 100\\% = \\frac{35}{175} = \\frac{1}{5} = 20.0\\%$\n   - **Operations:** $\\frac{260 - 200}{200} \\times 100\\% = \\frac{60}{200} = \\frac{3}{10} = 30.0\\%$\n2. Compare percentage growth rates: $44.0\\% > 30.0\\% > 20.0\\%$.\n3. R&D recorded the highest percentage increase.',
      verification: 'Notice that while Operations gained the largest absolute increase (₹60 Cr vs ₹55 Cr for R&D), R&D\'s lower starting base (₹125 Cr) gives it a substantially higher percentage jump (44% vs 30%). Verified.',
      answer: 'R&D (44% growth)',
    },
  ],
  alternativeMethods: [
    {
      name: 'Fraction Benchmark Comparison',
      description:
        'Compare values against round fraction milestones (like $50\\% = 1/2$, $66.7\\% = 2/3$, $75\\% = 3/4$). If one ratio is comfortably above $3/4$ and another is below $3/4$, no calculation is needed.',
      whenValid: 'Fast for filtering multi-option bar chart questions.',
      whenItFails: 'When options differ by less than 1%.',
    },
  ],
  tipsAndTricks: [
    'Always read the axis labels and unit notes first (e.g. "Values in Hundreds", "Revenue in Millions USD").',
    'Check if the vertical axis begins at zero. If the axis starts at 100, visual bar height ratios will be misleading.',
    'In clustered bars, track legend colors consistently; examiners occasionally reverse the legend order.',
    'For total sums across years, look for complementary pairs to add mentally (e.g. $47 + 53 = 100$).',
  ],
  commonMistakes: [
    {
      mistake: 'Reading the top mark of a stacked bar segment as that segment\'s value.',
      whyItHappens: 'Forgetting that stacked segments sit on top of prior segments.',
      howToAvoid: 'Always subtract the bottom line of the segment from its top line.',
    },
    {
      mistake: 'Calculating percentage growth relative to the final year instead of the initial base year.',
      whyItHappens: 'Putting $V_{\\text{final}}$ in the denominator.',
      howToAvoid: 'Always use $\\frac{\\text{Difference}}{\\text{Initial Value}} \\times 100\\%$.',
    },
  ],
  difficultyProgression: [
    {
      level: 'Foundational (Easy)',
      characteristics: 'Single bars, direct value retrieval, simple difference of two bars.',
      typicalExam: 'TCS NQT, Wipro.',
    },
    {
      level: 'Standard (Medium)',
      characteristics: 'Clustered bars, ratio comparison across years, percentage growth rate.',
      typicalExam: 'Infosys, Bank PO Prelims, SSC CGL.',
    },
    {
      level: 'Advanced (Hard)',
      characteristics: 'Multi-segment stacked bars with changing totals, weighted average shares, multi-year CAGR.',
      typicalExam: 'CAT DI, SBI PO Mains.',
    },
  ],
  practiceQuestions: [
    {
      id: 'bar-pq-1',
      stem: 'In a bar chart displaying five branches of an institute, Branch A enrolled 450 students and Branch B enrolled 600 students. By what percentage is Branch B\'s enrollment higher than Branch A\'s?',
      options: ['25%', '33.33%', '35%', '40%'],
      correctIndex: 1,
      difficulty: 'easy',
      explanation:
        '$\\text{Percentage Higher} = \\frac{600 - 450}{450} \\times 100\\% = \\frac{150}{450} = \\frac{1}{3} = 33.33\\%$.',
    },
    {
      id: 'bar-pq-2',
      stem: 'If export revenue across four quarters was ₹120 Cr, ₹150 Cr, ₹180 Cr, and ₹210 Cr, what was the average quarterly export revenue?',
      options: ['₹155 Cr', '₹165 Cr', '₹170 Cr', '₹175 Cr'],
      correctIndex: 1,
      difficulty: 'easy',
      explanation:
        'Total = $120 + 150 + 180 + 210 = 660$ Cr. Average = $660 / 4 = ₹165$ Cr. (Notice the values form an AP with common difference 30; the mean is $(150 + 180)/2 = 165$).',
    },
  ],
  revisionSummary: [
    'Percentage Growth = $(\\text{Final} - \\text{Initial}) / \\text{Initial} \\times 100\\%$.',
    'Stacked segment = $\\text{Top Line} - \\text{Bottom Line}$.',
    'Check axis origins and unit multipliers (millions, crores, thousands).',
    'Use benchmark fraction estimation ($1/2, 2/3, 3/4$) before doing manual long division.',
  ],
  faqs: [
    {
      question: 'How do I quickly compute percentage growth without a calculator in tests?',
      answer:
        'Find 10% and 1% of the baseline denominator. For $\\frac{46}{180}$: $10\\%$ of 180 is 18. Twice that is 36 ($20\\%$). Remaining is $46 - 36 = 10$. Since $1\\%$ is 1.8, 10 is roughly $5.5\\%$. Total growth is approximately $25.5\\%$.',
    },
  ],
  relatedTopics: [
    {
      title: 'Tables',
      href: '/resources/data-interpretation/tables-and-caselets/tables',
      relationship: 'parallel',
      description: 'Covers equivalent computation principles in structured tabular formats.',
    },
    {
      title: 'Pie Charts',
      href: '/resources/data-interpretation/charts/pie-charts',
      relationship: 'next-step',
      description: 'Extends percentage distribution to circular 360-degree sector proportions.',
    },
  ],
  lastUpdated: 'October 2026',
  editorialReview: 'Independently verified by Aptric Data Interpretation Editorial Team for placement and competitive standards.',
};
