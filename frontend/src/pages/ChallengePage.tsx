import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Clock, Copy, Play, Share2, Swords, Trophy } from 'lucide-react';
import { Markdown } from '@/components/markdown/Markdown';
import { ChallengeRunner } from '@/components/community/ChallengeRunner';
import { VIOLATION_TEXT } from '@/components/compete/attempt';
import { useNow } from '@/components/compete/time';
import { NotFound } from '@/components/layout/ErrorBoundary';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Page } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { challengeLink, DECIDER_TEXT, decidedBy, formatTarget, OUTCOME_TITLE, outcomeFor, shareMessage, timeToAct } from '@/lib/challenges';
import { errorCode, friendlyError } from '@/lib/errors';
import { displayName, formatClock, formatRelative, plural } from '@/lib/format';
import { OPTION_LETTERS } from '@/lib/game';
import { clockSkew, formatTimeLeft } from '@/lib/posts';
import { invalidateChallenges, useChallenge } from '@/lib/queries';
import { CHALLENGES_PATH, challengeHref } from '@/lib/routes';
import type { Challenge, ChallengeDetail, ChallengeRun, ChallengeSide, ContestViolation } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChallengesGate } from './Challenges';

const RULES = [
  'You both answer the same questions, in the same order.',
  'Each answer is final. There is no tutor, and the clock is the server\'s.',
  'More correct answers wins; ties go to the faster time, then fewer hints.',
  'Leaving this tab or window ends your attempt and submits your answers so far.',
];

const PlayerBadge = ({ c, side }: { c: Challenge; side: 'challenger' | 'opponent' }) => {
  const u = side === 'challenger' ? c.challenger : c.opponent;
  const you = c.role === side;
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <Avatar src={u?.avatar_url} name={u ? displayName(u) : '?'} className="size-14" />
      <p className="max-w-full truncate text-sm font-semibold text-heading">{you ? 'You' : u ? displayName(u) : 'Waiting…'}</p>
      {u && !you && <p className="max-w-full truncate text-xs text-muted-foreground">@{u.handle}</p>}
    </div>
  );
};

const Score = ({ side, total, winner }: { side: ChallengeSide; total: number; winner: boolean }) => (
  <div className={cn('rounded-lg border p-3 text-center', winner && 'border-success bg-success-soft text-success-soft-foreground')}>
    <p className="font-display text-3xl font-extrabold tabular-nums">{side.score}<span className="text-base font-semibold opacity-70">/{total}</span></p>
    <p className="text-xs tabular-nums opacity-80">{formatClock(side.time_ms)}{side.hints > 0 ? ` · ${plural(side.hints, 'hint')}` : ''}</p>
  </div>
);

/** The head-to-head: scores, who won and why, XP note, rematch, and the review. */
const ResultCard = ({ c, review }: { c: ChallengeDetail; review: ChallengeDetail['review'] }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const result = c.result;
  if (!result) return null;
  const outcome = outcomeFor(c);
  const draw = result.winner === 'draw';

  const rematch = async () => {
    setBusy(true);
    try {
      const next = await api.requestRematch(c.id);
      await invalidateChallenges();
      navigate(challengeHref(next.id));
    } catch (err) {
      toast.error(['54000', 'P0002'].includes(errorCode(err) ?? '') ? (err as Error).message : friendlyError(err, "We couldn't set up a rematch."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card variant="navy" className="relative overflow-hidden">
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-dots" />
        <div className="relative space-y-4 p-5 text-center sm:p-7">
          {outcome && (
            <h1 className="flex items-center justify-center gap-2 font-display text-3xl font-extrabold tracking-tight">
              {outcome === 'won' && <Trophy className="size-7 text-medal-gold" aria-hidden />} {OUTCOME_TITLE[outcome]}
            </h1>
          )}
          <p className="text-sm text-navy-muted-foreground">{DECIDER_TEXT[decidedBy(result.challenger, result.opponent)]}</p>
        </div>
      </Card>
      <Card>
        <CardContent className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 p-4 sm:p-5">
          <div className="space-y-2">
            <PlayerBadge c={c} side="challenger" />
            <Score side={result.challenger} total={c.question_count} winner={result.winner === 'challenger'} />
          </div>
          <Swords className="mt-6 size-5 text-muted-foreground" aria-hidden />
          <div className="space-y-2">
            <PlayerBadge c={c} side="opponent" />
            <Score side={result.opponent} total={c.question_count} winner={result.winner === 'opponent'} />
          </div>
        </CardContent>
      </Card>
      {!draw && outcome === 'won' && <p className="text-center text-sm text-muted-foreground">Taking part earns 5 XP and a win 10 more, for up to 5 challenges a day.</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => void rematch()} loading={busy}><Swords /> Rematch</Button>
        <Button variant="outline" asChild><Link to={CHALLENGES_PATH}>All challenges</Link></Button>
      </div>
      {review && (
        <Card>
          <CardContent className="space-y-3 p-4 sm:p-5">
            <h2 className="font-bold text-heading">Questions and answers</h2>
            {review.map((r, i) => {
              const correct = r.question.options.findIndex((o) => o.id === r.correct_option_id);
              const ok = r.mine?.is_correct;
              return (
                <details key={r.question.id} className="rounded-md border bg-card open:shadow-sm">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-md px-3 font-semibold text-heading [&::-webkit-details-marker]:hidden">
                    <span className={cn('grid size-5 place-items-center rounded-full text-xs', ok ? 'bg-success text-status-foreground' : 'bg-danger text-status-foreground')} aria-label={ok ? 'Right' : r.mine ? 'Wrong' : 'Not answered'}>{ok ? '✓' : '✗'}</span>
                    Question {i + 1}
                  </summary>
                  <div className="space-y-2 border-t p-3 text-sm">
                    <Markdown text={r.question.stem} />
                    {correct >= 0 && <p>Answer: <strong>{OPTION_LETTERS[correct]}</strong></p>}
                    {r.explanation && <div className="rounded-md bg-muted p-3"><Markdown text={r.explanation} /></div>}
                  </div>
                </details>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const ShareBox = ({ c }: { c: Challenge }) => {
  const toast = useToast();
  if (!c.share_token) return null;
  const link = challengeLink(c.share_token);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ text: shareMessage(c), url: link });
      else {
        await navigator.clipboard.writeText(`${shareMessage(c)} ${link}`);
        toast.success('Link copied. Paste it anywhere.');
      }
    } catch { /* share sheet dismissed */ }
  };
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <p className="text-sm font-semibold text-heading">{c.opponent ? 'Share the link too' : 'Send this link to a friend'}</p>
        <div className="flex gap-2">
          <input readOnly aria-label="Challenge link" value={link} onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-md border bg-muted/40 px-3 text-sm" />
          <Button variant="outline" size="icon" aria-label="Copy link" onClick={() => { void navigator.clipboard?.writeText(link).then(() => toast.success('Link copied.')); }}><Copy /></Button>
          <Button size="icon" aria-label="Share" onClick={() => void share()}><Share2 /></Button>
        </div>
        {!c.opponent && <p className="text-xs text-muted-foreground">The first person to accept becomes your opponent. They see only your score, never the questions.</p>}
      </CardContent>
    </Card>
  );
};

/** A challenge by id (/challenges/:id) or share link (/c/:token). */
const ChallengeInner = ({ token = false }: { token?: boolean }) => {
  const { id = '', token: linkToken = '' } = useParams();
  const key = token ? linkToken : id;
  const query = useChallenge(key, token);
  const toast = useToast();
  const navigate = useNavigate();
  const now = useNow(1000);
  const [run, setRun] = useState<ChallengeRun | null>(null);
  const [busy, setBusy] = useState<'accept' | 'decline' | 'cancel' | 'start' | null>(null);

  const done = useCallback(() => { setRun(null); void invalidateChallenges(); }, []);

  // An attempt interrupted by a reload: reopen it (the server clock kept running).
  const c = query.data;
  useEffect(() => {
    if (!c || run || c.role === 'viewer' || !c.my_run || c.my_run.finished_at) return;
    if (c.status === 'accepted' || (c.status === 'pending' && c.draft)) {
      void api.getChallengeRun(c.id).then((r) => { if (!r.run.finished_at) setRun(r); }).catch(() => {});
    }
  }, [c, run]);

  if (query.isError) {
    if (['P0002', '22P02', '22023'].includes(errorCode(query.error) ?? '')) return <NotFound title="Challenge not found" message="It may have been taken by someone else, or the link is wrong." />;
    return <Page><ErrorState error={query.error} onRetry={() => void query.refetch()} /></Page>;
  }
  if (!c) return <Page className="max-w-xl"><LoadingRegion className="space-y-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-56" /></LoadingRegion></Page>;

  const confirmRules = () => toast.confirm({
    title: 'Switching tabs ends your attempt',
    message: "Once you start, leaving this tab or window, switching apps, or exiting fullscreen immediately submits the answers you've given so far, and you can't continue. The clock is running on our server.",
    confirmText: 'I understand, start', cancelText: 'Not yet',
  });
  const fail = (err: unknown) => toast.error(['55000', 'P0002', '54000', '42501'].includes(errorCode(err) ?? '') ? (err as Error).message : friendlyError(err));

  const accept = async () => {
    if (!(await confirmRules())) return;
    setBusy('accept');
    try {
      const r = await api.acceptChallenge(token ? { token: linkToken } : { id: c.id });
      await invalidateChallenges();
      if (token) navigate(challengeHref(r.challenge.id), { replace: true });
      setRun(r);
    } catch (err) { fail(err); } finally { setBusy(null); }
  };
  const start = async () => {
    if (!(await confirmRules())) return;
    setBusy('start');
    try { setRun(await api.startChallengeRun(c.id)); } catch (err) { fail(err); } finally { setBusy(null); }
  };
  const decline = async () => {
    setBusy('decline');
    try { await api.declineChallenge(c.id); await invalidateChallenges(); toast.info('Declined.'); } catch (err) { fail(err); } finally { setBusy(null); }
  };
  const cancel = async () => {
    setBusy('cancel');
    try { await api.cancelChallenge(c.id); await invalidateChallenges(); toast.info('Challenge cancelled.'); } catch (err) { fail(err); } finally { setBusy(null); }
  };

  if (run) {
    const them = run.challenge.role === 'challenger' ? run.challenge.opponent : run.challenge.challenger;
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
        <ChallengeRunner run={run} label={them ? `Challenge · @${them.handle}` : 'Challenge'} onDone={done} />
      </div>
    );
  }

  const skew = clockSkew(c.server_now, query.dataUpdatedAt);
  const left = timeToAct(c, now, skew);
  const them = c.role === 'challenger' ? c.opponent : c.challenger;
  const violation = c.my_run?.violation && c.my_run.violation in VIOLATION_TEXT ? c.my_run.violation as ContestViolation : null;

  return (
    <Page className="max-w-xl space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2"><Link to={CHALLENGES_PATH}><ArrowLeft /> Challenges</Link></Button>

      {c.status === 'completed' && <ResultCard c={c} review={c.review} />}

      {violation && c.status === 'completed' && (
        <p role="status" className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          Your attempt ended because {VIOLATION_TEXT[violation]}. The answers you had given were scored.
        </p>
      )}

      {c.status !== 'completed' && (
        <Card variant="navy" className="relative overflow-hidden shadow-md">
          <span aria-hidden className="pointer-events-none absolute inset-0 bg-dots" />
          <div className="relative space-y-4 p-5 sm:p-7">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-navy-foreground">
              <PlayerBadge c={c} side="challenger" />
              <Swords className="size-6 text-chrome-accent" aria-hidden />
              <PlayerBadge c={c} side="opponent" />
            </div>
            {c.target && (
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-chrome-accent">{c.role === 'challenger' ? 'Your score to beat' : 'Beat this'}</p>
                <p className="font-display text-4xl font-extrabold tabular-nums">{formatTarget(c.target.score, c.target.total, c.target.time_ms)}</p>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2 text-xs font-semibold">
              <Badge variant="muted" className="bg-white/15 text-navy-foreground">{plural(c.question_count, 'question')}</Badge>
              {left !== null && <Badge variant={left < 6 * 3_600_000 ? 'warning' : 'muted'} className={left < 6 * 3_600_000 ? undefined : 'bg-white/15 text-navy-foreground'}><Clock aria-hidden /> {left > 0 ? `${formatTimeLeft(left)} left` : 'time is up'}</Badge>}
              {c.status === 'pending' && c.accept_by && <Badge variant="muted" className="bg-white/15 text-navy-foreground">Expires {formatRelative(c.accept_by)}</Badge>}
            </div>
          </div>
        </Card>
      )}

      {c.status === 'pending' && c.draft && c.role === 'challenger' && (
        <Card><CardContent className="space-y-3 p-4 sm:p-5">
          <h2 className="font-bold text-heading">Play your set first</h2>
          <p className="text-sm text-muted-foreground">Your score and time are locked in when you finish, and then {them ? `@${them.handle} gets` : 'your link works as'} the challenge. Nobody sees the questions before accepting.</p>
          <ul className="space-y-1 text-sm text-muted-foreground">{RULES.map((r) => <li key={r} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />{r}</li>)}</ul>
          <Button size="lg" onClick={() => void start()} loading={busy === 'start'}><Play /> {c.my_run ? 'Continue' : 'Start'}</Button>
          <Button variant="ghost" size="sm" onClick={() => void cancel()} loading={busy === 'cancel'}>Cancel</Button>
        </CardContent></Card>
      )}

      {c.status === 'pending' && !c.draft && c.role === 'challenger' && (
        <>
          <Card><CardContent className="space-y-2 p-4 sm:p-5">
            <h2 className="font-bold text-heading">{them ? `Waiting for @${them.handle}` : 'Waiting for someone to accept'}</h2>
            <p className="text-sm text-muted-foreground">They have two days to accept, then a day to finish. You'll get a notification with the result.</p>
            <Button variant="outline" size="sm" onClick={() => void cancel()} loading={busy === 'cancel'}>Cancel challenge</Button>
          </CardContent></Card>
          <ShareBox c={c} />
        </>
      )}

      {c.status === 'pending' && c.can_accept && (
        <Card><CardContent className="space-y-3 p-4 sm:p-5">
          <h2 className="font-bold text-heading">@{c.challenger.handle} challenged you</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">{RULES.map((r) => <li key={r} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />{r}</li>)}</ul>
          <p className="text-sm text-muted-foreground">You'll see the questions when you accept, and your clock starts then.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => void accept()} loading={busy === 'accept'}><Play /> Accept and start</Button>
            {c.opponent && <Button size="lg" variant="outline" onClick={() => void decline()} loading={busy === 'decline'}>Decline</Button>}
          </div>
        </CardContent></Card>
      )}

      {c.status === 'accepted' && c.role === 'challenger' && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground sm:p-5">{them ? `@${them.handle} is playing now.` : 'Your opponent is playing now.'} The result appears here when they finish.</CardContent></Card>
      )}
      {c.status === 'accepted' && c.role === 'opponent' && (
        <Card><CardContent className="space-y-3 p-4 sm:p-5">
          <p className="text-sm text-muted-foreground">{c.my_run?.finished_at ? 'Your attempt is closed.' : "You're in the middle of this one."}</p>
          {!c.my_run?.finished_at && <Button size="lg" onClick={() => { void api.getChallengeRun(c.id).then(setRun).catch(fail); }}><Play /> Continue</Button>}
        </CardContent></Card>
      )}

      {['declined', 'expired', 'cancelled'].includes(c.status) && (
        <Card><CardContent className="space-y-3 p-4 text-sm text-muted-foreground sm:p-5">
          <p>{c.status === 'declined' ? 'This challenge was declined.' : c.status === 'expired' ? 'This challenge expired before it was played.' : 'This challenge was cancelled.'}</p>
          <Button variant="outline" asChild><Link to={CHALLENGES_PATH}>Back to challenges</Link></Button>
        </CardContent></Card>
      )}
    </Page>
  );
};

/** /challenges/:id */
const ChallengePage = () => <ChallengesGate><ChallengeInner /></ChallengesGate>;

/** /c/:token (the share link) */
export const ChallengeLinkPage = () => <ChallengesGate><ChallengeInner token /></ChallengesGate>;

export default ChallengePage;
