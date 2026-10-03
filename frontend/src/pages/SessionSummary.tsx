import { useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowRight, Award, BookOpen, Check, ChevronDown, Clock, Eye, Flame, Home, Lightbulb, Minus, RotateCcw, Share2, Sparkles, Target, Trophy, TrendingUp, X } from 'lucide-react';
import { Markdown } from '@/components/markdown/Markdown';
import { AskTutorButton } from '@/components/solve/AskTutor';
import { loadSummary, type SessionItem, type SessionSummaryData } from '@/components/solve/session';
import type { TutorContext } from '@/lib/tutor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Page } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/context/ToastContext';
import { formatDay, formatDuration, formatPercent, plural } from '@/lib/format';
import { DIFFICULTY_LABEL, OPTION_LETTERS } from '@/lib/game';
import { useDailyResult } from '@/lib/queries';
import type { DailyResult, Outcome } from '@/lib/types';
import { cn } from '@/lib/utils';
import { NotFound } from '@/components/layout/ErrorBoundary';
import { practiceHref } from '@/lib/routes';

const OUTCOME: Record<Outcome, { label: string; icon: typeof Check; className: string; emoji: string }> = {
  correct: { label: 'Correct', icon: Check, className: 'bg-success text-status-foreground', emoji: '🟩' },
  hinted: { label: 'Correct with a hint', icon: Lightbulb, className: 'bg-warning text-status-foreground', emoji: '🟨' },
  wrong: { label: 'Wrong', icon: X, className: 'bg-danger text-status-foreground', emoji: '🟥' },
  gave_up: { label: 'Gave up', icon: Eye, className: 'bg-muted-foreground text-background', emoji: '⬛' },
  unanswered: { label: 'Skipped', icon: Minus, className: 'bg-muted text-muted-foreground border', emoji: '⬜' },
};

const OutcomeRow = ({ outcomes }: { outcomes: Outcome[] }) => (
  <ol className="flex flex-wrap gap-1.5" aria-label="Question results">
    {outcomes.map((o, i) => {
      const { icon: Icon, label, className } = OUTCOME[o];
      return (
        <li key={i} className={cn('grid size-10 place-items-center rounded-md shadow-sm', className)} title={`Question ${i + 1}: ${label}`}>
          <Icon className="size-4" aria-hidden />
          <span className="sr-only">Question {i + 1}: {label}</span>
        </li>
      );
    })}
  </ol>
);

const shareText = (r: DailyResult) =>
  `Aptric daily · ${formatDay(r.set_date, { day: 'numeric', month: 'short', year: 'numeric' })}\n` +
  `${r.correct}/${r.total} ${r.questions.map((q) => OUTCOME[q.outcome].emoji).join('')}\n` +
  (r.current_streak > 0 ? `🔥 ${r.current_streak}-day streak\n` : '') +
  window.location.origin;

const SessionSummary = () => {
  const { state } = useLocation();
  const [params] = useSearchParams();
  const toast = useToast();
  const dailyId = params.get('daily');

  const local = useMemo<SessionSummaryData | null>(() => {
    const s = (state as SessionSummaryData | null) ?? loadSummary();
    if (!s) return null;
    // A stored summary only applies to the daily set in the URL.
    if (dailyId && s.dailySetId !== dailyId) return null;
    if (!dailyId && s.kind === 'daily') return null;
    return s;
  }, [state, dailyId]);

  const daily = useDailyResult(dailyId, !!dailyId);

  if (!dailyId && !local) {
    return <NotFound title="No session to show" message="Your last session's summary isn't available any more. Start a new one from Today or Practice." />;
  }
  if (dailyId && daily.isError) return <Page><ErrorState error={daily.error} onRetry={() => void daily.refetch()} /></Page>;
  if (dailyId && !daily.data) {
    return (
      <Page className="max-w-2xl">
        <LoadingRegion label="Loading your results" className="space-y-4">
          <Skeleton className="h-9 w-64" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
          <Skeleton className="h-40" />
        </LoadingRegion>
      </Page>
    );
  }

  const result = daily.data;
  const items: SessionItem[] = local?.items ?? [];
  const outcomes: Outcome[] = result ? result.questions.map((q) => q.outcome) : items.map((i) => i.outcome);
  const total = result?.total ?? items.length;
  const correct = result?.correct ?? items.filter((i) => i.outcome === 'correct' || i.outcome === 'hinted').length;
  const xp = result?.xp_earned ?? items.reduce((sum, i) => sum + i.xp, 0);
  const timeMs = result?.time_ms ?? items.reduce((sum, i) => sum + (i.timeMs ?? 0), 0);
  const answered = result?.answered ?? items.length;
  const ratingChange = result?.rating ?? local?.ratingChange ?? null;
  const streak = result?.current_streak ?? local?.streak ?? null;
  const incomplete = result ? !result.complete : false;

  // Subtopics with misses this session, for "practice similar".
  const missed = new Map<string, { id: string | null; name: string; difficulty: SessionItem['difficulty'] }>();
  for (const i of items) {
    if (i.outcome === 'wrong' || i.outcome === 'gave_up') missed.set(i.subtopic, { id: i.subtopicId, name: i.subtopic, difficulty: i.difficulty });
  }

  const accuracy = formatPercent(correct, answered || total);
  const headline = incomplete
    ? 'Progress saved'
    : correct === total && total > 0
      ? 'Perfect score!'
      : correct / Math.max(total, 1) >= 0.7 ? 'Great work!' : 'Session complete';

  const share = async () => {
    if (!result) return;
    const text = shareText(result);
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success('Result copied. Paste it anywhere to share.');
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  const perfect = !incomplete && total > 0 && correct === total;
  const reviewable = items.filter((i) => i.review);
  const weakFirst = !incomplete && local?.kind !== 'practice';
  // Aptric Tutor reviews daily and practice answers (never contests).
  const tutorContext: TutorContext | null = local?.kind === 'practice' ? 'practice' : local?.kind === 'contest' ? null : 'daily';

  return (
    <Page className="max-w-2xl space-y-4 sm:space-y-5">
      {/* Hero: score ring, accuracy, time, XP */}
      <Card variant="navy" className="relative overflow-hidden">
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex flex-col items-center gap-5 p-5 text-center sm:flex-row sm:gap-7 sm:p-7 sm:text-left">
          <ScoreRing correct={correct} total={total} perfect={perfect} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-chrome-accent">
                {local?.title ?? (result ? `Daily challenge · ${formatDay(result.set_date)}` : 'Session')}
              </p>
              <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{headline}</h1>
              {incomplete && (
                <p className="text-sm text-navy-muted-foreground">
                  You've answered {answered} of {total}. Come back any time today to finish. Unanswered questions count as misses at midnight.
                </p>
              )}
            </div>
            <dl className="flex flex-wrap justify-center gap-2 sm:justify-start">
              <HeroStat icon={<Target />} label="Accuracy" value={accuracy} />
              <HeroStat icon={<Clock />} label="Time" value={formatDuration(timeMs)} hint={answered ? `${formatDuration(timeMs / answered)} each` : undefined} />
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground [&_svg]:size-4">
                <dt className="contents"><Sparkles aria-hidden /><span className="sr-only">XP earned</span></dt>
                <dd className="tabular-nums">+{xp} XP{local?.bonusXp ? <span className="font-medium"> (incl. {local.bonusXp} bonus)</span> : null}</dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>

      {/* Outcome row */}
      <Card>
        <CardHeader className="pb-3"><CardTitle>Question by question</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <OutcomeRow outcomes={outcomes} />
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Legend">
            {(['correct', 'hinted', 'wrong', 'gave_up', 'unanswered'] as Outcome[]).filter((o) => o !== 'unanswered' || outcomes.includes(o)).map((o) => {
              const { icon: Icon, label, className } = OUTCOME[o];
              return (
                <li key={o} className="flex items-center gap-1.5">
                  <span className={cn('grid size-4 place-items-center rounded', className)} aria-hidden><Icon className="size-3" /></span>{label}
                </li>
              );
            })}
          </ul>
          {result && (
            <p className="text-sm text-muted-foreground">
              {result.level.name ? `${result.level.name} set` : 'Daily set'} · {result.questions.map((q) => DIFFICULTY_LABEL[q.difficulty][0]).join(' ')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Share */}
      {result && !incomplete && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
          <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap rounded-md bg-muted px-3 py-2 font-sans text-sm leading-relaxed text-heading">
            {shareText(result).split('\n').slice(0, -1).join('\n')}
          </pre>
          <Button variant="outline" onClick={() => void share()} className="shrink-0"><Share2 /> Share result</Button>
        </Card>
      )}

      {/* Streak, league and progress updates */}
      {(streak != null || local?.leveledUpTo || local?.newBadges?.length || ratingChange || result?.league) && (
        <ul className="grid grid-cols-2 gap-3" aria-label="Your progress">
          {streak != null && (
            <UpdateCard icon={<Flame className="text-streak" />} label="Streak" value={plural(streak, 'day')} tint="orange" />
          )}
          {result?.league && (
            <UpdateCard icon={<Trophy className="text-gold" />} label={`${result.league.name} league`} value={`#${result.league.rank}`} hint={`of ${result.league.members} this week`} />
          )}
          {ratingChange && (
            <UpdateCard
              icon={<TrendingUp />} label="Rating" value={ratingChange.after}
              hint={<Badge variant={ratingChange.delta >= 0 ? 'success' : 'danger'}>{ratingChange.delta >= 0 ? '+' : ''}{ratingChange.delta} from {ratingChange.before}</Badge>}
            />
          )}
          {local?.leveledUpTo && (
            <UpdateCard icon={<TrendingUp className="text-accent-text" />} label="Level up" value={`Level ${local.leveledUpTo}`} tint="navy" />
          )}
          {local?.newBadges?.map((b) => (
            <UpdateCard
              key={`${b.slug}-${b.topic ?? ''}`} icon={<Award className="text-gold" />} label="New badge"
              value={<><span aria-hidden>{b.icon}</span> {b.name}</>} hint={b.topic ?? undefined}
            />
          ))}
        </ul>
      )}

      {missed.size > 0 && (
        <Card className="space-y-3 p-4 sm:p-5">
          <div className="space-y-0.5">
            <h2 className="font-bold tracking-tight text-heading">Worth another look</h2>
            <p className="text-sm text-muted-foreground">Practise similar questions while it's fresh.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...missed.values()].map((m) => (
              <Button key={m.name} variant="secondary" size="sm" asChild>
                <Link to={practiceHref({ subtopics: m.id ? [m.id] : [], difficulty: m.difficulty, title: m.name })}>
                  <BookOpen /> {m.name}
                </Link>
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Next actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {incomplete && <Button size="lg" asChild><Link to="/solve/daily">Continue challenge <ArrowRight /></Link></Button>}
        {local?.kind === 'practice' && local.againHref && (
          <Button size="lg" asChild><Link to={local.againHref}><RotateCcw /> Keep practising</Link></Button>
        )}
        <Button size="lg" variant={weakFirst ? 'default' : 'outline'} asChild>
          <Link to={practiceHref({ mode: 'weak', title: 'Weak areas' })}><Target /> Practice weak areas</Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link to={local?.kind === 'practice' ? '/practice' : '/'}><Home /> {local?.kind === 'practice' ? 'Back to Practice' : 'Back to Today'}</Link>
        </Button>
        {correct < answered && (
          <Button size="lg" variant="ghost" asChild><Link to="/progress?tab=mistakes">Review mistakes</Link></Button>
        )}
      </div>

      {/* Review list */}
      {reviewable.length > 0 && (
        <section aria-labelledby="review-heading" className="space-y-3 pt-2">
          <h2 id="review-heading" className="text-lg font-bold tracking-tight text-heading">Review your answers</h2>
          <ol className="space-y-2">
            {reviewable.map((item, i) => <ReviewItem key={item.questionId} item={item} number={i + 1} tutorContext={tutorContext} />)}
          </ol>
        </section>
      )}
    </Page>
  );
};

/** Big score inside a ring with an orange-gradient stroke; a confetti burst for a perfect score. */
const ScoreRing = ({ correct, total, perfect }: { correct: number; total: number; perfect: boolean }) => {
  const id = useId().replace(/:/g, '');
  const size = 136;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, correct / total) : 0;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`Score: ${correct} out of ${total}`}>
      {perfect && <Burst />}
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`${id}-score`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--primary)' }} />
            <stop offset="1" style={{ stopColor: 'var(--sky)' }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.14} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id}-score)`} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center" aria-hidden>
        <div className="text-center leading-none">
          <span className="font-display text-4xl font-extrabold tabular-nums tracking-tight">{correct}</span>
          <span className="text-xl font-bold text-navy-muted-foreground"> / {total}</span>
          {perfect && <p className="mt-1.5 text-xs font-bold uppercase tracking-[0.18em] text-chrome-accent">Perfect</p>}
        </div>
      </div>
    </div>
  );
};

const BURST_COLORS = ['bg-primary', 'bg-sky', 'bg-navy-foreground', 'bg-success'];

/** CSS-only confetti; .confetti hides it under reduced motion (OS or in-app). */
const Burst = () => (
  <span aria-hidden className="confetti pointer-events-none absolute inset-0">
    {Array.from({ length: 14 }, (_, i) => {
      const angle = (i / 14) * Math.PI * 2;
      const dist = 84 + (i % 3) * 14;
      return (
        <span
          key={i}
          className={cn('absolute left-1/2 top-1/2 size-2 rounded-full opacity-0 animate-burst', BURST_COLORS[i % BURST_COLORS.length], i % 2 && 'size-1.5 rounded-sm')}
          style={{
            '--burst-x': `${Math.round(Math.cos(angle) * dist)}px`,
            '--burst-y': `${Math.round(Math.sin(angle) * dist)}px`,
            animationDelay: `${150 + (i % 4) * 60}ms`,
          } as CSSProperties}
        />
      );
    })}
  </span>
);

const HeroStat = ({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: string }) => (
  <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm [&_svg]:size-4 [&_svg]:text-navy-muted-foreground">
    <dt className="contents">{icon}<span className="sr-only">{label}</span></dt>
    <dd className="font-bold tabular-nums">{value}{hint && <span className="font-medium text-navy-muted-foreground"> · {hint}</span>}</dd>
  </div>
);

const UpdateCard = ({ icon, label, value, hint, tint }: {
  icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; tint?: 'orange' | 'navy';
}) => (
  <li
    className={cn(
      'flex items-center gap-3 rounded-lg border p-3 shadow-sm sm:p-4',
      tint === 'orange' ? 'border-primary/25 bg-primary-soft' : tint === 'navy' ? 'border-transparent bg-navy-soft' : 'bg-card',
    )}
  >
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card shadow-sm [&_svg]:size-5" aria-hidden>{icon}</span>
    <div className="min-w-0">
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p className="truncate font-extrabold tracking-tight text-heading">{value}</p>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  </li>
);

const ReviewItem = ({ item, number, tutorContext }: { item: SessionItem; number: number; tutorContext: TutorContext | null }) => {
  const review = item.review!;
  const { icon: Icon, label, className } = OUTCOME[item.outcome];
  return (
    <li>
      <details className="group overflow-hidden rounded-lg border bg-card shadow-sm open:shadow-md">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 sm:px-4 [&::-webkit-details-marker]:hidden">
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', className)} aria-hidden><Icon className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-heading">Question {number}<span className="sr-only">: {label}</span> · {item.subtopic}</span>
            <span className="block text-xs text-muted-foreground">
              {DIFFICULTY_LABEL[item.difficulty]}{item.timeMs != null ? ` · ${formatDuration(item.timeMs)}` : ''}{item.xp > 0 ? ` · +${item.xp} XP` : ''}
            </span>
          </span>
          <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-3 border-t p-4 sm:p-5">
          <Markdown text={review.stem} className="text-base text-heading" />
          <ul className="space-y-1.5">
            {review.options.map((o, i) => {
              const isCorrect = o.id === review.correctOptionId;
              const isYours = o.id === review.selectedOptionId;
              return (
                <li
                  key={o.id}
                  className={cn(
                    'flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm',
                    isCorrect ? 'border-success/50 bg-success-soft text-success-soft-foreground'
                      : isYours ? 'border-danger/40 bg-danger-soft text-danger-soft-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span className="font-bold">{OPTION_LETTERS[i]}</span>
                  <span className="min-w-0 flex-1"><Markdown text={o.body} inline /></span>
                  {(isCorrect || isYours) && (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-bold">
                      {isCorrect ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                      {isCorrect && isYours ? 'Your answer · correct' : isCorrect ? 'Correct answer' : 'Your answer'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {review.selectedOptionId === null && <p className="text-sm text-muted-foreground">You gave up on this one.</p>}
          {review.explanation && (
            <div className="rounded-md border border-l-4 border-l-navy bg-card p-3 dark:border-l-navy-strong sm:p-4">
              <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Explanation</h3>
              <Markdown text={review.explanation} className="text-sm" />
            </div>
          )}
          {tutorContext && (
            <AskTutorButton questionId={item.questionId} context={tutorContext} topic={item.subtopic} explanation={review.explanation} />
          )}
        </div>
      </details>
    </li>
  );
};

export default SessionSummary;
