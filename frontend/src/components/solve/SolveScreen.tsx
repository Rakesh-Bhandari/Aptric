import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { ArrowRight, Check, Clock, Eye, Flag, Lightbulb, MoreHorizontal, Repeat, SkipForward, Sparkles, X } from 'lucide-react';
import { Markdown } from '@/components/markdown/Markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/context/ToastContext';
import { useElapsed } from '@/hooks/useElapsed';
import { prefersReducedMotion } from '@/hooks/useReveal';
import { useSolveKeys } from '@/hooks/useSolveKeys';
import { friendlyError } from '@/lib/errors';
import { formatClock, formatDuration } from '@/lib/format';
import { DIFFICULTY_LABEL, OPTION_KEYS, OPTION_LETTERS } from '@/lib/game';
import type { Difficulty, QuestionOption } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ReportDialog } from './ReportDialog';
import { SESSION_TIMER_SLOT } from './SessionHeader';

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

const KIND_LABEL: Record<SolveKind, string> = { daily: 'Daily', practice: 'Practice', contest: 'Contest', placement: 'Placement' };
const DIFFICULTY_BADGE = { easy: 'success', medium: 'default', hard: 'danger' } as const;

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

/** The SessionHeader's timer slot, once it's on the page (null without a header, e.g. in tests). */
const useTimerSlot = () => {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setSlot(document.getElementById(SESSION_TIMER_SLOT)), []);
  return slot;
};

const Kbd = ({ children, className }: { children: ReactNode; className?: string }) => (
  <kbd className={cn('inline-grid min-w-6 place-items-center rounded-md border border-b-2 bg-card px-1.5 font-sans text-[11px] font-semibold leading-5 text-heading', className)}>
    {children}
  </kbd>
);

const menuItem =
  'flex min-h-11 cursor-pointer select-none items-center gap-2.5 rounded-md px-3 text-sm font-medium outline-none transition-colors data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground';

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
  const timerSlot = useTimerSlot();

  const answered = !!reveal;
  const overTime = elapsed > question.est_seconds * 1000;

  // Move focus to the result so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (reveal) (nextRef.current ?? resultRef.current)?.focus({ preventScroll: true });
    if (reveal) resultRef.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
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

  const timer = (
    <span
      role="timer"
      aria-label={`Time on this question: ${formatDuration(elapsed)}. Target about ${formatDuration(question.est_seconds * 1000)}.`}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold tabular-nums transition-colors',
        overTime && !answered ? 'bg-warning-soft text-warning-soft-foreground' : 'bg-muted text-heading',
      )}
    >
      <Clock className="size-3.5" aria-hidden />
      {formatClock(elapsed)}
    </span>
  );

  const showHintButton = !!onHint && question.has_hint && !hint && !answered;
  const lastKey = OPTION_KEYS[Math.min(question.options.length, 9) - 1];
  const correctLetter = reveal?.correctOptionId
    ? OPTION_LETTERS[question.options.findIndex((o) => o.id === reveal.correctOptionId)]
    : null;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-1 flex-col gap-4 px-4 pt-4 sm:gap-5 sm:px-6 sm:pt-6">
      {timerSlot && createPortal(timer, timerSlot)}

      {/* Meta row: where this question sits, difficulty, kind */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <p className="flex w-full min-w-0 items-center gap-1 text-sm text-muted-foreground sm:w-auto sm:flex-1">
          <span className="truncate">{question.section}</span>
          <span aria-hidden className="opacity-70">›</span>
          <span className="truncate font-medium text-foreground">{question.topic}</span>
          {question.subtopic && question.subtopic !== question.topic && (
            <span className="hidden truncate sm:inline">· {question.subtopic}</span>
          )}
        </p>
        <Badge variant={DIFFICULTY_BADGE[question.difficulty]}>{DIFFICULTY_LABEL[question.difficulty]}</Badge>
        <Badge variant="navy">{KIND_LABEL[kind]}</Badge>
        {worth && <span className="text-xs font-medium text-muted-foreground">Worth {worth}</span>}
        {!timerSlot && <span className="ml-auto">{timer}</span>}
      </div>

      {/* Question */}
      <section aria-labelledby={stemId} className="min-w-0 rounded-lg border bg-card p-5 shadow-sm sm:p-7">
        <h2 id={stemId} className="sr-only">Question</h2>
        <Markdown text={question.stem} className="text-[17px] leading-[1.7] text-heading sm:text-lg" />
      </section>

      {/* Options */}
      <div role="group" aria-label="Answer options" className="grid gap-2.5 sm:gap-3">
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
                'group flex min-h-14 w-full items-center gap-3 rounded-lg border-2 bg-card px-3 py-2.5 text-left text-foreground shadow-sm sm:gap-4 sm:px-4',
                'transition-[border-color,background-color,box-shadow,color] duration-200 ease-out disabled:cursor-default',
                state === 'idle' && 'border-border hover:border-navy/35 hover:shadow-md dark:hover:border-navy-soft-foreground/40',
                state === 'picked' && 'border-primary bg-primary-soft text-heading shadow-md',
                state === 'correct' && 'border-success bg-success-soft text-success-soft-foreground',
                state === 'wrong' && 'border-danger bg-danger-soft text-danger-soft-foreground',
                state === 'dim' && 'border-border text-muted-foreground shadow-none',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-lg text-sm font-bold shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)] transition-colors duration-200 ease-out',
                  state === 'idle' && 'bg-navy text-navy-foreground',
                  state === 'picked' && 'bg-primary text-primary-foreground',
                  state === 'correct' && 'bg-success text-status-foreground',
                  state === 'wrong' && 'bg-danger text-status-foreground',
                  state === 'dim' && 'bg-muted text-muted-foreground shadow-none',
                )}
              >
                {state === 'correct' ? <Check className="size-5" strokeWidth={3} /> : state === 'wrong' ? <X className="size-5" strokeWidth={3} /> : OPTION_LETTERS[i]}
              </span>
              <span className="min-w-0 flex-1 text-base leading-snug sm:text-[17px]">
                <span className="sr-only">Option {OPTION_LETTERS[i]}: </span>
                <Markdown text={o.body} inline />
                {state === 'correct' && <span className="sr-only"> (correct answer)</span>}
                {state === 'wrong' && <span className="sr-only"> (your answer, incorrect)</span>}
              </span>
              {!answered && <Kbd className="hidden opacity-70 group-hover:opacity-100 sm:inline-grid">{OPTION_KEYS[i]}</Kbd>}
            </button>
          );
        })}
      </div>

      {/* Hint */}
      {hint && !reveal && (
        <div className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-warning-soft-foreground motion-safe:animate-fade-in" role="note" aria-label="Hint">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold"><Lightbulb className="size-4" aria-hidden /> Hint</p>
          <Markdown text={hint} className="text-sm" />
        </div>
      )}

      {error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{error}</p>}

      {/* Result: feedback banner, then the explanation */}
      {reveal && (
        <div ref={resultRef} tabIndex={-1} role="region" aria-label="Result" className="scroll-mb-28 space-y-3 focus:outline-none">
          <div
            aria-live="assertive"
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3.5 motion-safe:animate-pop sm:p-4',
              reveal.isCorrect ? 'border-success/40 bg-success-soft text-success-soft-foreground' : 'border-danger/30 bg-danger-soft text-danger-soft-foreground',
            )}
          >
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-full text-status-foreground', reveal.isCorrect ? 'bg-success' : 'bg-danger')} aria-hidden>
              {reveal.isCorrect ? <Check className="size-5" strokeWidth={3} /> : <X className="size-5" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="text-lg font-extrabold tracking-tight">
                  {reveal.isCorrect ? (reveal.usedHint ? 'Correct, with a hint' : 'Correct!') : reveal.gaveUp ? "Here's the answer" : 'Not quite'}
                </h2>
                {reveal.reward && (
                  <Badge variant="solid" className="text-sm motion-safe:animate-pop-in"><Sparkles /> {reveal.reward}</Badge>
                )}
              </div>
              {!reveal.isCorrect && correctLetter && (
                <p className="mt-0.5 text-sm">
                  The right answer is <strong>option {correctLetter}</strong>.
                </p>
              )}
              {reveal.timeMs != null && <p className="mt-0.5 text-sm opacity-85">Answered in {formatDuration(reveal.timeMs)}</p>}
            </div>
          </div>

          {resultExtras}

          {reveal.explanation ? (
            <section className="min-w-0 rounded-lg border border-l-4 border-l-navy bg-card p-4 shadow-sm dark:border-l-navy-strong sm:p-5">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Explanation</h3>
              <Markdown text={reveal.explanation} className="text-base text-foreground" />
            </section>
          ) : kind === 'contest' ? (
            <p className="text-sm text-muted-foreground">Answers and explanations open when the contest ends.</p>
          ) : null}
        </div>
      )}

      {/* Keyboard hints (desktop only) */}
      <p className="hidden items-center justify-center gap-1.5 text-xs text-muted-foreground sm:flex" aria-hidden>
        {answered ? (
          <><Kbd>Enter</Kbd> for {nextLabel.toLowerCase()}</>
        ) : (
          <><Kbd>1</Kbd>–<Kbd>{lastKey}</Kbd> to choose <span className="px-1">·</span> <Kbd>Enter</Kbd> to check</>
        )}
      </p>

      {/* Action bar: sticky to the bottom on phones, inline on larger screens. */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-auto border-t bg-card px-4 pb-safe pt-3 shadow-top sm:bottom-4 sm:mx-0 sm:mb-8 sm:rounded-full sm:border sm:p-2 sm:shadow-md">
        <div className="flex items-center gap-2">
          {!answered && showHintButton && (
            <Button
              variant="ghost"
              onClick={() => void showHint()}
              loading={busy === 'hint'}
              disabled={!!busy}
              aria-label={hintCost ? `Show hint (−${hintCost}), costs ${hintCost} XP` : 'Show hint'}
              className="shrink-0 px-3"
            >
              {busy !== 'hint' && <Lightbulb className="text-warning" />}
              {/* The word drops on the narrowest phones so "Check answer" never clips; the label stays. */}
              <span className="max-[379px]:hidden">Hint</span>
              {hintCost ? <span className="rounded-full bg-primary-soft px-1.5 text-xs font-bold text-primary-soft-foreground">−{hintCost} XP</span> : null}
            </Button>
          )}
          {!answered && onSkip && (
            <Button variant="ghost" onClick={() => onSkip(read())} disabled={!!busy} className="shrink-0 px-3">
              <SkipForward /> <span className="sm:hidden">Skip</span><span className="hidden sm:inline">I don't know, skip</span>
            </Button>
          )}
          {answered && onPracticeSimilar && (
            <Button variant="outline" onClick={onPracticeSimilar} className="shrink-0 px-3 sm:px-4" aria-label="Practice similar">
              <Repeat /> <span className="hidden sm:inline">Practice similar</span>
            </Button>
          )}

          {answered ? (
            <Button ref={nextRef} size="lg" onClick={onNext} className="min-w-0 flex-1 px-4 sm:order-3 sm:ml-auto sm:min-w-48 sm:flex-none sm:px-6">
              {nextLabel} <ArrowRight />
            </Button>
          ) : (
            <Button size="lg" className="min-w-0 flex-1 px-4 sm:order-3 sm:ml-auto sm:min-w-48 sm:flex-none sm:px-6" onClick={() => void submit()} disabled={!picked} loading={busy === 'submit'}>
              {kind === 'placement' ? 'Save answer' : 'Check answer'}
            </Button>
          )}

          <Dropdown.Root modal={false}>
            <Dropdown.Trigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions" className="shrink-0 text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="size-5" />
              </Button>
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content
                align="end" side="top" sideOffset={8}
                className="z-50 min-w-56 rounded-lg border bg-card p-1.5 text-card-foreground shadow-lg motion-safe:animate-fade-in"
              >
                {onGiveUp && (
                  <Dropdown.Item className={menuItem} disabled={answered || !!busy} onSelect={() => void giveUp()}>
                    <Eye /> Give up &amp; see answer
                  </Dropdown.Item>
                )}
                <Dropdown.Item className={menuItem} onSelect={() => setReportOpen(true)}>
                  <Flag /> Report a problem
                </Dropdown.Item>
              </Dropdown.Content>
            </Dropdown.Portal>
          </Dropdown.Root>
        </div>
      </div>
      <ReportDialog questionId={question.id} open={reportOpen} onOpenChange={setReportOpen} />
    </div>
  );
};
