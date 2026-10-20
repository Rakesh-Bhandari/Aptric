import { CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import React, { useState } from 'react';
import { Markdown } from '@/components/markdown/Markdown';
import type { PracticeQuestion } from '@/lib/resources/types';

interface PracticeCheckpointProps {
  questions: PracticeQuestion[];
}

export const PracticeCheckpoint: React.FC<PracticeCheckpointProps> = ({ questions }) => {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [revealedSolutions, setRevealedSolutions] = useState<Record<string, boolean>>({});

  const handleSelect = (questionId: string, optionIndex: number) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const toggleSolution = (questionId: string) => {
    setRevealedSolutions((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  return (
    <div className="space-y-6">
      {questions.map((q, qIndex) => {
        const selected = selectedAnswers[q.id];
        const isAnswered = selected !== undefined;
        const isCorrect = selected === q.correctIndex;
        const isRevealed = revealedSolutions[q.id];

        return (
          <div
            key={q.id}
            className="p-5 sm:p-6 rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-xs transition-all"
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--accent)] bg-[var(--primary)]/10 px-2.5 py-1 rounded-full">
                Question {qIndex + 1} of {questions.length}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                  q.difficulty === 'easy'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : q.difficulty === 'medium'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                }`}
              >
                {q.difficulty.toUpperCase()}
              </span>
            </div>

            <div className="text-[var(--foreground)] text-sm sm:text-base mb-4 font-medium leading-relaxed">
              <Markdown text={q.stem} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
              {q.options.map((opt, optIndex) => {
                const isThisSelected = selected === optIndex;
                const isThisCorrect = optIndex === q.correctIndex;

                let btnStyles =
                  'border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--secondary)]/30 text-[var(--foreground)]';

                if (isAnswered) {
                  if (isThisCorrect) {
                    btnStyles =
                      'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-medium';
                  } else if (isThisSelected) {
                    btnStyles =
                      'border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300';
                  } else {
                    btnStyles = 'border-[var(--border)] opacity-60 text-[var(--muted-foreground)]';
                  }
                }

                return (
                  <button
                    key={optIndex}
                    type="button"
                    onClick={() => handleSelect(q.id, optIndex)}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left text-sm transition-all cursor-pointer ${btnStyles}`}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-semibold shrink-0 mt-0.5 ${
                        isAnswered && isThisCorrect
                          ? 'bg-emerald-500 text-white'
                          : isAnswered && isThisSelected
                          ? 'bg-rose-500 text-white'
                          : 'bg-[var(--secondary)] text-[var(--muted-foreground)]'
                      }`}
                    >
                      {String.fromCharCode(65 + optIndex)}
                    </span>
                    <span className="flex-1 leading-snug">
                      <Markdown text={opt} />
                    </span>
                    {isAnswered && isThisCorrect && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-1" />
                    )}
                    {isAnswered && isThisSelected && !isThisCorrect && (
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-1" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border)]">
              {isAnswered ? (
                <div className="flex items-center gap-2 text-xs font-medium">
                  {isCorrect ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Correct answer!
                    </span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <XCircle className="w-4 h-4" /> Incorrect. Check solution below.
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5" /> Select an option to test yourself
                </span>
              )}

              <button
                type="button"
                onClick={() => toggleSolution(q.id)}
                className="text-xs font-medium text-[var(--accent)] hover:underline ml-auto"
              >
                {isRevealed ? 'Hide Explanation' : 'View Explanation'}
              </button>
            </div>

            {isRevealed && (
              <div className="mt-4 p-4 rounded-xl bg-[var(--secondary)]/40 border border-[var(--border)] text-xs sm:text-sm text-[var(--foreground)] leading-relaxed">
                <p className="font-semibold text-[var(--accent)] mb-1">
                  Solution (Option {String.fromCharCode(65 + q.correctIndex)}):
                </p>
                <Markdown text={q.explanation} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
