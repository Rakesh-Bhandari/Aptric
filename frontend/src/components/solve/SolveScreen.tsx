import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Check, Clock, Flag, Lightbulb, Repeat, SkipForward, Sparkles, X } from 'lucide-react';
import { Markdown } from '@/components/markdown/Markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/context/ToastContext';
import { useElapsed } from '@/hooks/useElapsed';
import { useSolveKeys } from '@/hooks/useSolveKeys';
import { friendlyError } from '@/lib/errors';
import { formatClock, formatDuration } from '@/lib/format';
import { DIFFICULTY_LABEL, OPTION_KEYS, OPTION_LETTERS } from '@/lib/game';
import type { Difficulty, QuestionOption } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ReportDialog } from './ReportDialog';

export interface SolveQuestion {
  id: string;
  stem: string;
  difficulty: Difficulty;
  est_seconds: number;
  section: string;
  topic: string;
  subtopic: string;
  has_hint: boolean;
  options: QuestionOption[];
}

/** What the player learns after answering. */
export interface Reveal {
  isCorrect: boolean;
  selectedOptionId: string | null;
  gaveUp: boolean;
  /** null when the answer stays secret (contests until they end). */
  correctOptionId: string | null;
  explanation: string | null;
  usedHint: boolean;
  /** "+20 XP", "+30 points"… */
  reward: string | null;
  timeMs: number | null;
}

export type SolveKind = 'daily' | 'practice' | 'contest' | 'placement';

interface Props {
  question: SolveQuestion;
  kind: SolveKind;
  /** Points this question is worth, e.g. "20 XP". */
  worth?: string | null;
  initialHint?: string | null;
  /** Submit and return what to reveal; for placement return null (no feedback until the end). */
  onSubmit: (optionId: string, timeMs: number) => Promise<Reveal | null>;
  /** Present when hints are allowed. Resolves to the hint text. */
  onHint?: () => Promise<string | null>;
  hintCost?: number;
  onGiveUp?: (timeMs: number) => Promise<Reveal>;
  /** Placement only: move on without answering. */
  onSkip?: (timeMs: number) => void;
  onNext: () => void;
  nextLabel: string;
  onPracticeSimilar?: () => void;
  /** Extra content under the result (e.g. level-up news). */
  resultExtras?: ReactNode;
}

export const SolveScreen = ({
  question, kind, worth, initialHint = null, onSubmit, onHint, hintCost, onGiveUp, onSkip, onNext, nextLabel,
  onPracticeSimilar, resultExtras,
}: Props) => {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'submit' | 'hint' | 'giveup'>(null);
  const [hint, setHint] = useState<string | null>(initialHint);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [error, setError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const { elapsed, read } = useElapsed(!reveal);
  const toast = useToast();
  const stemId = useId();
  const resultRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const answered = !!reveal;
  const overTime = elapsed > question.est_seconds * 1000;

  // Move focus to the result so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (reveal) (nextRef.current ?? resultRef.current)?.focus({ preventScroll: true });
    if (reveal) resultRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [reveal]);

  const submit = async () => {
    if (!picked || busy || answered) return;
    setBusy('submit');
    setError('');
    try {
      const result = await onSubmit(picked, read());
      if (result) setReveal(result);
    } catch (err) {
      setError(friendlyError(err, "We couldn't check that answer. Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const showHint = async () => {
    if (!onHint || busy || answered) return;
    setBusy('hint');
    setError('');
    try {
      setHint((await onHint()) ?? 'There is no hint for this question.');
    } catch (err) {
      setError(friendlyError(err, "We couldn't load the hint. Please try again."));
    } finally {
      setBusy(null);
    }
  };

  const giveUp = async () => {
    if (!onGiveUp || busy || answered) return;
    const ok = await toast.confirm({
      title: 'Give up on this question?',
      message: "You'll see the answer and explanation, but this question won't earn any XP.",
      confirmText: 'Show me the answer',
      cancelText: 'Keep trying',
    });
    if (!ok) return;
    setBusy('giveup');
    setError('');
    try {
      setReveal(await onGiveUp(read()));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  useSolveKeys({
    optionCount: question.options.length,
    enabled: !busy,
    onPick: (i) => { if (!answered) setPicked(question.options[i]?.id ?? null); },
    onEnter: () => { if (answered) onNext(); else void submit(); },
  });

  const optionState = (id: string) => {
    if (!reveal) return picked === id ? 'picked' : 'idle';
    if (reveal.correctOptionId === id) return 'correct';
    if (reveal.selectedOptionId === id) return reveal.isCorrect ? 'correct' : 'wrong';
    return 'dim';
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-8 pt-2 sm:px-6">
      {/* Meta row: topic, difficulty, timer */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="muted" className="max-w-full truncate">{question.topic} · {question.subtopic}</Badge>
        <Badge variant={question.difficulty === 'hard' ? 'danger' : question.difficulty === 'medium' ? 'warning' : 'success'}>
          {DIFFICULTY_LABEL[question.difficulty]}
        </Badge>
        {worth && <span className="text-muted-foreground">Worth {worth}</span>}
        <span
          role="timer"
          aria-label={`Time on this question: ${formatDuration(elapsed)}. Target about ${formatDuration(question.est_seconds * 1000)}.`}
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-sm font-semibold tabular-nums',
            overTime && !answered ? 'border-warning/50 bg-warning-soft text-warning-soft-foreground' : 'bg-card',
          )}
        >
          <Clock className="size-4" aria-hidden />
          {formatClock(elapsed)}
          <span className="font-sans text-xs font-normal text-muted-foreground" aria-hidden>/ {formatClock(question.est_seconds * 1000)}</span>
        </span>
      </div>

      {/* Question */}
      <section aria-labelledby={stemId} className="rounded-lg border bg-card p-4 sm:p-6">
        <h2 id={stemId} className="sr-only">Question</h2>
        <Markdown text={question.stem} className="text-base sm:text-lg" />
      </section>

      {/* Options */}
      <div role="group" aria-label="Answer options" className="grid gap-2.5">
        {question.options.map((o, i) => {
          const state = optionState(o.id);
          return (
            <button
              key={o.id}
              type="button"
              disabled={answered || !!busy}
              aria-pressed={!answered ? picked === o.id : undefined}
              data-option-picked={picked === o.id && !answered ? 'true' : undefined}
              aria-keyshortcuts={OPTION_KEYS[i]}
              onClick={() => setPicked(o.id)}
              className={cn(
                'group flex min-h-14 w-full items-center gap-3 rounded-lg border-2 bg-card px-3 py-3 text-left transition-colors sm:px-4',
                'disabled:cursor-default',
                state === 'idle' && 'hover:border-primary/60 hover:bg-primary-soft/40',
                state === 'picked' && 'border-primary bg-primary-soft text-primary-soft-foreground',
                state === 'correct' && 'border-success bg-success-soft text-success-soft-foreground',
                state === 'wrong' && 'border-danger bg-danger-soft text-danger-soft-foreground',
                state === 'dim' && 'opacity-60',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-md border text-sm font-bold',
                  state === 'picked' && 'border-primary bg-primary text-primary-foreground',
                  state === 'correct' && 'border-success bg-success text-white dark:text-background',
                  state === 'wrong' && 'border-danger bg-danger text-white dark:text-background',
                )}
              >
                {state === 'correct' ? <Check className="size-4" /> : state === 'wrong' ? <X className="size-4" /> : OPTION_LETTERS[i]}
              </span>
              <span className="min-w-0 flex-1 text-base">
                <span className="sr-only">Option {OPTION_LETTERS[i]}: </span>
                <Markdown text={o.body} inline />
                {state === 'correct' && <span className="sr-only"> (correct answer)</span>}
                {state === 'wrong' && <span className="sr-only"> (your answer, incorrect)</span>}
              </span>
              <kbd aria-hidden className="hidden rounded border bg-muted px-1.5 text-xs text-muted-foreground sm:inline">{OPTION_KEYS[i]}</kbd>
            </button>
          );
        })}
      </div>

      {/* Hint */}
      {hint && !reveal && (
        <div className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-warning-soft-foreground" role="note" aria-label="Hint">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Lightbulb className="size-4" aria-hidden /> Hint</p>
          <Markdown text={hint} className="text-sm" />
        </div>
      )}

      {error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{error}</p>}

      {/* Actions */}
      {!reveal && (
        <div className="sticky bottom-0 -mx-4 mt-auto space-y-2 border-t bg-background/95 px-4 pb-safe pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button size="lg" className="w-full" onClick={() => void submit()} disabled={!picked} loading={busy === 'submit'}>
            {kind === 'placement' ? 'Save answer' : 'Check answer'}
            <kbd aria-hidden className="ml-1 hidden rounded border border-primary-foreground/30 px-1.5 text-xs font-normal opacity-80 sm:inline">Enter</kbd>
          </Button>
          <div className="flex flex-wrap justify-center gap-2">
            {onHint && question.has_hint && !hint && (
              <Button variant="outline" onClick={() => void showHint()} loading={busy === 'hint'} disabled={!!busy}>
                <Lightbulb /> Show hint {hintCost ? `(−${hintCost})` : ''}
                {hintCost ? <span className="sr-only"> costs {hintCost} XP</span> : null}
              </Button>
            )}
            {onGiveUp && (
              <Button variant="ghost" onClick={() => void giveUp()} loading={busy === 'giveup'} disabled={!!busy}>
                <Flag /> Give up &amp; see answer
              </Button>
            )}
            {onSkip && (
              <Button variant="ghost" onClick={() => onSkip(read())} disabled={!!busy}>
                <SkipForward /> I don't know, skip
              </Button>
            )}
          </div>
          <p className="hidden text-center text-xs text-muted-foreground sm:block">
            Tip: press <kbd className="rounded border px-1">1</kbd>–<kbd className="rounded border px-1">{Math.min(question.options.length, 9)}</kbd> to choose, <kbd className="rounded border px-1">Enter</kbd> to check.
          </p>
        </div>
      )}

      {/* Result */}
      {reveal && (
        <div
          ref={resultRef}
          tabIndex={-1}
          role="region"
          aria-label="Result"
          className={cn(
            'rounded-lg border-2 p-4 focus:outline-none sm:p-5 motion-safe:animate-pop',
            reveal.isCorrect ? 'border-success/50 bg-success-soft/60' : 'border-danger/40 bg-danger-soft/50',
          )}
        >
          <div aria-live="assertive" className="flex flex-wrap items-center gap-2">
            <span className={cn('grid size-9 place-items-center rounded-full text-white dark:text-background', reveal.isCorrect ? 'bg-success' : 'bg-danger')} aria-hidden>
              {reveal.isCorrect ? <Check className="size-5" /> : <X className="size-5" />}
            </span>
            <h2 className="text-lg font-bold">
              {reveal.isCorrect ? (reveal.usedHint ? 'Correct, with a hint' : 'Correct!') : reveal.gaveUp ? "Here's the answer" : 'Not quite'}
            </h2>
            {reveal.reward && (
              <Badge variant={reveal.isCorrect ? 'success' : 'muted'} className="text-sm"><Sparkles /> {reveal.reward}</Badge>
            )}
            {reveal.timeMs != null && <span className="text-sm text-muted-foreground">in {formatDuration(reveal.timeMs)}</span>}
          </div>

          {!reveal.isCorrect && reveal.correctOptionId && (
            <p className="mt-3 text-sm">
              The right answer is <strong>option {OPTION_LETTERS[question.options.findIndex((o) => o.id === reveal.correctOptionId)]}</strong>.
            </p>
          )}

          {reveal.explanation ? (
            <div className="mt-3 rounded-md bg-card p-3 sm:p-4">
              <h3 className="mb-1 text-sm font-semibold">Explanation</h3>
              <Markdown text={reveal.explanation} />
            </div>
          ) : kind === 'contest' ? (
            <p className="mt-3 text-sm text-muted-foreground">Answers and explanations open when the contest ends.</p>
          ) : null}

          {resultExtras}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button ref={nextRef} size="lg" onClick={onNext} className="sm:flex-1">
              {nextLabel} <ArrowRight />
            </Button>
            {onPracticeSimilar && (
              <Button size="lg" variant="outline" onClick={onPracticeSimilar}>
                <Repeat /> Practice similar
              </Button>
            )}
          </div>
          <div className="mt-2 flex justify-center">
            <Button variant="link" size="sm" className="text-muted-foreground" onClick={() => setReportOpen(true)}>
              Something wrong with this question? Report it
            </Button>
          </div>
        </div>
      )}
      <ReportDialog questionId={question.id} open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
};
