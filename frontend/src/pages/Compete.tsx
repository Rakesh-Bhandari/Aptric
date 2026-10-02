import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, ChevronRight, Crown, ListChecks, Medal, Swords, Timer, Trophy, Users } from 'lucide-react';
import { ContestStateBadge } from '@/components/compete/ContestStateBadge';
import { LiveIndicator, PlayerLink, StandingRow, ZoneDivider } from '@/components/compete/standings';
import { TierEmblem } from '@/components/compete/TierEmblem';
import { formatCountdown, formatSpan, useNow } from '@/components/compete/time';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { displayName, formatDateTime, formatRelative, plural } from '@/lib/format';
import { leagueZone } from '@/lib/game';
import { useContests, useLeaderboard, useMyLeague } from '@/lib/queries';
import type { Board, ContestSummary, LeaderboardEntry, MyLeague } from '@/lib/types';
import { cn } from '@/lib/utils';

// Kept here too so existing imports from '@/pages/Compete' keep working.
export { ContestStateBadge };

const ListSkeleton = ({ rows = 8 }: { rows?: number }) => (
  <LoadingRegion label="Loading standings" className="space-y-2">
    {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-14" />)}
  </LoadingRegion>
);

// League -------------------------------------------------------------------

/** Ticks on its own so the standings don't re-render every second. */
const ResetCountdown = ({ at }: { at: string }) => {
  const now = useNow(1000);
  return <time dateTime={at} className="tabular-nums">{formatCountdown(at, now)}</time>;
};

const LeagueBanner = ({ l }: { l: MyLeague }) => {
  const me = l.members.find((m) => m.is_me);
  const zone = me ? leagueZone(l, me.rank) : null;
  const cutoff = l.promote_zone > 0 ? l.members.find((m) => m.rank === l.promote_zone) : undefined;
  const toPromote = me && cutoff && zone === 'safe' ? Math.max(1, cutoff.xp - me.xp + 1) : null;
  return (
    <Card variant="navy" className="relative overflow-hidden shadow-md">
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-dots" />
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-primary/25 blur-3xl" />
      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <TierEmblem slug={l.tier.slug} tier={l.tier.tier} className="h-16 sm:h-20" />
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-chrome-accent">Weekly league</p>
            <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{l.tier.name} League</h2>
            <p className="text-sm text-navy-muted-foreground">
              {zone === 'promote' && <span className="font-semibold text-on-navy-success">You're in the promotion zone. Keep it up!</span>}
              {zone === 'demote' && <span className="font-semibold text-on-navy-danger">You're in the demotion zone. Earn XP to climb out.</span>}
              {zone === 'safe' && (toPromote ? <>{toPromote.toLocaleString()} XP to reach the promotion zone.</> : <>You're safe for now.</>)}
              {!zone && <>Earn XP to join this week's league.</>}
            </p>
          </div>
        </div>
        <dl className="grid shrink-0 grid-cols-2 overflow-hidden rounded-xl bg-white/8 ring-1 ring-white/10 sm:w-80">
          <div className="p-3 sm:p-4">
            <dt className="text-xs font-medium text-navy-muted-foreground">Resets in</dt>
            <dd className="mt-0.5 whitespace-nowrap text-lg font-extrabold tracking-tight sm:text-xl"><ResetCountdown at={l.week_ends_at} /></dd>
          </div>
          <div className="border-l border-white/10 p-3 sm:p-4">
            <dt className="text-xs font-medium text-navy-muted-foreground">Your rank</dt>
            <dd className="mt-0.5 text-lg font-extrabold tabular-nums tracking-tight sm:text-xl">
              {me ? <>#{me.rank}<span className="text-sm font-semibold text-navy-muted-foreground"> / {l.members.length}</span></> : '–'}
            </dd>
          </div>
        </dl>
      </div>
      {(l.last_result || l.promote_zone > 0 || l.demote_zone > 0) && (
        <div className="relative space-y-1 border-t border-white/10 px-5 py-3 text-sm text-navy-muted-foreground sm:px-6">
          {(l.promote_zone > 0 || l.demote_zone > 0) && (
            <p>
              Weekly XP decides your place. {l.promote_zone > 0 && `Top ${l.promote_zone} move up`}{l.promote_zone > 0 && l.demote_zone > 0 && ', '}
              {l.demote_zone > 0 && `bottom ${l.demote_zone} move down`} when the week ends.
            </p>
          )}
          {l.last_result && (
            <p>
              Last week you finished <strong className="text-navy-foreground">#{l.last_result.final_rank}</strong> and{' '}
              {l.last_result.outcome === 'promoted' ? 'moved up a league 🎉' : l.last_result.outcome === 'demoted' ? 'moved down a league' : 'kept your place'}.
            </p>
          )}
        </div>
      )}
    </Card>
  );
};

const LeagueTab = () => {
  // Live standings: poll while the tab is open.
  const league = useMyLeague({ live: true });

  if (league.isError) return <ErrorState error={league.error} onRetry={() => void league.refetch()} />;
  if (!league.data) return <div className="space-y-4"><Skeleton className="h-40 rounded-lg" /><ListSkeleton /></div>;
  const l = league.data;
  const n = l.members.length;

  return (
    <div className="space-y-4">
      <LeagueBanner l={l} />

      {!l.league_id ? (
        <EmptyState icon={<Users />} title="You're not in a league yet" action={<Button asChild><Link to="/">Play today's challenge</Link></Button>}>
          Earn any XP this week and you'll join a {l.tier.name} league with up to 30 players.
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-3">
            <CardTitle>Standings</CardTitle>
            <LiveIndicator every="20s" />
          </CardHeader>
          <ol aria-label={`${l.tier.name} league standings`} className="divide-y border-t">
            {l.members.map((m) => {
              const zone = leagueZone(l, m.rank);
              return (
                <ZoneRows key={m.user_id} l={l} rank={m.rank} n={n}>
                  <StandingRow
                    rank={m.rank} me={m.is_me} zone={zone}
                    player={<PlayerLink handle={m.handle} name={displayName(m)} avatar={m.avatar_url} />}
                  >
                    <span className="font-bold tabular-nums text-heading">{m.xp.toLocaleString()}</span>
                    <span className="ml-1 text-xs font-medium text-muted-foreground">XP</span>
                  </StandingRow>
                </ZoneRows>
              );
            })}
          </ol>
        </Card>
      )}
    </div>
  );
};

/** A standings row, preceded by the zone label where a promotion or demotion block starts. */
const ZoneRows = ({ l, rank, n, children }: { l: MyLeague; rank: number; n: number; children: React.ReactNode }) => (
  <>
    {l.promote_zone > 0 && rank === 1 && <ZoneDivider zone="promote" count={l.promote_zone} />}
    {l.demote_zone > 0 && rank === n - l.demote_zone + 1 && <ZoneDivider zone="demote" count={l.demote_zone} />}
    {children}
  </>
);

// Leaderboards ---------------------------------------------------------------

const BOARDS: { value: Board; label: string; metric: (e: LeaderboardEntry) => string }[] = [
  { value: 'weekly', label: 'This week', metric: (e) => `${(e.weekly_xp ?? 0).toLocaleString()} XP` },
  { value: 'all_time', label: 'All time', metric: (e) => `${(e.xp ?? 0).toLocaleString()} XP` },
  { value: 'rating', label: 'Rating', metric: (e) => `${e.rating}` },
];

const LeaderboardRow = ({ e, metric }: { e: LeaderboardEntry; metric: string }) => (
  <StandingRow rank={e.rank} me={e.is_me} player={<PlayerLink handle={e.handle} name={displayName(e)} avatar={e.avatar_url} showHandle={false} />}>
    <span className="block font-bold tabular-nums text-heading">{metric}</span>
    <span className="text-xs text-muted-foreground">Level {e.level}</span>
  </StandingRow>
);

const PODIUM = [
  // DOM order is 1st, 2nd, 3rd for screen readers; `order` puts 1st in the middle.
  { order: 'order-2', avatar: 'size-16 sm:size-20 ring-medal-gold', pedestal: 'h-24 sm:h-28 bg-gradient-orange text-primary-foreground', metric: 'text-chrome-accent' },
  { order: 'order-1', avatar: 'size-12 sm:size-16 ring-medal-silver', pedestal: 'h-16 sm:h-20 bg-white/10 text-navy-foreground border-t-4 border-medal-silver', metric: 'text-navy-muted-foreground' },
  { order: 'order-3', avatar: 'size-12 sm:size-16 ring-medal-bronze', pedestal: 'h-12 sm:h-14 bg-white/10 text-navy-foreground border-t-4 border-medal-bronze', metric: 'text-navy-muted-foreground' },
];

const Podium = ({ top, metric, label }: { top: LeaderboardEntry[]; metric: (e: LeaderboardEntry) => string; label: string }) => (
  <Card variant="navy" className="relative overflow-hidden px-3 pt-6 shadow-md sm:px-10 sm:pt-8">
    <span aria-hidden className="pointer-events-none absolute inset-0 bg-dots" />
    <span aria-hidden className="pointer-events-none absolute left-1/2 top-0 size-56 -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/25 blur-3xl" />
    <ol aria-label={`${label}: top ${top.length}`} className="relative mx-auto grid max-w-lg grid-cols-3 items-end gap-2 sm:gap-4">
      {top.map((e, i) => {
        const s = PODIUM[i];
        const name = displayName(e);
        return (
          <li key={e.user_id} className={cn('flex min-w-0 flex-col items-center text-center', s.order)} aria-current={e.is_me ? 'true' : undefined}>
            {i === 0 && <Crown className="mb-1 size-6 text-medal-gold" aria-hidden />}
            <Avatar src={e.avatar_url} name={name} className={cn('ring-4 text-lg', s.avatar)} />
            <span className="mt-2 w-full truncate px-1 text-sm font-bold">
              {e.handle ? <Link to={`/u/${e.handle}`} className="underline-offset-2 hover:underline">{name}</Link> : name}
            </span>
            <span className={cn('text-xs font-bold tabular-nums sm:text-sm', s.metric)}>{metric(e)}</span>
            {e.is_me && <span className="mt-1 rounded-full bg-primary px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-primary-foreground">You</span>}
            <div className={cn('mt-2 grid w-full place-items-start justify-center rounded-t-xl pt-2 font-display text-2xl font-black sm:text-3xl', s.pedestal)}>
              <span><span className="sr-only">Rank </span>{e.rank}</span>
            </div>
          </li>
        );
      })}
    </ol>
  </Card>
);

const BoardSwitcher = ({ value, onChange }: { value: Board; onChange: (b: Board) => void }) => (
  <div role="radiogroup" aria-label="Leaderboard" className="flex flex-wrap gap-2">
    {BOARDS.map((b) => (
      <button
        key={b.value} type="button" role="radio" aria-checked={value === b.value}
        onClick={() => onChange(b.value)}
        className={cn(
          'min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors duration-200',
          value === b.value
            ? 'border-primary bg-primary-soft text-primary-soft-foreground'
            : 'bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
        )}
      >
        {b.label}
      </button>
    ))}
  </div>
);

const LeaderboardsTab = () => {
  const [board, setBoard] = useState<Board>('weekly');
  const [pages, setPages] = useState(1);
  const def = BOARDS.find((b) => b.value === board)!;
  const lb = useLeaderboard(board, 0);
  const more = useLeaderboard(board, 50);
  const listRef = useRef<HTMLOListElement>(null);
  const [myRowVisible, setMyRowVisible] = useState(false);

  const entries = lb.data?.entries ?? [];
  const top = entries.filter((e) => e.rank <= 3).slice(0, 3);
  const rest = entries.filter((e) => !top.includes(e));
  const extra = pages > 1 ? more.data?.entries ?? [] : [];
  const meInPodium = top.some((e) => e.is_me);
  const meInList = rest.some((e) => e.is_me) || extra.some((e) => e.is_me);

  // Pin your row to the bottom while it's scrolled off screen (or not on the page at all).
  useEffect(() => {
    const row = listRef.current?.querySelector('[aria-current="true"]');
    if (!row || typeof IntersectionObserver === 'undefined') { setMyRowVisible(false); return; }
    const io = new IntersectionObserver(([entry]) => setMyRowVisible(entry.isIntersecting));
    io.observe(row);
    return () => io.disconnect();
  }, [lb.data, more.data, pages]);

  const meEntry = lb.data?.me ? { ...lb.data.me, is_me: true } : entries.find((e) => e.is_me) ?? null;
  const showPinned = !!meEntry && !meInPodium && !(meInList && myRowVisible);

  return (
    <div className="space-y-4">
      <BoardSwitcher value={board} onChange={(b) => { setBoard(b); setPages(1); }} />
      {lb.isError && <ErrorState error={lb.error} onRetry={() => void lb.refetch()} />}
      {!lb.data && !lb.isError && <div className="space-y-4"><Skeleton className="h-56 rounded-lg" /><ListSkeleton rows={5} /></div>}
      {lb.data && entries.length === 0 && (
        <EmptyState icon={<Medal />} title="No one's on this board yet">Be the first: answer a question to earn XP.</EmptyState>
      )}
      {lb.data && entries.length > 0 && (
        <>
          {top.length > 0 && <Podium top={top} metric={def.metric} label={`${def.label} leaderboard`} />}
          <Card className="overflow-hidden">
            {(rest.length > 0 || extra.length > 0) && (
              <ol ref={listRef} aria-label={`${def.label} leaderboard`} className="divide-y">
                {rest.map((e) => <LeaderboardRow key={e.user_id} e={e} metric={def.metric(e)} />)}
                {extra.map((e) => <LeaderboardRow key={e.user_id} e={e} metric={def.metric(e)} />)}
              </ol>
            )}
            <div className={cn('flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground', (rest.length > 0 || extra.length > 0) && 'border-t')}>
              <span>{plural(lb.data.total, 'player')}{lb.data.refreshed_at ? ` · updated ${formatRelative(lb.data.refreshed_at)}` : ''}</span>
              {pages === 1 && lb.data.total > 50 && <Button size="sm" variant="ghost" onClick={() => setPages(2)}>Show more</Button>}
            </div>
          </Card>
        </>
      )}
      {showPinned && meEntry && (
        <div className="sticky bottom-[calc(4rem+max(0.5rem,env(safe-area-inset-bottom)))] z-10 md:bottom-4">
          <Card className="overflow-hidden border-primary/50 shadow-lg">
            <ol aria-label="Your position"><LeaderboardRow e={meEntry} metric={def.metric(meEntry)} /></ol>
          </Card>
        </div>
      )}
      {lb.data && !lb.data.me && !entries.some((e) => e.is_me) && (
        <p className="text-sm text-muted-foreground">
          {board === 'rating' ? 'Finish a daily challenge to get a rating.' : 'Earn some XP to appear on this board.'}
        </p>
      )}
    </div>
  );
};

// Contests -------------------------------------------------------------------

const ContestCard = ({ c }: { c: ContestSummary }) => {
  const live = c.state === 'live';
  const cta = live ? (c.my_entry ? 'Continue' : 'Enter')
    : c.state === 'upcoming' ? (c.my_entry ? 'View details' : 'Join')
      : 'View results';
  return (
    <Card className={cn('flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md', live && 'border-primary/60 ring-1 ring-primary/25')}>
      <div aria-hidden className={cn('h-1', live ? 'bg-gradient-orange' : c.state === 'upcoming' ? 'bg-gradient-navy' : 'bg-muted')} />
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <ContestStateBadge c={c} />
          {c.my_entry && c.state !== 'ended' && <span className="text-xs font-semibold text-success">✓ You're in</span>}
        </div>
        <CardTitle className="pt-1 text-lg">{c.title}</CardTitle>
        {c.description && <CardDescription className="line-clamp-2">{c.description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <p className="flex items-start gap-2 text-sm text-foreground">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>{formatDateTime(c.starts_at)} – {formatDateTime(c.ends_at)}</span>
        </p>
        <ul className="flex flex-wrap gap-1.5 text-xs font-semibold text-navy-soft-foreground" aria-label="Contest details">
          <li className="inline-flex items-center gap-1 rounded-full bg-navy-soft px-2.5 py-1"><ListChecks className="size-3.5" aria-hidden /> {plural(c.question_count, 'question')}</li>
          <li className="inline-flex items-center gap-1 rounded-full bg-navy-soft px-2.5 py-1"><Timer className="size-3.5" aria-hidden /> {formatSpan(c.starts_at, c.ends_at)}</li>
          <li className="inline-flex items-center gap-1 rounded-full bg-navy-soft px-2.5 py-1"><Users className="size-3.5" aria-hidden /> {plural(c.participants, 'player')}</li>
        </ul>
        {c.my_entry && c.state !== 'upcoming' && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            You: <strong className="text-heading">{c.my_entry.score} points</strong> · #{c.my_entry.rank} · {c.my_entry.answered}/{c.question_count} answered
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button asChild variant={live ? 'default' : c.state === 'upcoming' ? 'navy' : 'outline'} className="w-full sm:w-auto">
          <Link to={`/compete/contests/${c.id}`}>{cta} <ChevronRight /></Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

const ContestsTab = () => {
  const contests = useContests();
  if (contests.isError) return <ErrorState error={contests.error} onRetry={() => void contests.refetch()} />;
  if (!contests.data) return <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-60 rounded-lg" /><Skeleton className="h-60 rounded-lg" /></div>;
  if (contests.data.length === 0) {
    return <EmptyState icon={<Swords />} title="No contests right now">Contests are timed events where everyone answers the same questions. Check back soon.</EmptyState>;
  }
  return <div className="grid gap-4 sm:grid-cols-2">{contests.data.map((c) => <ContestCard key={c.id} c={c} />)}</div>;
};

// Page -----------------------------------------------------------------------

const TABS = ['league', 'leaderboards', 'contests'] as const;
type Tab = (typeof TABS)[number];

const Compete = () => {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'league';
  return (
    <Page>
      <PageHeader title="Compete" description="Climb your weekly league, top the leaderboards, and join contests." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList className="max-sm:[&_svg]:hidden">
          <TabsTrigger value="league"><Trophy /> League</TabsTrigger>
          <TabsTrigger value="leaderboards"><Medal /> Leaderboards</TabsTrigger>
          <TabsTrigger value="contests"><Swords /> Contests</TabsTrigger>
        </TabsList>
        <TabsContent value="league"><LeagueTab /></TabsContent>
        <TabsContent value="leaderboards"><LeaderboardsTab /></TabsContent>
        <TabsContent value="contests"><ContestsTab /></TabsContent>
      </Tabs>
    </Page>
  );
};

export default Compete;
