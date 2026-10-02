import { useMemo } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Award, BookOpen, Check, Clock, Flame, Home, Lightbulb, Minus, RotateCcw, Share2, Sparkles, Target, Trophy, TrendingUp, X } from 'lucide-react';
import { loadSummary, type SessionItem, type SessionSummaryData } from '@/components/solve/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, StatTile } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/context/ToastContext';
import { formatDay, formatDuration, formatPercent, plural } from '@/lib/format';
import { DIFFICULTY_LABEL } from '@/lib/game';
import { useDailyResult } from '@/lib/queries';
import type { DailyResult, Outcome } from '@/lib/types';
import { cn } from '@/lib/utils';
import { NotFound } from '@/components/layout/ErrorBoundary';
import { practiceHref } from '@/lib/routes';

const OUTCOME: Record<Outcome, { label: string; icon: typeof Check; className: string; emoji: string }> = {
  correct: { label: 'Correct', icon: Check, className: 'bg-success text-white dark:text-background', emoji: '🟩' },
  hinted: { label: 'Correct with a hint', icon: Lightbulb, className: 'bg-warning text-white dark:text-background', emoji: '🟨' },
  wrong: { label: 'Wrong', icon: X, className: 'bg-danger text-white dark:text-background', emoji: '🟥' },
  gave_up: { label: 'Gave up', icon: Minus, className: 'bg-muted-foreground text-background', emoji: '⬛' },
  unanswered: { label: 'Not answered', icon: Minus, className: 'bg-muted text-muted-foreground border', emoji: '⬜' },
};

const OutcomeRow = ({ outcomes }: { outcomes: Outcome[] }) => (
  <ol className="flex flex-wrap gap-1.5" aria-label="Question results">
    {outcomes.map((o, i) => {
      const { icon: Icon, label, className } = OUTCOME[o];
      return (
        <li key={i} className={cn('grid size-9 place-items-center rounded-md', className)} title={`Question ${i + 1}: ${label}`}>
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

  return (
    <Page className="max-w-2xl space-y-5">
      <div className="space-y-1">
        <p className="text-sm font-medium text-accent-text">{local?.title ?? (result ? `Daily challenge · ${formatDay(result.set_date)}` : 'Session')}</p>
        <h1 className="text-3xl font-bold tracking-tight">{headline}</h1>
        {incomplete && (
          <p className="text-muted-foreground">
            You've answered {answered} of {total}. Come back any time today to finish. Unanswered questions count as misses at midnight.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={<Target />} label="Score" value={`${correct}/${total}`} hint={`${accuracy} accuracy`} />
        <StatTile icon={<Sparkles />} label="XP earned" value={`+${xp}`} hint={local?.bonusXp ? `incl. ${local.bonusXp} bonus` : undefined} />
        <StatTile icon={<Clock />} label="Time" value={formatDuration(timeMs)} hint={answered ? `${formatDuration(timeMs / answered)} per question` : undefined} />
        {streak != null
          ? <StatTile icon={<Flame className="text-streak" />} label="Streak" value={plural(streak, 'day')} />
          : <StatTile icon={<Check />} label="Answered" value={answered} />}
      </div>

      <Card>
        <CardHeader><CardTitle>Question by question</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <OutcomeRow outcomes={outcomes} />
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
            {(['correct', 'hinted', 'wrong', 'gave_up'] as Outcome[]).map((o) => (
              <li key={o} className="flex items-center gap-1.5"><span className={cn('size-3 rounded-sm', OUTCOME[o].className)} aria-hidden />{OUTCOME[o].label}</li>
            ))}
          </ul>
          {result && (
            <p className="text-sm text-muted-foreground">
              {result.level.name ? `${result.level.name} set` : 'Daily set'} · {result.questions.map((q) => DIFFICULTY_LABEL[q.difficulty][0]).join(' ')}
            </p>
          )}
        </CardContent>
      </Card>

      {(local?.leveledUpTo || local?.newBadges?.length || ratingChange || result?.league) && (
        <Card>
          <CardHeader><CardTitle>Your progress</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {local?.leveledUpTo && (
                <li className="flex items-center gap-2"><TrendingUp className="size-4 text-accent-text" aria-hidden /> You reached <strong>level {local.leveledUpTo}</strong>.</li>
              )}
              {local?.newBadges?.map((b) => (
                <li key={`${b.slug}-${b.topic ?? ''}`} className="flex items-center gap-2">
                  <Award className="size-4 text-gold" aria-hidden /> New badge: <span aria-hidden>{b.icon}</span> <strong>{b.name}</strong>{b.topic ? ` (${b.topic})` : ''}
                </li>
              ))}
              {ratingChange && (
                <li className="flex items-center gap-2">
                  <TrendingUp className="size-4" aria-hidden />
                  Rating {ratingChange.before} → <strong>{ratingChange.after}</strong>
                  <Badge variant={ratingChange.delta >= 0 ? 'success' : 'danger'}>{ratingChange.delta >= 0 ? '+' : ''}{ratingChange.delta}</Badge>
                </li>
              )}
              {result?.league && (
                <li className="flex items-center gap-2">
                  <Trophy className="size-4 text-gold" aria-hidden /> You're <strong>#{result.league.rank}</strong> of {result.league.members} in the {result.league.name} league this week.
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {missed.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Worth another look</CardTitle>
            <p className="text-sm text-muted-foreground">Practice similar questions while it's fresh.</p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[...missed.values()].map((m) => (
              <Button key={m.name} variant="outline" size="sm" asChild>
                <Link to={practiceHref({ subtopics: m.id ? [m.id] : [], difficulty: m.difficulty, title: m.name })}>
                  <BookOpen /> {m.name}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {local?.kind === 'practice' && local.againHref && (
          <Button size="lg" asChild><Link to={local.againHref}><RotateCcw /> Keep practising</Link></Button>
        )}
        {result && !incomplete && <Button size="lg" onClick={() => void share()}><Share2 /> Share result</Button>}
        {incomplete && <Button size="lg" asChild><Link to="/solve/daily">Continue challenge</Link></Button>}
        <Button size="lg" variant="outline" asChild><Link to={practiceHref({ mode: 'weak', title: 'Weak areas' })}>Practice weak areas</Link></Button>
        {correct < answered && <Button size="lg" variant="outline" asChild><Link to="/progress?tab=mistakes">Review mistakes</Link></Button>}
        <Button size="lg" variant="ghost" asChild><Link to={local?.kind === 'practice' ? '/practice' : '/'}><Home /> {local?.kind === 'practice' ? 'Back to Practice' : 'Back to Today'}</Link></Button>
      </div>
    </Page>
  );
};

export default SessionSummary;
