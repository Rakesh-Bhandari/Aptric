import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { ArrowRight, Check, ChevronDown, Clock, EyeOff, Eye, Flag, Lightbulb, MoreHorizontal, Repeat, ShieldAlert, SkipForward, Sparkles, X } from 'lucide-react';
import { Markdown } from '@/components/markdown/Markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/context/ToastContext';
import { useElapsed } from '@/hooks/useElapsed';
import { useCopyProtection, useTabSwitchGuard } from '@/hooks/useExamGuard';
import { prefersReducedMotion } from '@/hooks/useReveal';
import { useSolveKeys } from '@/hooks/useSolveKeys';
import { friendlyError } from '@/lib/errors';
import { formatClock, formatDuration, plural } from '@/lib/format';
import { DIFFICULTY_LABEL, OPTION_KEYS, OPTION_LETTERS } from '@/lib/game';
import type { TutorIntent } from '@/lib/tutor';
import type { Difficulty, QuestionOption } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ReportDialog } from './ReportDialog';
import { SESSION_TIMER_SLOT } from './SessionHeader';
import { TutorFab } from './AskTutor';
import { TutorPanel, type TutorRequest } from './TutorPanel';

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
const DIFFICULTY_BADGE = { easy: 'success', medium: 'blue', hard: 'danger' } as const;

interface Props {
  question: SolveQuestion;
  kind: SolveKind;
  /** Points this question is worth, e.g. "20 XP". */
  worth?: string | null;
  /** The stored hint when the player already paid for it (daily set). */
  initialHint?: string | null;
  /** Submit and return what to reveal; for placement return null (no feedback until the end). */
  onSubmit: (optionId: string, timeMs: number) => Promise<Reveal | null>;
  /**
   * The stored hint through use_hint. With the tutor it is only the fallback
   * when the tutor is unavailable (the tutor charges the hint server-side).
   */
  onHint?: () => Promise<string | null>;
  /** Offer Aptric Tutor (daily and practice only; never contests or placement). */
  tutor?: boolean;
  hintCost?: number;
  onGiveUp?: (timeMs: number) => Promise<Reveal>;
  /** Placement only: move on without answering. */
  onSkip?: (timeMs: number) => void;
  onNext: () => void;
  nextLabel: string;
  onPracticeSimilar?: () => void;
  /** Extra content under the result (e.g. level-up news). */
  resultExtras?: ReactNode;
  /**
   * The "Detect tab switches in Practice" setting. It only ever applies to practice: daily and
   * placement always detect, and contests are guarded by the contest runner, which ends the attempt.
   */
  detectTabSwitches?: boolean;
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
  onPracticeSimilar, resultExtras, tutor = false, detectTabSwitches = true,
}: Props) => {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'submit' | 'giveup'>(null);
  const [usedHint, setUsedHint] = useState(!!initialHint);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  // Aptric Tutor: daily and practice only (contests and placement never get it).
  const tutorEnabled = tutor && (kind === 'daily' || kind === 'practice');
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorRequest, setTutorRequest] = useState<TutorRequest | null>(null);
  const [explanationOpen, setExplanationOpen] = useState(!tutorEnabled);
  const nonce = useRef(0);
  const [error, setError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const { elapsed, read } = useElapsed(!reveal);
  const toast = useToast();
  const stemId = useId();
  const resultRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const timerSlot = useTimerSlot();

  const answered = !!reveal;
  useCopyProtection();
  const detect = kind === 'practice' ? detectTabSwitches : kind !== 'contest';
  // Leaving the page only matters while the question is still open.
  const guard = useTabSwitchGuard(detect && !answered);
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

  /** Opens the tutor, optionally sending a quick action right away. */
  const openTutor = (intent: TutorIntent | null) => {
    if (!tutorEnabled) return;
    nonce.current += 1;
    setTutorRequest({ intent, nonce: nonce.current });
    setTutorOpen(true);
  };

  // The tutor's fallback when it's unavailable: the stored hint, charged as before.
  const fallbackHint = onHint
    ? async () => {
      if (initialHint) return initialHint;
      const text = await onHint();
      if (text) setUsedHint(true);
      return text;
    }
    : undefined;

  const giveUp = async (fromTutor = false) => {
    if (!onGiveUp || busy || answered) return;
    if (fromTutor) setTutorOpen(false);
    const ok = await toast.confirm({
      title: 'Give up on this question?',
      message: "You'll see the answer and explanation, but this question won't earn any XP.",
      confirmText: 'Show me the answer',
      cancelText: 'Keep trying',
    });
    if (!ok) {
      if (fromTutor) setTutorOpen(true);
      return;
    }
    setBusy('giveup');
    setError('');
    try {
      setReveal(await onGiveUp(read()));
      openTutor('explain');
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
    onTutor: tutorEnabled ? () => openTutor(null) : undefined,
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

  const showHintButton = tutorEnabled && !answered;
  const hintCostChip = hintCost && question.has_hint && !usedHint ? hintCost : null;
  const lastKey = OPTION_KEYS[Math.min(question.options.length, 9) - 1];
  const correctLetter = reveal?.correctOptionId
    ? OPTION_LETTERS[question.options.findIndex((o) => o.id === reveal.correctOptionId)]
    : null;

  return (
    <div
      className={cn(
        'mx-auto flex w-full min-w-0 max-w-2xl flex-1 flex-col gap-4 px-4 pt-4 sm:gap-5 sm:px-6 sm:pt-6',
        (guard.away || guard.warning) && 'blur-lg',
      )}
    >
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
        <Badge variant="default">{KIND_LABEL[kind]}</Badge>
        {worth && <span className="text-xs font-medium text-muted-foreground">Worth {worth}</span>}
        {detect && guard.count > 0 && (
          <Badge variant="danger" title="Times you left this page during a question">
            <ShieldAlert /> {plural(guard.count, 'tab switch', 'tab switches')}
          </Badge>
        )}
        {!timerSlot && <span className="ml-auto">{timer}</span>}
      </div>

      {/* Question */}
      <section aria-labelledby={stemId} className="min-w-0 rounded-lg border bg-card p-5 shadow-sm sm:p-7">
        <h2 id={stemId} className="sr-only">Question</h2>
        <Markdown text={question.stem} className="text-[17px] leading-[1.75] text-foreground sm:text-lg" />
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
                state === 'idle' && 'border-border hover:border-hover-border hover:shadow-md',
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
                  state === 'picked' && 'bg-primary bg-gradient-primary text-primary-foreground',
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

      {error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{error}</p>}

      {/* Result: feedback banner, then the explanation */}
      {reveal && (
        <div
          ref={resultRef} tabIndex={-1} role="region" aria-label="Result"
          // On phones, room under the explanation so the floating Tutor button never covers its last line.
          className={cn('scroll-mb-28 space-y-3 focus:outline-none', tutorEnabled && 'max-sm:pb-16')}
        >
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
                  <Badge variant="solid" className="bg-gradient-primary text-sm motion-safe:animate-pop-in"><Sparkles /> {reveal.reward}</Badge>
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
            <section className="accent-left min-w-0 rounded-lg border bg-card shadow-sm">
              <h3>
                <button
                  type="button"
                  aria-expanded={explanationOpen}
                  aria-controls={`${stemId}-explanation`}
                  onClick={() => setExplanationOpen((o) => !o)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground sm:px-5"
                >
                  Official explanation
                  <ChevronDown aria-hidden className={cn('size-4 transition-transform duration-200', explanationOpen && 'rotate-180')} />
                </button>
              </h3>
              {explanationOpen && (
                <div id={`${stemId}-explanation`} className="px-4 pb-4 sm:px-5 sm:pb-5">
                  <Markdown text={reveal.explanation} className="text-base text-foreground" />
                </div>
              )}
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
        {tutorEnabled && <><span className="px-1">·</span> <Kbd>H</Kbd> tutor</>}
      </p>

      {/* Action bar: sticky to the bottom on phones, inline on larger screens. */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-auto border-t bg-card px-4 pb-safe pt-3 shadow-top sm:bottom-4 sm:mx-0 sm:mb-8 sm:rounded-full sm:border sm:p-2 sm:shadow-md">
        <div className="flex items-center gap-2">
          {showHintButton && (
            <Button
              variant="ghost"
              onClick={() => openTutor('hint')}
              disabled={!!busy}
              aria-label={hintCostChip ? `Show hint (−${hintCostChip}), costs ${hintCostChip} XP` : 'Show hint'}
              aria-keyshortcuts="H"
              className="shrink-0 px-3"
            >
              <Lightbulb className="text-warning" />
              {/* The word drops on the narrowest phones so "Check answer" never clips; the label stays. */}
              <span className="max-[379px]:hidden">Hint</span>
              {hintCostChip ? <span className="rounded-full bg-primary-soft px-1.5 text-xs font-bold text-primary-soft-foreground">−{hintCostChip} XP</span> : null}
            </Button>
          )}
          {!answered && onSkip && (
            <Button variant="ghost" onClick={() => onSkip(read())} disabled={!!busy} className="shrink-0 px-3">
              <SkipForward /> <span className="sm:hidden">Skip</span><span className="hidden sm:inline">I don't know, skip</span>
            </Button>
          )}
          {answered && tutorEnabled && (
            <Button variant="outline" onClick={() => openTutor(null)} className="shrink-0 px-3 sm:px-4" aria-label="Ask Tutor" aria-keyshortcuts="H">
              <Sparkles className="text-violet-text" /> <span className="hidden sm:inline">Ask Tutor</span>
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
      {tutorEnabled && !tutorOpen && !guard.away && <TutorFab onClick={() => openTutor(null)} />}
      {tutorEnabled && (
        <TutorPanel
          open={tutorOpen}
          onOpenChange={setTutorOpen}
          questionId={question.id}
          context={kind as 'daily' | 'practice'}
          topic={question.subtopic || question.topic}
          answered={answered}
          request={tutorRequest}
          hintUsed={usedHint}
          hintCost={hintCost}
          onHintUsed={() => setUsedHint(true)}
          onRequireGiveUp={() => void giveUp(true)}
          fallbackHint={fallbackHint}
          fallbackExplanation={reveal?.explanation ?? null}
          onAvailability={(ok) => {
            // Without the tutor, the official explanation is the explanation.
            if (!ok) setExplanationOpen(true);
          }}
        />
      )}

      {/* Hide the question while the player is away, so it can't be read from another window or a screenshot. */}
      {guard.away && createPortal(
        <div className="fixed inset-0 z-[60] grid place-items-center bg-background p-6 text-center" aria-hidden>
          <div className="space-y-2">
            <EyeOff className="mx-auto size-8 text-muted-foreground" />
            <p className="text-lg font-bold text-heading">Question hidden</p>
            <p className="text-sm text-muted-foreground">Come back to this tab to continue.</p>
          </div>
        </div>,
        document.body,
      )}

      <Dialog open={!!guard.warning} onOpenChange={(open) => { if (!open) guard.acknowledge(); }}>
        <DialogContent title={<span className="flex items-center gap-2"><ShieldAlert className="size-5 text-danger" aria-hidden /> Tab switch detected</span>} hideClose>
          <div className="space-y-3 text-sm text-foreground">
            <p>
              You left this question for <strong>{formatDuration(guard.warning?.awayMs ?? 0)}</strong>.
              {' '}That's <strong>{plural(guard.warning?.count ?? 0, 'tab switch', 'tab switches')}</strong> this session.
            </p>
            <p className="text-muted-foreground">
              {kind === 'contest'
                ? 'Switching tabs or apps during a contest breaks fair play. Stay on this page until you have answered.'
                : 'Stay on this page until you have answered, so your practice matches real exam conditions.'}
            </p>
            <Button className="w-full" onClick={guard.acknowledge}>Back to the question</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
