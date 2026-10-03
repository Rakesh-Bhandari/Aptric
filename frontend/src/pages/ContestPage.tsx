import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Check, ListChecks, Play, Timer, Trophy, Users, X } from 'lucide-react';
import { NotFound } from '@/components/layout/ErrorBoundary';
import { Markdown } from '@/components/markdown/Markdown';
import { SessionHeader } from '@/components/solve/SessionHeader';
import { SolveScreen } from '@/components/solve/SolveScreen';
import { ContestStateBadge } from '@/components/compete/ContestStateBadge';
import { LiveIndicator, PlayerLink, StandingRow } from '@/components/compete/standings';
import { countdownParts, formatSpan, useNow } from '@/components/compete/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';
import { displayName, formatClock, formatDateTime, formatRelative, plural } from '@/lib/format';
import { contestPoints, DIFFICULTY_LABEL, OPTION_LETTERS } from '@/lib/game';
import { keys, queryClient, useContest, useContestStandings } from '@/lib/queries';
import type { ContestDetail, ContestQuestion } from '@/lib/types';
import { cn } from '@/lib/utils';
import { fromCard } from './solve/news';

const refresh = (id: string) => Promise.all([
  queryClient.invalidateQueries({ queryKey: keys.contest(id) }),
  queryClient.invalidateQueries({ queryKey: keys.standings(id) }),
  queryClient.invalidateQueries({ queryKey: keys.contests }),
]);

const Standings = ({ contest }: { contest: ContestDetail }) => {
  const standings = useContestStandings(contest.id, contest.state === 'live');
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><Users className="size-5 text-muted-foreground" aria-hidden /> {contest.state === 'ended' ? 'Results' : 'Standings'}</CardTitle>
          {contest.state === 'live' && <LiveIndicator every="few seconds" />}
        </div>
        <CardDescription>Most points wins; ties go to whoever was faster.</CardDescription>
      </CardHeader>
      {standings.isError && <div className="px-4 pb-4"><ErrorState error={standings.error} onRetry={() => void standings.refetch()} /></div>}
      {!standings.data && !standings.isError && <LoadingRegion className="space-y-2 px-4 pb-4"><Skeleton className="h-14" /><Skeleton className="h-14" /></LoadingRegion>}
      {standings.data && standings.data.entries.length === 0 && <div className="px-4 pb-5 sm:px-5"><EmptyState icon={<Users />} title="No entries yet">Standings appear once players start answering.</EmptyState></div>}
      {standings.data && standings.data.entries.length > 0 && (
        <ol className="divide-y border-t" aria-label="Contest standings">
          {standings.data.entries.map((e) => (
            <StandingRow key={e.user_id} rank={e.rank} me={e.is_me} player={<PlayerLink handle={e.handle} name={displayName(e)} avatar={e.avatar_url} />}>
              <span className="block font-bold tabular-nums text-heading">{e.score} pts</span>
              <span className="text-xs tabular-nums text-muted-foreground">{e.correct}/{contest.question_count} · {formatClock(e.time_ms)}</span>
            </StandingRow>
          ))}
        </ol>
      )}
    </Card>
  );
};

const Review = ({ questions }: { questions: ContestQuestion[] }) => (
  <Card>
    <CardHeader className="pb-3"><CardTitle>Answers and explanations</CardTitle><CardDescription>Tap a question to see the answer and how to solve it.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {questions.map((q, i) => {
        const correctIndex = q.options.findIndex((o) => o.id === q.correct_option_id);
        return (
          <details key={q.id} className="group rounded-md border bg-card p-3 open:shadow-sm">
            <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 font-semibold text-heading">
              {q.answer ? (
                q.answer.is_correct ? <Check className="size-4 text-success" aria-label="Correct" /> : <X className="size-4 text-danger" aria-label="Wrong" />
              ) : <span className="size-4 rounded-full border" aria-label="Not answered" />}
              Question {i + 1}
              <Badge variant="muted" className="ml-auto">{DIFFICULTY_LABEL[q.difficulty]}</Badge>
            </summary>
            <div className="mt-3 space-y-3">
              <Markdown text={q.stem} />
              <ol className="space-y-1.5">
                {q.options.map((o, k) => (
                  <li key={o.id} className={cn('flex gap-2 rounded-md border px-3 py-2 text-sm',
                    o.id === q.correct_option_id && 'border-success bg-success-soft text-success-soft-foreground',
                    o.id === q.answer?.selected_option_id && !q.answer.is_correct && 'border-danger bg-danger-soft text-danger-soft-foreground')}
                  >
                    <span className="font-semibold">{OPTION_LETTERS[k]}.</span> <Markdown text={o.body} inline />
                  </li>
                ))}
              </ol>
              {correctIndex >= 0 && <p className="text-sm">Answer: <strong>{OPTION_LETTERS[correctIndex]}</strong></p>}
              {q.explanation && <div className="rounded-md bg-muted p-3"><Markdown text={q.explanation} /></div>}
            </div>
          </details>
        );
      })}
    </CardContent>
  </Card>
);

const ContestRunner = ({ contest, onDone }: { contest: ContestDetail; onDone: () => void }) => {
  const [queue] = useState(() => (contest.questions ?? []).filter((q) => !q.answer));
  const [index, setIndex] = useState(0);
  const question = queue[index];
  if (!question) return null;
  const answeredBefore = (contest.questions?.length ?? 0) - queue.length;
  const last = index === queue.length - 1;
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SessionHeader title={contest.title} index={answeredBefore + index} total={contest.question_count} onExit={onDone} exitLabel="Leave contest (answers are saved)" />
      <SolveScreen
        key={question.id}
        question={fromCard(question)}
        kind="contest"
        worth={`${contestPoints(question.difficulty)} points`}
        onSubmit={async (optionId, timeMs) => {
          const r = await api.submitContestAnswer({ contestId: contest.id, questionId: question.id, optionId, timeMs });
          return {
            isCorrect: r.is_correct, selectedOptionId: optionId, gaveUp: false, correctOptionId: null, explanation: null,
            usedHint: false, reward: r.points > 0 ? `+${r.points} points` : null, timeMs,
          };
        }}
        onNext={() => (last ? onDone() : setIndex((i) => i + 1))}
        nextLabel={last ? 'Finish' : 'Next question'}
      />
    </div>
  );
};

const ContestPage = () => {
  const { id = '' } = useParams();
  const contest = useContest(id);
  const toast = useToast();
  const [playing, setPlaying] = useState(false);
  const [joining, setJoining] = useState(false);

  if (contest.isError) {
    if (['P0002', '22P02'].includes(errorCode(contest.error) ?? '')) return <NotFound title="Contest not found" message="It may have been removed, or the link is wrong." />;
    return <Page><ErrorState error={contest.error} onRetry={() => void contest.refetch()} /></Page>;
  }
  if (!contest.data) {
    return <Page className="max-w-3xl"><LoadingRegion className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40" /><Skeleton className="h-64" /></LoadingRegion></Page>;
  }
  const c = contest.data;

  if (playing && c.state === 'live' && c.joined && c.questions) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
        <ContestRunner contest={c} onDone={() => { setPlaying(false); void refresh(c.id); }} />
      </div>
    );
  }

  const join = async (thenPlay: boolean) => {
    setJoining(true);
    try {
      await api.joinContest(c.id);
      await refresh(c.id);
      toast.success(c.state === 'upcoming' ? "You're registered. We'll see you at the start!" : "You're in. Good luck!");
      if (thenPlay) setPlaying(true);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setJoining(false);
    }
  };

  const answered = c.questions?.filter((q) => q.answer).length ?? c.my_entry?.answered ?? 0;
  const remaining = c.question_count - answered;

  return (
    <Page className="max-w-3xl space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2"><Link to="/compete?tab=contests"><ArrowLeft /> All contests</Link></Button>

      <Card variant="navy" className="relative overflow-hidden shadow-md">
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-dots" />
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-violet/35 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 size-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative space-y-5 p-5 sm:p-7">
          <div className="space-y-2">
            <ContestStateBadge c={c} onDark />
            <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{c.title}</h1>
            {c.description && <p className="text-navy-muted-foreground">{c.description}</p>}
          </div>

          {c.state !== 'ended' && <Countdown label={c.state === 'live' ? 'Ends in' : 'Starts in'} at={c.state === 'live' ? c.ends_at : c.starts_at} />}

          <ul className="flex flex-wrap gap-2 text-xs font-semibold" aria-label="Contest details">
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><CalendarClock className="size-3.5" aria-hidden /> {formatDateTime(c.starts_at)} – {formatDateTime(c.ends_at)}</li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><ListChecks className="size-3.5" aria-hidden /> {plural(c.question_count, 'question')}</li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Timer className="size-3.5" aria-hidden /> {formatSpan(c.starts_at, c.ends_at)}</li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Users className="size-3.5" aria-hidden /> {plural(c.participants, 'player')}</li>
          </ul>

          {c.state !== 'ended' && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-chrome-accent">Rules</h2>
              <ul className="grid gap-1.5 text-sm text-navy-muted-foreground sm:grid-cols-2">
                {[
                  `Everyone answers the same ${plural(c.question_count, 'question')}.`,
                  'Each answer is final, and there are no hints.',
                  `Points by difficulty: easy ${contestPoints('easy')}, medium ${contestPoints('medium')}, hard ${contestPoints('hard')}.`,
                  'Most points wins; ties go to whoever was faster.',
                ].map((rule) => (
                  <li key={rule} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-chrome-accent" aria-hidden /> {rule}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-navy-muted-foreground [&_strong]:text-navy-foreground">
              {c.state === 'upcoming' && (c.joined
                ? <p>You're registered. The contest opens {formatRelative(c.starts_at)}.</p>
                : <p>Register now and we'll keep your spot. Questions open {formatRelative(c.starts_at)}.</p>)}
              {c.state === 'live' && !c.joined && <p>Ready? Take your time: each answer is final.</p>}
              {c.state === 'live' && c.joined && (remaining > 0
                ? <p>{answered > 0 ? <>You've answered <strong>{answered} of {c.question_count}</strong>.</> : 'Ready when you are.'} The contest closes {formatRelative(c.ends_at)}.</p>
                : <p>You've answered every question. Final results and explanations appear {formatRelative(c.ends_at)}.</p>)}
              {c.state === 'ended' && (c.my_entry
                ? (
                  <p className="flex items-center gap-2 text-base">
                    <Trophy className="size-5 shrink-0 text-medal-gold" aria-hidden />
                    <span>You finished <strong>#{c.my_entry.rank}</strong> with <strong>{c.my_entry.score} points</strong> ({c.my_entry.correct} of {c.question_count} right).</span>
                  </p>
                )
                : <p>This contest has ended. You can still look at the questions and answers below.</p>)}
            </div>
            {c.state === 'upcoming' && !c.joined && <Button size="lg" className="shrink-0" onClick={() => void join(false)} loading={joining}>Register</Button>}
            {c.state === 'live' && !c.joined && <Button size="lg" className="shrink-0" onClick={() => void join(true)} loading={joining}><Play /> Enter and start</Button>}
            {c.state === 'live' && c.joined && remaining > 0 && <Button size="lg" className="shrink-0" onClick={() => setPlaying(true)}><Play /> {answered > 0 ? 'Continue' : 'Start'}</Button>}
          </div>
        </div>
      </Card>

      {c.state !== 'upcoming' && <Standings contest={c} />}
      {c.state === 'ended' && c.questions && <Review questions={c.questions} />}
    </Page>
  );
};

/** Big tabular countdown: days, hours, minutes, seconds. */
const Countdown = ({ label, at }: { label: string; at: string }) => {
  const now = useNow(1000);
  const { d, h, m, s } = countdownParts(at, now);
  const parts: [number, string][] = [[d, 'days'], [h, 'hours'], [m, 'min'], [s, 'sec']];
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-navy-muted-foreground" id="contest-countdown">{label}</p>
      <time dateTime={at} aria-labelledby="contest-countdown" className="flex gap-2 sm:gap-3">
        {parts.map(([value, unit], i) => (
          <span key={unit} className={cn('flex min-w-16 flex-col items-center rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10 sm:min-w-20', i === 0 && d === 0 && 'hidden sm:flex')}>
            <span className="font-display text-3xl font-extrabold tabular-nums leading-none text-sky sm:text-4xl">{String(value).padStart(2, '0')}</span>
            <span className="mt-1 text-[0.7rem] font-semibold uppercase tracking-wider text-navy-muted-foreground">{unit}</span>
          </span>
        ))}
      </time>
    </div>
  );
};

export default ContestPage;
