import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Clock, Play, Users, X } from 'lucide-react';
import { NotFound } from '@/components/layout/ErrorBoundary';
import { Markdown } from '@/components/markdown/Markdown';
import { SessionHeader } from '@/components/solve/SessionHeader';
import { SolveScreen } from '@/components/solve/SolveScreen';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';
import { displayName, formatClock, formatDateTime, formatRelative, plural } from '@/lib/format';
import { contestPoints, DIFFICULTY_LABEL, OPTION_LETTERS } from '@/lib/game';
import { keys, queryClient, useContest, useContestStandings } from '@/lib/queries';
import type { ContestDetail, ContestQuestion } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ContestStateBadge } from './Compete';
import { fromCard } from './solve/news';

const refresh = (id: string) => Promise.all([
  queryClient.invalidateQueries({ queryKey: keys.contest(id) }),
  queryClient.invalidateQueries({ queryKey: keys.standings(id) }),
  queryClient.invalidateQueries({ queryKey: keys.contests }),
]);

const Standings = ({ contest }: { contest: ContestDetail }) => {
  const standings = useContestStandings(contest.id, contest.state === 'live');
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2"><Users className="size-5" aria-hidden /> Standings</CardTitle>
        <CardDescription>Most points wins; ties go to whoever was faster.{contest.state === 'live' && ' Updates every few seconds.'}</CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-0">
        {standings.isError && <div className="px-4"><ErrorState error={standings.error} onRetry={() => void standings.refetch()} /></div>}
        {!standings.data && !standings.isError && <LoadingRegion className="space-y-2 px-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></LoadingRegion>}
        {standings.data && standings.data.entries.length === 0 && <p className="px-4 text-sm text-muted-foreground">No entries yet.</p>}
        {standings.data && standings.data.entries.length > 0 && (
          <ol className="divide-y" aria-label="Contest standings">
            {standings.data.entries.map((e) => (
              <li key={e.user_id} className={cn('flex items-center gap-3 px-4 py-2.5', e.is_me && 'bg-primary-soft/60')} aria-current={e.is_me ? 'true' : undefined}>
                <span className="w-7 text-center font-bold tabular-nums text-muted-foreground">{e.rank}</span>
                <Avatar src={e.avatar_url} name={displayName(e)} className="size-8" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {e.handle ? <Link to={`/u/${e.handle}`} className="hover:underline">{displayName(e)}</Link> : displayName(e)}
                </span>
                <span className="text-right text-sm">
                  <span className="block font-semibold tabular-nums">{e.score} pts</span>
                  <span className="text-xs text-muted-foreground">{e.correct}/{contest.question_count} · {formatClock(e.time_ms)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
};

const Review = ({ questions }: { questions: ContestQuestion[] }) => (
  <Card>
    <CardHeader className="pb-2"><CardTitle>Answers and explanations</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {questions.map((q, i) => {
        const correctIndex = q.options.findIndex((o) => o.id === q.correct_option_id);
        return (
          <details key={q.id} className="group rounded-md border p-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
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
      <div className="space-y-2">
        <ContestStateBadge c={c} />
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{c.title}</h1>
        {c.description && <p className="text-muted-foreground">{c.description}</p>}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="size-4" aria-hidden /> {formatDateTime(c.starts_at)} – {formatDateTime(c.ends_at)}</span>
          <span>{plural(c.question_count, 'question')}</span>
          <span>{plural(c.participants, 'player')}</span>
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-4 sm:pt-5">
          {c.state === 'upcoming' && (
            c.joined
              ? <p>You're registered. The contest opens {formatRelative(c.starts_at)}.</p>
              : (
                <>
                  <p>Register now and we'll keep your spot. Questions open {formatRelative(c.starts_at)}.</p>
                  <Button onClick={() => void join(false)} loading={joining}>Register</Button>
                </>
              )
          )}
          {c.state === 'live' && !c.joined && (
            <>
              <p>Everyone answers the same {plural(c.question_count, 'question')}. Each answer is final, so take your time. No hints in contests.</p>
              <Button size="lg" onClick={() => void join(true)} loading={joining}><Play /> Enter and start</Button>
            </>
          )}
          {c.state === 'live' && c.joined && (
            remaining > 0 ? (
              <>
                <p>{answered > 0 ? `You've answered ${answered} of ${c.question_count}.` : 'Ready when you are.'} The contest closes {formatRelative(c.ends_at)}.</p>
                <Button size="lg" onClick={() => setPlaying(true)}><Play /> {answered > 0 ? 'Continue' : 'Start'}</Button>
              </>
            ) : (
              <p>You've answered every question. Final results and explanations appear {formatRelative(c.ends_at)}.</p>
            )
          )}
          {c.state === 'ended' && (
            c.my_entry
              ? <p>You finished <strong>#{c.my_entry.rank}</strong> with <strong>{c.my_entry.score} points</strong> ({c.my_entry.correct} of {c.question_count} right).</p>
              : <p>This contest has ended. You can still look at the questions and answers below.</p>
          )}
        </CardContent>
      </Card>

      {c.state !== 'upcoming' && <Standings contest={c} />}
      {c.state === 'ended' && c.questions && <Review questions={c.questions} />}
    </Page>
  );
};

export default ContestPage;
