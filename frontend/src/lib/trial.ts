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

/** The server is authoritative for trial selection, grading, and answer keys. */
export function startTrial(): Promise<TrialStartResponse> {
  return publicApi<TrialStartResponse>('POST', '/trial/start');
}

export function fetchTrialQuestion(
  sessionToken: string,
  index: number,
): Promise<TrialQuestionResponse> {
  return publicApi<TrialQuestionResponse>('POST', '/trial/question', { sessionToken, index });
}

export function submitTrialAnswer(
  sessionToken: string,
  index: number,
  optionId: string,
  timeMs: number,
): Promise<TrialSubmitResponse> {
  return publicApi<TrialSubmitResponse>('POST', '/trial/submit', {
    sessionToken,
    index,
    optionId,
    timeMs,
  });
}

export function fetchTrialSummary(sessionToken: string): Promise<TrialSummaryResponse> {
  return publicApi<TrialSummaryResponse>('POST', '/trial/summary', { sessionToken });
}
