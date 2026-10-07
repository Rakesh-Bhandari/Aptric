import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldAlert, Timer } from 'lucide-react';
import { clearPendingViolation, setPendingViolation, VIOLATION_TEXT } from '@/components/compete/attempt';
import { useNow } from '@/components/compete/time';
import { SessionHeader } from '@/components/solve/SessionHeader';
import { SolveScreen } from '@/components/solve/SolveScreen';
import { Button } from '@/components/ui/button';
import { useContestGuard } from '@/hooks/useExamGuard';
import * as api from '@/lib/api';
import { formatClock } from '@/lib/format';
import { clockSkew } from '@/lib/posts';
import type { ChallengeRun, ContestViolation } from '@/lib/types';
import { fromCard } from '@/pages/solve/news';

/**
 * Plays one challenge run under contest rules: each answer is final, there is no tutor, and leaving the tab
 * ends the attempt (the answers so far count). The clock is the server's: a banner shows the time left and
 * the server refuses answers after the deadline whatever this page does.
 */
export const ChallengeRunner = ({ run, label, onDone }: { run: ChallengeRun; label: string; onDone: () => void }) => {
  const challengeId = run.challenge.id;
  const [queue] = useState(() => run.questions.filter((q) => !q.answer));
  const [index, setIndex] = useState(0);
  const [ended, setEnded] = useState<{ reason: ContestViolation; failed: boolean } | null>(null);
  const [skew] = useState(() => clockSkew(run.server_now));
  const now = useNow(1000);
  const left = Date.parse(run.run.deadline_at) - (now + skew);
  const finishing = useRef(false);

  const end = useCallback(async (reason: ContestViolation) => {
    // Written down first, so a page that goes away mid-request still gets it to the server later.
    setPendingViolation(challengeId, reason);
    setEnded({ reason, failed: false });
    try {
      await api.finishChallengeRun(challengeId, reason);
      clearPendingViolation(challengeId);
      onDone();
    } catch {
      setEnded({ reason, failed: true });
    }
  }, [challengeId, onDone]);
  useContestGuard(!ended, (reason) => void end(reason));

  // Out of time: the server has already closed it; ask it to settle and show the result.
  useEffect(() => {
    if (left > 0 || finishing.current || ended) return;
    finishing.current = true;
    api.finishChallengeRun(challengeId).catch(() => {}).finally(onDone);
  }, [left, challengeId, ended, onDone]);

  const question = queue[index];
  if (ended) {
    return (
      <div role="alert" className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <ShieldAlert className="mx-auto size-10 text-danger" aria-hidden />
          <h1 className="font-display text-xl font-extrabold text-heading">Your attempt has ended</h1>
          <p className="text-sm text-muted-foreground">Because {VIOLATION_TEXT[ended.reason]}, your answers so far are being submitted automatically.</p>
          {ended.failed
            ? <><p className="text-sm text-danger-soft-foreground">We couldn't reach the server. Your attempt will still be closed.</p><Button onClick={() => void end(ended.reason)}>Try again</Button></>
            : <p className="text-sm font-semibold text-heading">Submitting…</p>}
        </div>
      </div>
    );
  }
  if (!question) return null;
  const answeredBefore = run.questions.length - queue.length;
  const last = index === queue.length - 1;
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SessionHeader title={label} index={answeredBefore + index} total={run.questions.length} onExit={onDone} exitLabel="Leave (answers are saved; the clock keeps running)" />
      <p role="timer" aria-label={`Time left ${formatClock(Math.max(left, 0))}`} className="mx-auto flex w-full max-w-3xl items-center justify-end gap-1.5 px-4 pt-2 text-sm font-semibold tabular-nums text-muted-foreground">
        <Timer className="size-4" aria-hidden /> {formatClock(Math.max(left, 0))} left
      </p>
      <SolveScreen
        key={question.id}
        question={fromCard(question)}
        kind="contest"
        worth="counts toward your score"
        onSubmit={async (optionId) => {
          const r = await api.submitChallengeAnswer({ id: challengeId, questionId: question.id, optionId });
          return { isCorrect: r.is_correct, selectedOptionId: optionId, gaveUp: false, correctOptionId: null, explanation: null, usedHint: false, reward: null, timeMs: null };
        }}
        onNext={() => (last ? onDone() : setIndex((i) => i + 1))}
        nextLabel={last ? 'Finish' : 'Next question'}
      />
    </div>
  );
};
