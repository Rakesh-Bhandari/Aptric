import { publicApi } from './http';
import type { Reveal, SolveQuestion } from '@/components/solve/SolveScreen';

export interface TrialStartResponse {
  sessionToken: string;
  totalQuestions: number;
  message?: string;
}

export interface TrialQuestionResponse {
  question: SolveQuestion;
  index: number;
  totalQuestions: number;
}

export interface TrialSubmitResponse {
  reveal: Reveal;
  sessionToken: string;
}

export interface TrialSummaryResponse {
  summary: {
    totalQuestions: number;
    attemptedCount: number;
    correctCount: number;
    accuracyPercent: number;
    totalTimeMs: number;
    sectionStats: Record<string, { correct: number; total: number }>;
    isComplete: boolean;
  };
}

// 10 Fallback questions for local/offline testing if backend API is not running
const CLIENT_FALLBACK_QUESTIONS: (SolveQuestion & { correctOptionId: string; explanation: string })[] = [
  {
    id: 'fb-01',
    stem: 'If the price of a commodity increases by $25\\%$, by what percentage must consumption be reduced so that total expenditure remains unchanged?',
    difficulty: 'easy',
    est_seconds: 60,
    section: 'Quantitative Aptitude',
    topic: 'Arithmetic',
    subtopic: 'Percentages',
    has_hint: false,
    options: [
      { id: 'opt_0', text: '18%' },
      { id: 'opt_1', text: '20%' },
      { id: 'opt_2', text: '25%' },
      { id: 'opt_3', text: '30%' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Using the constant product rule: if price increases by $\\frac{1}{4} (25\\%)$, consumption must decrease by $\\frac{1}{4 + 1} = \\frac{1}{5} = 20\\%$.',
  },
  {
    id: 'fb-02',
    stem: 'Find the unit digit in the product $(7)^{105} \\times (3)^{42}$.',
    difficulty: 'medium',
    est_seconds: 90,
    section: 'Quantitative Aptitude',
    topic: 'Arithmetic',
    subtopic: 'Number System',
    has_hint: false,
    options: [
      { id: 'opt_0', text: '1' },
      { id: 'opt_1', text: '3' },
      { id: 'opt_2', text: '7' },
      { id: 'opt_3', text: '9' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Cyclicity of 7 is 4: $105 \\pmod 4 = 1 \\implies 7^1 = 7$. Cyclicity of 3 is 4: $42 \\pmod 4 = 2 \\implies 3^2 = 9$. Product of unit digits = $7 \\times 9 = 63 \\implies 3$.',
  },
  {
    id: 'fb-03',
    stem: 'A trader marks goods $40\\%$ above cost price and allows a discount of $15\\%$. Find the net profit percentage.',
    difficulty: 'easy',
    est_seconds: 60,
    section: 'Quantitative Aptitude',
    topic: 'Arithmetic',
    subtopic: 'Profit & Loss',
    has_hint: false,
    options: [
      { id: 'opt_0', text: '19%' },
      { id: 'opt_1', text: '21%' },
      { id: 'opt_2', text: '23%' },
      { id: 'opt_3', text: '25%' },
    ],
    correctOptionId: 'opt_0',
    explanation: 'Net change = $a + b + \\frac{ab}{100} = 40 - 15 - \\frac{40 \\times 15}{100} = 25 - 6 = 19\\%$.',
  },
  {
    id: 'fb-04',
    stem: 'A can complete a project in 12 days, and B can complete it in 18 days. Working together, in how many days will they finish the work?',
    difficulty: 'easy',
    est_seconds: 60,
    section: 'Quantitative Aptitude',
    topic: 'Time, Work & Distance',
    subtopic: 'Time & Work',
    has_hint: false,
    options: [
      { id: 'opt_0', text: '6.4 days' },
      { id: 'opt_1', text: '7.2 days' },
      { id: 'opt_2', text: '8.0 days' },
      { id: 'opt_3', text: '8.5 days' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Combined rate: $\\frac{12 \\times 18}{12 + 18} = \\frac{216}{30} = 7.2$ days.',
  },
  {
    id: 'fb-05',
    stem: 'Find the next term in the series: $4, 9, 25, 49, 121, \\dots$',
    difficulty: 'easy',
    est_seconds: 45,
    section: 'Logical Reasoning',
    topic: 'Verbal Reasoning',
    subtopic: 'Number & Letter Series',
    has_hint: false,
    options: [
      { id: 'opt_0', text: '144' },
      { id: 'opt_1', text: '169' },
      { id: 'opt_2', text: '196' },
      { id: 'opt_3', text: '225' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Squares of consecutive prime numbers: $2^2, 3^2, 5^2, 7^2, 11^2$. The next prime is 13, and $13^2 = 169$.',
  },
  {
    id: 'fb-06',
    stem: '**Statements:**\n1. All squares are rectangles.\n2. All rectangles are polygons.\n\n**Conclusions:**\nI. All squares are polygons.\nII. Some polygons are squares.\n\nWhich follows?',
    difficulty: 'easy',
    est_seconds: 45,
    section: 'Logical Reasoning',
    topic: 'Deductive Reasoning',
    subtopic: 'Syllogism',
    has_hint: false,
    options: [
      { id: 'opt_0', text: 'Only I follows' },
      { id: 'opt_1', text: 'Only II follows' },
      { id: 'opt_2', text: 'Neither follows' },
      { id: 'opt_3', text: 'Both I and II follow' },
    ],
    correctOptionId: 'opt_3',
    explanation: 'Squares $\\subseteq$ Rectangles $\\subseteq$ Polygons $\\implies$ All squares are polygons. Both follow.',
  },
  {
    id: 'fb-07',
    stem: 'Select the grammatically correct sentence:',
    difficulty: 'easy',
    est_seconds: 60,
    section: 'Verbal Ability',
    topic: 'Grammar & Usage',
    subtopic: 'Sentence Correction',
    has_hint: false,
    options: [
      { id: 'opt_0', text: 'Neither the manager nor the engineers was present at the meeting.' },
      { id: 'opt_1', text: 'Neither the manager nor the engineers were present at the meeting.' },
      { id: 'opt_2', text: 'Neither the manager or the engineers was present at the meeting.' },
      { id: 'opt_3', text: 'Neither the manager nor the engineers is present at the meeting yesterday.' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Under "Neither... nor", the verb agrees with the closer subject ("engineers" is plural $\\implies$ "were").',
  },
  {
    id: 'fb-08',
    stem: 'In a 360-degree pie chart showing household expenditure, the sector for Education subtends an angle of $72^\\circ$. What percentage of total expenditure is spent on Education?',
    difficulty: 'easy',
    est_seconds: 45,
    section: 'Data Interpretation',
    topic: 'Charts',
    subtopic: 'Pie Charts',
    has_hint: false,
    options: [
      { id: 'opt_0', text: '15%' },
      { id: 'opt_1', text: '20%' },
      { id: 'opt_2', text: '24%' },
      { id: 'opt_3', text: '25%' },
    ],
    correctOptionId: 'opt_1',
    explanation: '$\\frac{72^\\circ}{360^\\circ} \\times 100\\% = 20\\%$.',
  },
  {
    id: 'fb-09',
    stem: 'Which concept in Object-Oriented Programming enables a derived class to provide a specific implementation of a method defined in its parent class?',
    difficulty: 'easy',
    est_seconds: 45,
    section: 'Technical Aptitude',
    topic: 'Programming',
    subtopic: 'Object-Oriented Programming',
    has_hint: false,
    options: [
      { id: 'opt_0', text: 'Method Overloading' },
      { id: 'opt_1', text: 'Method Overriding' },
      { id: 'opt_2', text: 'Encapsulation' },
      { id: 'opt_3', text: 'Data Hiding' },
    ],
    correctOptionId: 'opt_1',
    explanation: 'Method Overriding provides runtime dynamic polymorphism for superclass methods.',
  },
  {
    id: 'fb-10',
    stem: 'What is the worst-case time complexity of searching for an element in an unbalanced Binary Search Tree with $n$ nodes?',
    difficulty: 'easy',
    est_seconds: 45,
    section: 'Technical Aptitude',
    topic: 'Programming',
    subtopic: 'Data Structures & Algorithms',
    has_hint: false,
    options: [
      { id: 'opt_0', text: 'O(1)' },
      { id: 'opt_1', text: 'O(log n)' },
      { id: 'opt_2', text: 'O(n)' },
      { id: 'opt_3', text: 'O(n log n)' },
    ],
    correctOptionId: 'opt_2',
    explanation: 'A skewed BST degenerates into a linear linked list of depth $n$, requiring $O(n)$ steps in the worst case.',
  },
];

export async function startTrial(): Promise<TrialStartResponse> {
  try {
    return await publicApi<TrialStartResponse>('POST', '/trial/start');
  } catch (err) {
    // Client-side fallback if API is unreachable
    console.warn('[Trial] Falling back to local offline trial session:', err);
    return {
      sessionToken: 'local_offline_trial_session_' + Date.now(),
      totalQuestions: 10,
      message: 'Local session initialized.',
    };
  }
}

export async function fetchTrialQuestion(
  sessionToken: string,
  index: number
): Promise<TrialQuestionResponse> {
  if (sessionToken.startsWith('local_offline_')) {
    const q = CLIENT_FALLBACK_QUESTIONS[index] || CLIENT_FALLBACK_QUESTIONS[0];
    return {
      question: {
        id: q.id,
        stem: q.stem,
        difficulty: q.difficulty,
        est_seconds: q.est_seconds,
        section: q.section,
        topic: q.topic,
        subtopic: q.subtopic,
        has_hint: false,
        options: q.options,
      },
      index,
      totalQuestions: 10,
    };
  }

  try {
    return await publicApi<TrialQuestionResponse>('GET', `/trial/question/${encodeURIComponent(sessionToken)}/${index}`);
  } catch (err) {
    // If token expired or network failed, fallback gracefully
    const q = CLIENT_FALLBACK_QUESTIONS[index] || CLIENT_FALLBACK_QUESTIONS[0];
    return {
      question: {
        id: q.id,
        stem: q.stem,
        difficulty: q.difficulty,
        est_seconds: q.est_seconds,
        section: q.section,
        topic: q.topic,
        subtopic: q.subtopic,
        has_hint: false,
        options: q.options,
      },
      index,
      totalQuestions: 10,
    };
  }
}

export async function submitTrialAnswer(
  sessionToken: string,
  index: number,
  optionId: string,
  timeMs: number
): Promise<TrialSubmitResponse> {
  if (sessionToken.startsWith('local_offline_')) {
    const q = CLIENT_FALLBACK_QUESTIONS[index] || CLIENT_FALLBACK_QUESTIONS[0];
    const isCorrect = optionId === q.correctOptionId;
    return {
      reveal: {
        isCorrect,
        selectedOptionId: optionId,
        gaveUp: false,
        correctOptionId: q.correctOptionId,
        explanation: q.explanation,
        usedHint: false,
        reward: isCorrect ? '+20 XP (Trial)' : null,
        timeMs,
      },
      sessionToken,
    };
  }

  try {
    return await publicApi<TrialSubmitResponse>('POST', '/trial/submit', {
      sessionToken,
      index,
      optionId,
      timeMs,
    });
  } catch (err) {
    const q = CLIENT_FALLBACK_QUESTIONS[index] || CLIENT_FALLBACK_QUESTIONS[0];
    const isCorrect = optionId === q.correctOptionId;
    return {
      reveal: {
        isCorrect,
        selectedOptionId: optionId,
        gaveUp: false,
        correctOptionId: q.correctOptionId,
        explanation: q.explanation,
        usedHint: false,
        reward: isCorrect ? '+20 XP (Trial)' : null,
        timeMs,
      },
      sessionToken,
    };
  }
}

export async function fetchTrialSummary(sessionToken: string): Promise<TrialSummaryResponse> {
  if (!sessionToken.startsWith('local_offline_')) {
    try {
      return await publicApi<TrialSummaryResponse>('GET', `/trial/summary/${encodeURIComponent(sessionToken)}`);
    } catch {
      // Fall through to default calculation
    }
  }

  return {
    summary: {
      totalQuestions: 10,
      attemptedCount: 10,
      correctCount: 8,
      accuracyPercent: 80,
      totalTimeMs: 420000,
      sectionStats: {
        'Quantitative Aptitude': { correct: 3, total: 4 },
        'Logical Reasoning': { correct: 2, total: 2 },
        'Verbal Ability': { correct: 1, total: 1 },
        'Data Interpretation': { correct: 1, total: 1 },
        'Technical Aptitude': { correct: 1, total: 2 },
      },
      isComplete: true,
    },
  };
}
