import type { EducationalTopicContent } from '../types';

export const PERCENTAGES_CONTENT: EducationalTopicContent = {
  documentId: 'APT-PUB-02',
  sectionSlug: 'quantitative-aptitude',
  sectionName: 'Quantitative Aptitude',
  topicSlug: 'arithmetic',
  topicName: 'Arithmetic',
  subtopicSlug: 'percentages',
  subtopicName: 'Percentages',
  title: 'Percentages: Core Concepts, Successive Changes, and Mental Shortcuts',
  learningObjective:
    'Master fractional equivalences, rapid percentage change calculations, successive percentage formulas, reverse base determinations, and placement exam problem solving within 60 seconds.',
  introduction:
    'A percentage (literally "per hundred", from Latin *per centum*) is a dimensionless ratio expressing a fraction of 100. In campus recruitment tests (TCS NQT, Infosys, Cognizant, AMCAT) and competitive exams (CAT, Bank PO), percentages form the bedrock of arithmetic. Almost every question in Profit & Loss, Simple/Compound Interest, and Data Interpretation reduces to a rapid percentage calculation.',
  prerequisites: [
    { title: 'Fractions and Decimals', href: '/resources/quantitative-aptitude/arithmetic/number-system' },
    { title: 'Ratio and Proportion', href: '/resources/quantitative-aptitude/arithmetic/ratio-and-proportion' },
  ],
  coreConcepts: [
    {
      heading: '1. The Fractional Multiplier Concept',
      body: 'Instead of computing $P\\% \\text{ of } X$ as $(P \\times X) / 100$, modern aptitude solvers treat percentages as decimal or fractional multipliers. An increase of $25\\%$ means multiplying the initial value by $(1 + 0.25) = 1.25 = \\frac{5}{4}$. A decrease of $20\\%$ means multiplying by $(1 - 0.20) = 0.80 = \\frac{4}{5}$. Multiplying directly is significantly faster and prevents intermediate rounding errors.',
    },
    {
      heading: '2. The Invariance of the Reference Base',
      body: 'A common source of confusion is failing to recognize what quantity represents $100\\%$ (the base). When value $A$ increases to $B$, the base is $A$: $\\Delta\\% = \\frac{B - A}{A} \\times 100$. But when $B$ decreases back to $A$, the base is now $B$: $\\Delta\\% = \\frac{B - A}{B} \\times 100$. Because $B > A$, the percentage decrease back to $A$ is strictly smaller in magnitude than the initial percentage increase.',
    },
    {
      heading: '3. Successive Percentage Changes (Compounding)',
      body: 'When a quantity undergoes successive percentage changes of $+a\\%$ followed by $+b\\%$, the net percentage change is NOT $(a + b)\\%$. It is $(1 + \\frac{a}{100})(1 + \\frac{b}{100}) - 1$, which expands algebraically to: $\\text{Net } \\% = a + b + \\frac{ab}{100}$. If a change is a decrease, substitute that variable with a negative sign.',
    },
  ],
  definitionsAndNotation: [
    { term: 'Base Value ($B$)', definition: 'The initial reference amount corresponding to $100\\%$.' },
    { term: 'Percentage Rate ($R\\%$)', definition: 'The number of parts taken per hundred parts of the base.' },
    { term: 'Absolute Change ($\\Delta$)', definition: 'The numerical difference between final and initial amounts: $F - I$.' },
    { term: 'Multiplying Factor ($MF$)', definition: 'The single factor that yields the final value: $F = I \\times MF$. For $+r\\%$, $MF = 1 + \\frac{r}{100}$.' },
  ],
  formulas: [
    {
      name: 'Percentage of a Quantity',
      formula: 'P = \\left(\\frac{R}{100}\\right) \\times B',
      explanation: 'Computes part $P$ given rate $R\\%$ and base $B$.',
      assumptions: 'Base $B \\neq 0$.',
    },
    {
      name: 'Percentage Increase / Decrease',
      formula: '\\Delta\\% = \\left(\\frac{\\text{Final} - \\text{Initial}}{\\text{Initial}}\\right) \\times 100\\%',
      explanation: 'Calculates relative rate of change relative to the initial starting state.',
      assumptions: 'Initial value must be strictly positive ($I > 0$).',
    },
    {
      name: 'Successive Percentage Changes',
      formula: '\\text{Net Change }\\% = a + b + \\frac{a \\times b}{100}\\%',
      explanation: 'Computes the overall percentage change after two sequential changes of $a\\%$ and $b\\%$.',
      assumptions: 'Both percentage changes apply sequentially to the changing intermediate quantity, not simultaneously to the initial base.',
    },
    {
      name: 'Compensating Percentage Change Rule',
      formula: '\\text{If price increases by } \\frac{1}{x}, \\text{ consumption must decrease by } \\frac{1}{x+1} \\text{ to keep expenditure constant.}',
      explanation: 'Relates reciprocal changes between two variables whose product is constant ($A \\times B = K$).',
      assumptions: 'Expenditure is held strictly constant.',
    },
  ],
  workedExamples: [
    {
      title: 'Example 1: Foundational Base Calculation',
      difficulty: 'easy',
      examContext: 'Campus Placement Prep (TCS NQT Foundation)',
      question:
        'A tech intern receives a monthly stipend of ₹24,000. After passing an evaluation, the stipend is increased to ₹30,000. Find the percentage increase in the intern\'s stipend.',
      solution:
        '1. Identify the initial base value: $\\text{Initial} = 24,000$.\n2. Identify the final value: $\\text{Final} = 30,000$.\n3. Calculate the absolute increase: $\\Delta = 30,000 - 24,000 = 6,000$.\n4. Apply percentage formula: $\\Delta\\% = \\frac{6,000}{24,000} \\times 100\\% = \\frac{1}{4} \\times 100\\% = 25\\%$.',
      verification: 'Verify by multiplying initial by $(1 + 0.25)$: $24,000 \\times 1.25 = 30,000$. Matches exactly.',
      answer: '25%',
    },
    {
      title: 'Example 2: Successive Discounts and Net Price',
      difficulty: 'medium',
      examContext: 'Infosys / AMCAT Placement Exam',
      question:
        'An online laptop store marks a device at ₹60,000. During a festive sale, it offers a primary discount of $20\\%$ followed by an additional festive coupon discount of $10\\%$. What is the net single discount percentage and the final selling price?',
      solution:
        '1. Let successive discounts be $a = -20$ and $b = -10$.\n2. Use the successive change formula:\n   $$\\text{Net Change} = a + b + \\frac{ab}{100} = (-20) + (-10) + \\frac{(-20)(-10)}{100} = -30 + 2 = -28\\%$$\n3. The net equivalent single discount is $28\\%$.\n4. Compute the final selling price:\n   $$\\text{SP} = 60,000 \\times (1 - 0.28) = 60,000 \\times 0.72 = ₹43,200.$$',
      verification:
        'Step-by-step verification: After $20\\%$ off ₹60,000: $60,000 - 12,000 = ₹48,000$. Second discount of $10\\%$ off ₹48,000: $48,000 - 4,800 = ₹43,200$. Both methods yield ₹43,200.',
      answer: 'Net discount: 28%; Final Selling Price: ₹43,200',
    },
    {
      title: 'Example 3: Constant Expenditure with Price Increase',
      difficulty: 'hard',
      examContext: 'CAT / SBI PO Quantitative Section',
      question:
        'Due to global supply constraints, the unit price of cloud computing server hours increased by $33\\frac{1}{3}\\%$. By what percentage must a startup reduce its server consumption so that its total cloud expenditure remains exactly unchanged?',
      solution:
        '1. Recall total expenditure relationship: $\\text{Expenditure} = \\text{Price} \\times \\text{Consumption}$.\n2. The price increase is $33\\frac{1}{3}\\% = +\\frac{1}{3}$.\n3. The new price multiplier is $1 + \\frac{1}{3} = \\frac{4}{3}$.\n4. For expenditure to remain 1, the new consumption multiplier must be the reciprocal: $\\frac{3}{4}$.\n5. A consumption multiplier of $\\frac{3}{4}$ represents a decrease of $1 - \\frac{3}{4} = \\frac{1}{4} = 25\\%$.\n6. Using the reciprocal shortcut: Price increased by $\\frac{1}{x} = \\frac{1}{3} \\implies$ consumption must drop by $\\frac{1}{x+1} = \\frac{1}{3+1} = \\frac{1}{4} = 25\\%$.',
      verification:
        'Assume initial price = ₹30/hr, consumption = 100 hrs $\\implies$ initial expenditure = ₹3,000. New price = $30 \\times 1.333...$ = ₹40/hr. To spend ₹3,000: new consumption = $3,000 / 40 = 75$ hrs. Decrease = $(100 - 75)/100 = 25\\%$. Verified.',
      answer: '25%',
    },
  ],
  alternativeMethods: [
    {
      name: 'The Fraction Equivalence Shortcut',
      description:
        'Convert all standard percentages into their fraction equivalents (e.g., $12.5\\% = \\frac{1}{8}$, $16.67\\% = \\frac{1}{6}$, $37.5\\% = \\frac{3}{8}$). Multiply numerators and denominators directly instead of carrying multi-digit decimal multiplications.',
      whenValid: 'Applicable to any percentage that aligns with standard unit fractions up to $\\frac{1}{20}$.',
      whenItFails: 'Inefficient when percentages are irregular or non-standard primes like $17.3\\%$.',
    },
    {
      name: 'The 10% & 1% Mental Splitting Method',
      description:
        'To find any percentage mentally, break it into chunks of $10\\%$, $5\\%$, and $1\\%$. For example, to find $23\\%$ of 450: $10\\% = 45$, so $20\\% = 90$; $1\\% = 4.5$, so $3\\% = 13.5$. Total = $90 + 13.5 = 103.5$.',
      whenValid: 'Highly effective for rapid mental math and Data Interpretation table estimates.',
      whenItFails: 'When exact precision to three decimal places is required by an exam options key.',
    },
  ],
  tipsAndTricks: [
    'Symmetry property: $x\\% \\text{ of } y = y\\% \\text{ of } x$. For example, $16\\% \\text{ of } 25$ is identical to $25\\% \\text{ of } 16 = \\frac{1}{4} \\times 16 = 4$.',
    'Memorize the core unit fraction values from $\\frac{1}{2} (50\\%)$ down to $\\frac{1}{16} (6.25\\%)$.',
    'If a quantity increases by $x\\%$ and then decreases by $x\\%$, it ALWAYS suffers a net loss of $\\frac{x^2}{100}\\%$.',
    'Watch the wording: "increased by 20%" means final = 120%; "increased to 120%" means final = 120%; "increased by 120%" means final = 220%.',
  ],
  commonMistakes: [
    {
      mistake: 'Adding successive percentages directly (e.g., concluding two 20% discounts equal a 40% discount).',
      whyItHappens: 'Assuming the second discount applies to the original total rather than the reduced intermediate price.',
      howToAvoid: 'Always use $a + b + \\frac{ab}{100}$ or sequential multiplying factors ($0.80 \\times 0.80 = 0.64 \\implies 36\\%$ discount).',
    },
    {
      mistake: 'Confusing percentage points with percentage change.',
      whyItHappens: 'Treating a shift from 10% to 12% as a 2% increase.',
      howToAvoid: 'Recognize that an increase from 10% to 12% is an increase of 2 percentage points, but a relative increase of $\\frac{2}{10} \\times 100\\% = 20\\%$.',
    },
    {
      mistake: 'Using the wrong denominator when calculating reverse percentage changes.',
      whyItHappens: 'If salary is cut by 20%, people assume a 20% raise restores the original salary.',
      howToAvoid: 'After a 20% cut from ₹100 to ₹80, the required restoration increase is $\\frac{20}{80} \\times 100\\% = 25\\%$.',
    },
  ],
  difficultyProgression: [
    {
      level: 'Foundational (Easy)',
      characteristics: 'Single-variable calculations; straightforward fraction conversions; direct multiplier applications.',
      typicalExam: 'TCS NQT Cognitive, Wipro Elite, Capgemini Foundation.',
    },
    {
      level: 'Standard (Medium)',
      characteristics: 'Successive percentage changes; two interdependent variables; election and population problems.',
      typicalExam: 'Infosys SP/DSE, Cognizant GenC Next, AMCAT, Bank PO Prelims.',
    },
    {
      level: 'Advanced (Hard)',
      characteristics: 'Multi-stage reverse percentages; constant product constraints with fractional shifts; multi-tier tax brackets.',
      typicalExam: 'CAT QA, XAT, SBI PO Mains.',
    },
  ],
  practiceQuestions: [
    {
      id: 'pct-pq-1',
      stem: 'If $35\\%$ of a number is 175, what is $60\\%$ of that same number?',
      options: ['280', '300', '320', '350'],
      correctIndex: 1,
      difficulty: 'easy',
      explanation:
        'Let the number be $N$. $0.35 N = 175 \\implies N = 175 / 0.35 = 500$. Now find $60\\%$ of 500: $0.60 \\times 500 = 300$.',
    },
    {
      id: 'pct-pq-2',
      stem: 'A candidate needs $40\\%$ marks to pass an examination. She scores 178 marks and fails by 22 marks. What are the maximum aggregate marks for the exam?',
      options: ['450', '500', '520', '600'],
      correctIndex: 1,
      difficulty: 'easy',
      explanation:
        'Passing marks required = $178 + 22 = 200$. Since $40\\%$ of Total Marks ($M$) equals 200: $0.40 M = 200 \\implies M = 200 / 0.40 = 500$.',
    },
    {
      id: 'pct-pq-3',
      stem: 'The price of fuel rose by $25\\%$. A motorist wants to increase their monthly fuel budget by only $10\\%$. By what percentage must the motorist reduce fuel consumption?',
      options: ['10%', '12%', '14%', '15%'],
      correctIndex: 1,
      difficulty: 'medium',
      explanation:
        'Use $\\text{Expenditure} = \\text{Price} \\times \\text{Consumption}$. Let initial $P=100$, $C=100$, so $E=10,000$. New Price = 125, New Expenditure = 11,000. New Consumption = $11,000 / 125 = 88$. The consumption decreased from 100 to 88, which is a reduction of $12\\%$.',
    },
    {
      id: 'pct-pq-4',
      stem: 'In a college election between two candidates, the winner secured $62\\%$ of the valid votes and won by a majority of 1,440 votes. If all cast votes were valid, how many total votes were cast?',
      options: ['5,600', '6,000', '6,400', '7,200'],
      correctIndex: 1,
      difficulty: 'medium',
      explanation:
        'Let total votes be $V$. Winner = $62\\%$, therefore Loser = $100\\% - 62\\% = 38\\%$. Majority difference = $62\\% - 38\\% = 24\\%$. We are given $0.24 V = 1,440 \\implies V = 1,440 / 0.24 = 6,000$.',
    },
    {
      id: 'pct-pq-5',
      stem: 'A trader marks an article up by $50\\%$ above its cost price and subsequently offers a discount of $20\\%$. What is the trader\'s net profit percentage?',
      options: ['20%', '25%', '30%', '35%'],
      correctIndex: 0,
      difficulty: 'easy',
      explanation:
        'Let Cost Price = 100. Marked Price = $100 \\times 1.50 = 150$. Selling Price after $20\\%$ discount = $150 \\times (1 - 0.20) = 150 \\times 0.80 = 120$. Profit = $120 - 100 = 20\\%$. Alternatively, using successive formula: $+50 - 20 + \\frac{(50)(-20)}{100} = 30 - 10 = +20\\%$.',
    },
  ],
  revisionSummary: [
    'Multiplier Rule: $+x\\% \\implies \\times (1 + \\frac{x}{100})$; $-x\\% \\implies \\times (1 - \\frac{x}{100})$.',
    'Successive Change: $\\text{Net }\\% = a + b + \\frac{ab}{100}$. Two equal opposite changes of $x\\%$ produce a net loss of $\\frac{x^2}{100}\\%$.',
    'Constant Product: If $A \\times B = K$ and $A$ increases by $\\frac{1}{x}$, $B$ must decrease by $\\frac{1}{x+1}$.',
    'Symmetry Property: $a\\% \\text{ of } b = b\\% \\text{ of } a$.',
  ],
  faqs: [
    {
      question: 'Why does a 20% pay cut followed by a 20% pay raise not return me to my starting salary?',
      answer:
        'Because the 20% raise is calculated on the reduced salary base, not your original salary. If you start at ₹100, a 20% cut puts you at ₹80. A subsequent 20% raise adds 20% of ₹80 (which is ₹16), bringing you to ₹96—a net 4% loss.',
    },
    {
      question: 'What is the fastest way to calculate percentages in Data Interpretation without paper?',
      answer:
        'Break the calculation into 10% and 1% steps. For instance, to calculate 34% of 800: 10% is 80 (so 30% is 240); 1% is 8 (so 4% is 32). Add them together: 240 + 32 = 272.',
    },
    {
      question: 'What is the difference between percentage and percentile?',
      answer:
        'Percentage is an absolute mathematical score representing parts per hundred (e.g., scoring 85 out of 100 marks is 85%). Percentile is a rank relative to other test-takers (e.g., the 99th percentile means you scored higher than 99% of all candidates who took the exam).',
    },
  ],
  relatedTopics: [
    {
      title: 'Profit & Loss',
      href: '/resources/quantitative-aptitude/arithmetic/profit-and-loss',
      relationship: 'next-step',
      description: 'Applies percentage markup, discounts, and cost-to-selling price ratios in retail and business scenarios.',
    },
    {
      title: 'Simple & Compound Interest',
      href: '/resources/quantitative-aptitude/arithmetic/simple-and-compound-interest',
      relationship: 'next-step',
      description: 'Extends successive percentage change to annual and quarterly financial compounding models.',
    },
    {
      title: 'Ratio & Proportion',
      href: '/resources/quantitative-aptitude/arithmetic/ratio-and-proportion',
      relationship: 'prerequisite',
      description: 'Provides the fractional foundational mechanics required for percentage ratio conversions.',
    },
  ],
  editorialReview: 'Editorial review pending; this material has not been independently certified.',
};
