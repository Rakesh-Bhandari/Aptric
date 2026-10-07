import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, CalendarClock, Check, Flag, KeyRound, ListChecks, Lock, Play, ShieldAlert, Timer, Trophy, Users, X } from 'lucide-react';
import { NotFound } from '@/components/layout/ErrorBoundary';
import { Markdown } from '@/components/markdown/Markdown';
import { SessionHeader } from '@/components/solve/SessionHeader';
import { SolveScreen } from '@/components/solve/SolveScreen';
import { ContestStateBadge } from '@/components/compete/ContestStateBadge';
import { FollowButton } from '@/components/community/FollowButton';
import { ScopeSwitch, type Scope } from '@/components/community/ScopeSwitch';
import { LiveIndicator, PlayerLink, StandingRow } from '@/components/compete/standings';
import { clearPendingViolation, pendingViolation, setPendingViolation, VIOLATION_TEXT } from '@/components/compete/attempt';
import { countdownParts, formatSpan, useNow } from '@/components/compete/time';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldHint, Input, Label, Select } from '@/components/ui/input';
import { CopyLinkButton, HostPanel, ReportContestDialog } from '@/components/community/ContestHostCards';
import { Page } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/context/ToastContext';
import { useContestGuard } from '@/hooks/useExamGuard';
import * as api from '@/lib/api';
import { entryRelationship } from '@/lib/community';
import { errorCode, friendlyError } from '@/lib/errors';
import { displayName, formatClock, formatDateTime, formatRelative, plural } from '@/lib/format';
import { contestPoints, DIFFICULTY_LABEL, OPTION_LETTERS } from '@/lib/game';
import { keys, queryClient, useCommunityEnabled, useContest, useContestStandings, useGroupsEnabled, useMyGroups } from '@/lib/queries';
import { noXpReason, VISIBILITY_SHORT } from '@/lib/hosting';
import type { ContestDetail, ContestQuestion, ContestViolation } from '@/lib/types';
import { cn } from '@/lib/utils';
import { fromCard } from './solve/news';

const refresh = (id: string) => Promise.all([
  queryClient.invalidateQueries({ queryKey: keys.contest(id) }),
  queryClient.invalidateQueries({ queryKey: ['contest-standings', id] }),
  queryClient.invalidateQueries({ queryKey: keys.contests }),
]);

const Standings = ({ contest }: { contest: ContestDetail }) => {
  const community = useCommunityEnabled();
  const groupsOn = useGroupsEnabled();
  const myGroups = useMyGroups(groupsOn);
  const [scope, setScope] = useState<Scope>('all');
  const [groupId, setGroupId] = useState('');
  const friends = community && scope === 'friends';
  const standings = useContestStandings(contest.id, contest.state === 'live', friends, groupsOn && groupId ? groupId : null);
  const leagues = (myGroups.data?.items ?? []).filter((g) => g.my_status === 'active');
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><Users className="size-5 text-muted-foreground" aria-hidden /> {contest.state === 'ended' ? 'Results' : 'Standings'}</CardTitle>
          {contest.state === 'live' && <LiveIndicator every="few seconds" />}
        </div>
        <CardDescription>
          Most points wins; ties go to whoever was faster.{standings.data?.final ? ' These results are final.' : ''}
        </CardDescription>
        {(community || leagues.length > 0) && (
          <div className="flex flex-wrap items-center gap-3">
            {community && <ScopeSwitch label="Who to show" value={scope} onChange={setScope} />}
            {groupsOn && leagues.length > 0 && (
              <div className="flex items-center gap-2">
                <Label htmlFor="standings-league" className="text-xs text-muted-foreground">League</Label>
                <Select id="standings-league" value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-9 w-auto min-w-36 py-0 text-sm">
                  <option value="">Everyone</option>
                  {leagues.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
              </div>
            )}
          </div>
        )}
      </CardHeader>
      {standings.isError && <div className="px-4 pb-4"><ErrorState error={standings.error} onRetry={() => void standings.refetch()} /></div>}
      {!standings.data && !standings.isError && <LoadingRegion className="space-y-2 px-4 pb-4"><Skeleton className="h-14" /><Skeleton className="h-14" /></LoadingRegion>}
      {standings.data && standings.data.entries.length === 0 && (
        <div className="px-4 pb-5 sm:px-5">
          {groupId && groupsOn
            ? <EmptyState icon={<Users />} title="No one from that league entered">Members of the league show up here once they answer.</EmptyState>
            : friends
            ? <EmptyState icon={<Users />} title="None of your friends entered">Follow people from the Friends page to compare with them here.</EmptyState>
            : <EmptyState icon={<Users />} title="No entries yet">Standings appear once players start answering.</EmptyState>}
        </div>
      )}
      {standings.data && standings.data.entries.length > 0 && (
        <ol className="divide-y border-t" aria-label="Contest standings">
          {standings.data.entries.map((e) => (
            <StandingRow key={e.user_id} rank={e.rank} me={e.is_me} player={<PlayerLink handle={e.handle} name={displayName(e)} avatar={e.avatar_url} />}>
              <span className="block font-bold tabular-nums text-heading">{e.score} pts{e.is_host && <Badge variant="muted" className="ml-2 align-middle">Host</Badge>}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{e.correct}/{contest.question_count} · {formatClock(e.time_ms)}</span>
              {community && !e.is_me && e.handle && <span className="mt-1 block"><FollowButton handle={e.handle} relationship={entryRelationship(e)} /></span>}
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
          <details key={q.id} className="group rounded-md border bg-card open:shadow-sm">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-md px-3 font-semibold text-heading transition-colors duration-150 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
              {q.answer ? (
                q.answer.is_correct ? <Check className="size-4 text-success" aria-label="Correct" /> : <X className="size-4 text-danger" aria-label="Wrong" />
              ) : <span className="size-4 rounded-full border" aria-label="Not answered" />}
              Question {i + 1}
              <Badge variant="muted" className="ml-auto">{DIFFICULTY_LABEL[q.difficulty]}</Badge>
            </summary>
            <div className="space-y-3 px-3 pb-3 pt-1">
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

/**
 * Leaving the tab or window ends the attempt: the answers so far stay, the server closes the
 * attempt (and refuses further answers), and the contest page shows it as auto-submitted.
 */
const ContestRunner = ({ contest, onDone }: { contest: ContestDetail; onDone: () => void }) => {
  const [queue] = useState(() => (contest.questions ?? []).filter((q) => !q.answer));
  const [index, setIndex] = useState(0);
  const [ended, setEnded] = useState<{ reason: ContestViolation; failed: boolean } | null>(null);

  const end = useCallback(async (reason: ContestViolation) => {
    // Written down first, so a page that goes away mid-request still gets it to the server later.
    setPendingViolation(contest.id, reason);
    setEnded({ reason, failed: false });
    try {
      await api.finishContest(contest.id, reason);
      clearPendingViolation(contest.id);
      await refresh(contest.id);
      onDone();
    } catch {
      setEnded({ reason, failed: true });
    }
  }, [contest.id, onDone]);
  useContestGuard(!ended, (reason) => void end(reason));

  const question = queue[index];
  if (ended) {
    return (
      <div role="alert" className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <ShieldAlert className="mx-auto size-10 text-danger" aria-hidden />
          <h1 className="font-display text-xl font-extrabold text-heading">Your attempt has ended</h1>
          <p className="text-sm text-muted-foreground">
            Because {VIOLATION_TEXT[ended.reason]}, your answers so far are being submitted automatically.
          </p>
          {ended.failed
            ? <><p className="text-sm text-danger-soft-foreground">We couldn't reach the server. Your attempt will still be closed.</p><Button onClick={() => void end(ended.reason)}>Try again</Button></>
            : <p className="text-sm font-semibold text-heading">Submitting…</p>}
        </div>
      </div>
    );
  }
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
  const [code, setCode] = useState('');
  const [reporting, setReporting] = useState(false);
  const now = useNow(15_000);

  // A violation the server never heard about (the page went away first) is sent now, so a
  // reload or a reopened tab cannot resume the attempt.
  const data = contest.data;
  useEffect(() => {
    if (!data) return;
    if (data.finished_at || data.state !== 'live') return clearPendingViolation(data.id);
    const reason = data.joined ? pendingViolation(data.id) : null;
    if (!reason) return;
    api.finishContest(data.id, reason)
      .then(() => { clearPendingViolation(data.id); return refresh(data.id); })
      .catch(() => { /* still stored: tried again on the next visit */ });
  }, [data]);

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

  const confirmRules = () => toast.confirm({
    title: 'Switching tabs ends your attempt',
    message: "Once you start, leaving this tab or window, switching apps, or exiting fullscreen immediately submits the answers you've given so far, and you can't continue. Close other windows and turn off notifications first.",
    confirmText: 'I understand, start',
    cancelText: 'Not yet',
  });
  const start = async () => {
    if (await confirmRules()) setPlaying(true);
  };

  const join = async (thenPlay: boolean) => {
    if (thenPlay && !(await confirmRules())) return;
    setJoining(true);
    try {
      const r = await api.joinContest(c.id, code);
      if (!r.entered) {
        toast.error(r.code === 'wrong' ? "That access code isn't right." : 'This contest needs an access code.');
        return;
      }
      await refresh(c.id);
      toast.success(c.state === 'upcoming' ? "You're registered. We'll see you at the start!" : "You're in. Good luck!");
      if (thenPlay) setPlaying(true);
    } catch (err) {
      toast.error(['55000', '42501'].includes(errorCode(err) ?? '') ? (err as Error).message : friendlyError(err));
    } finally {
      setJoining(false);
    }
  };

  const answered = c.questions?.filter((q) => q.answer).length ?? c.my_entry?.answered ?? 0;
  const remaining = c.question_count - answered;
  const cancelled = c.state === 'cancelled';
  // Entry for a hosted contest can close some minutes after the start.
  const entryClosed = c.state === 'live' && !c.joined && c.late_join_until !== null && now > Date.parse(c.late_join_until);
  // The host enters only if they play for fun.
  const canEnter = !cancelled && !entryClosed && (!c.is_host || c.host_plays);
  const codeNeeded = c.needs_code && !c.joined && !c.is_host;
  const xpNote = noXpReason(c);

  return (
    <Page className="max-w-3xl space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2"><Link to="/compete?tab=contests"><ArrowLeft /> All contests</Link></Button>

      {cancelled && (
        <Card role="status" className="border-danger/40 bg-danger-soft text-danger-soft-foreground">
          <CardContent className="flex items-start gap-3 p-4 sm:p-5">
            <Ban className="mt-0.5 size-6 shrink-0" aria-hidden />
            <div className="space-y-1">
              <h2 className="text-lg font-extrabold">This contest was cancelled</h2>
              <p className="text-sm">{c.status_note ?? 'The host or a moderator cancelled it. Nothing you did counts.'}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {c.is_host && c.status_note && !cancelled && (
        <Card role="status" className="border-warning/40 bg-warning-soft text-warning-soft-foreground">
          <CardContent className="p-4 text-sm sm:p-5"><strong>Note from the moderators:</strong> {c.status_note}</CardContent>
        </Card>
      )}

      {c.joined && c.finished_at && c.violation && (
        <Card role="alert" className="border-danger/40 bg-danger-soft text-danger-soft-foreground">
          <CardContent className="flex items-start gap-3 p-4 sm:p-5">
            <ShieldAlert className="mt-0.5 size-6 shrink-0" aria-hidden />
            <div className="space-y-1">
              <h2 className="text-lg font-extrabold">Auto-submitted because of a tab switch</h2>
              <p className="text-sm">
                Your attempt ended because {VIOLATION_TEXT[c.violation]}. {answered > 0
                  ? <>Your {plural(answered, 'answer')} so far {answered === 1 ? 'was' : 'were'} submitted and scored; the rest stay unanswered.</>
                  : 'You had not answered any question yet.'} The attempt can't be resumed.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card variant="navy" className="relative overflow-hidden shadow-md">
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-dots" />
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-violet/35 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 size-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative space-y-5 p-5 sm:p-7">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ContestStateBadge c={c} onDark />
              {c.hosted && <Badge variant="muted" className="bg-white/12 text-navy-muted-foreground">{VISIBILITY_SHORT[c.visibility]}</Badge>}
              {c.needs_code && <Badge variant="muted" className="bg-white/12 text-navy-muted-foreground"><Lock /> Access code</Badge>}
            </div>
            <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{c.title}</h1>
            {c.hosted && c.host?.handle && (
              <p className="text-sm text-navy-muted-foreground">
                Hosted by <Link to={`/u/${c.host.handle}`} className="font-semibold text-navy-foreground underline-offset-2 hover:underline">@{c.host.handle}</Link>
                {c.group ? <> for {c.group.name}</> : null}
                {c.host_plays ? ' · the host plays for fun (unrated, no XP)' : ''}
              </p>
            )}
            {c.description && <p className="whitespace-pre-line text-navy-muted-foreground [overflow-wrap:anywhere]">{c.description}</p>}
          </div>

          {c.state !== 'ended' && !cancelled && <Countdown label={c.state === 'live' ? 'Ends in' : 'Starts in'} at={c.state === 'live' ? c.ends_at : c.starts_at} />}

          <ul className="flex flex-wrap gap-2 text-xs font-semibold" aria-label="Contest details">
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><CalendarClock className="size-3.5" aria-hidden /> {formatDateTime(c.starts_at)} – {formatDateTime(c.ends_at)}</li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><ListChecks className="size-3.5" aria-hidden /> {plural(c.question_count, 'question')}</li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Timer className="size-3.5" aria-hidden /> {formatSpan(c.starts_at, c.ends_at)}</li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><Users className="size-3.5" aria-hidden /> {plural(c.participants, 'player')}</li>
          </ul>

          {c.state !== 'ended' && !cancelled && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-chrome-accent">Rules</h2>
              <ul className="grid gap-1.5 text-sm text-navy-muted-foreground sm:grid-cols-2">
                {[
                  `Everyone answers the same ${plural(c.question_count, 'question')}.`,
                  'Each answer is final, and there are no hints.',
                  `Points by difficulty: easy ${contestPoints('easy')}, medium ${contestPoints('medium')}, hard ${contestPoints('hard')}.`,
                  'Most points wins; ties go to whoever was faster.',
                  'Leaving this tab or window ends your attempt and submits your answers so far.',
                  ...(c.max_participants ? [`At most ${plural(c.max_participants, 'player')} can enter.`] : []),
                  ...(c.late_join_until ? [`Entry closes ${formatDateTime(c.late_join_until)}.`] : []),
                  ...(c.hosted ? [xpNote ?? 'XP goes to players who finish, when 5 or more do.'] : []),
                ].map((rule) => (
                  <li key={rule} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-chrome-accent" aria-hidden /> {rule}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-navy-muted-foreground [&_strong]:text-navy-foreground">
              {c.state === 'upcoming' && !c.is_host && (c.joined
                ? <p>You're registered. The contest opens {formatRelative(c.starts_at)}.</p>
                : <p>Register now and we'll keep your spot. Questions open {formatRelative(c.starts_at)}.</p>)}
              {cancelled && <p>Nothing to do here: the contest was cancelled.</p>}
              {c.is_host && !c.host_plays && c.state !== 'ended' && !cancelled && <p>You host this contest, so you watch rather than play. The questions stay hidden from you until it ends.</p>}
              {entryClosed && <p>Entry closed {formatRelative(c.late_join_until as string)}. You can follow the standings.</p>}
              {c.state === 'live' && !c.joined && canEnter && <p>Ready? Take your time: each answer is final.{c.late_join_until ? ` Entry closes ${formatRelative(c.late_join_until)}.` : ''}</p>}
              {c.state === 'live' && c.joined && c.finished_at && <p>Your attempt is closed. Final results and explanations appear {formatRelative(c.ends_at)}.</p>}
              {c.state === 'live' && c.joined && !c.finished_at && (remaining > 0
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
            {codeNeeded && canEnter && (c.state === 'upcoming' || c.state === 'live') && (
              <div className="w-full space-y-1.5 sm:w-56">
                <Label htmlFor="contest-code" className="text-navy-foreground">Access code</Label>
                <Input id="contest-code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
              </div>
            )}
            {c.state === 'upcoming' && !c.joined && canEnter && <Button size="lg" className="shrink-0" onClick={() => void join(false)} loading={joining} disabled={codeNeeded && code.trim().length < 4}>Register</Button>}
            {c.state === 'live' && !c.joined && canEnter && <Button size="lg" className="shrink-0" onClick={() => void join(true)} loading={joining} disabled={codeNeeded && code.trim().length < 4}><Play /> Enter and start</Button>}
            {c.state === 'live' && c.joined && !c.finished_at && remaining > 0 && <Button size="lg" className="shrink-0" onClick={() => void start()}><Play /> {answered > 0 ? 'Continue' : 'Start'}</Button>}
          </div>
        </div>
      </Card>

      <HostPanel c={c} />

      <div className="flex flex-wrap items-center gap-2">
        {c.hosted && (c.is_host || c.visibility === 'unlisted') && !cancelled && <CopyLinkButton id={c.id} variant="ghost" />}
        {c.hosted && !c.is_host && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setReporting(true)}><Flag /> Report this contest</Button>
        )}
        {c.needs_code && c.is_host && <FieldHint className="flex items-center gap-1"><KeyRound className="size-3.5" aria-hidden /> Players need the access code you set.</FieldHint>}
      </div>
      {reporting && <ReportContestDialog id={c.id} open onOpenChange={(o) => { if (!o) setReporting(false); }} />}

      {c.state !== 'upcoming' && !cancelled && <Standings contest={c} />}
      {c.state === 'ended' && !cancelled && c.questions && <Review questions={c.questions} />}
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
