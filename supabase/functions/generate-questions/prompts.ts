// Prompts for the generate and solve passes. Bump PROMPT_VERSION whenever
// either prompt, the output schemas or the checks change meaningfully: it is
// stored on every question and job, so reviewers can trace a bad batch.
export const PROMPT_VERSION = 'generate-questions/2026-10-01.1';

export type PromptContext = {
  section: string;
  topic: string;
  subtopic: string;
  subtopicDescription: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  numeric: boolean; // quantitative section: computation required for numeric answers
};

const DIFFICULTY_GUIDE: Record<PromptContext['difficulty'], string> = {
  easy: 'one or two steps, a single standard formula or idea; solvable in under a minute by a prepared candidate',
  medium: 'two to four steps or a combination of two ideas; typical of mainstream placement tests (TCS NQT, AMCAT, Infosys)',
  hard: 'multi-step reasoning, a non-obvious insight or careful case analysis; the hard end of CAT/bank PO questions, still solvable without a calculator in under four minutes',
};

const COMPUTATION_RULES = `"computation" is a single arithmetic expression that evaluates to the number in the correct option, in the same unit (25 for "25%", 1250 for "₹1,250"). Allowed: numbers, + - * / ^ and parentheses, and the functions sqrt, cbrt, abs, ln, log10, log2, log(x, base), exp, pow, floor, ceil, round(x, digits), min, max, fact(n), nCr(n, r), nPr(n, r), gcd, lcm, plus the constants pi and e. No variables, units, words or "=".`;

export const GENERATOR_SYSTEM = `You write original multiple-choice aptitude questions for Indian placement and competitive exams. You are precise: every question has exactly one correct option, and you check your arithmetic before answering. You reply only with JSON matching the given schema.`;

export function generationPrompt(ctx: PromptContext, count: number, avoid: string[]): string {
  const avoidBlock = avoid.length
    ? `\nThe bank already has questions like these. Do not repeat them or make trivially reworded versions (changing only names or numbers):\n${avoid.map((s) => `- ${s}`).join('\n')}\n`
    : '';
  return `Write ${count} new ${ctx.difficulty} questions.

Section: ${ctx.section}
Topic: ${ctx.topic}
Subtopic: ${ctx.subtopic}${ctx.subtopicDescription ? ` (${ctx.subtopicDescription})` : ''}
Difficulty: ${ctx.difficulty}: ${DIFFICULTY_GUIDE[ctx.difficulty]}
${avoidBlock}
Rules for each question:
1. "stem": the full question in Markdown. Self-contained: include every number and fact needed. Vary the scenario across questions.
2. "options": exactly 4 distinct options, without "A)"/"1." labels. Wrong options must be plausible (common mistakes), never "None of these" or "All of the above".
3. "correct_index": 0-based index of the single correct option. Spread the correct answer across positions.
4. "explanation": a step-by-step Markdown solution that arrives at the correct option.
5. "hint": one sentence that points to the method without giving the answer, or null.
6. "est_seconds": seconds a prepared candidate needs.
7. ${ctx.numeric
    ? `When every option is a number, ${COMPUTATION_RULES} Otherwise null.`
    : '"computation": null.'}`;
}

export const SOLVER_SYSTEM = `You are a careful examiner checking aptitude questions. Solve the question yourself from scratch, step by step, before choosing. You reply only with JSON matching the given schema.`;

export function solvePrompt(stem: string, options: string[], numeric: boolean): string {
  return `Solve this multiple-choice question.

${stem}

Options:
${options.map((o, i) => `${i}. ${o}`).join('\n')}

Put your working in "working", then the 0-based index of the correct option in "answer_index".
${numeric
    ? `If every option is a number, also give ${COMPUTATION_RULES.replace('the correct option', 'the option you chose')} Otherwise "computation" is null.`
    : '"computation": null.'}`;
}
