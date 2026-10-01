import { Fragment, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, CalendarClock, ChevronRight, Crown, Medal, Radio, Swords, Trophy, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { subscribeToLeague } from '@/lib/api';
import { displayName, formatDateTime, formatRelative, plural } from '@/lib/format';
import { keys, queryClient, useContests, useLeaderboard, useMyLeague } from '@/lib/queries';
import type { Board, ContestSummary, LeaderboardEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

const ListSkeleton = ({ rows = 8 }: { rows?: number }) => (
  <LoadingRegion label="Loading standings" className="space-y-2">
    {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-14" />)}
  </LoadingRegion>
);

const RankBadge = ({ rank }: { rank: number }) => (
  <span className={cn(
    'grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums',
    rank === 1 ? 'bg-gold/20 text-foreground' : rank <= 3 ? 'bg-muted text-foreground' : 'text-muted-foreground',
  )}
  >
    {rank === 1 ? <Crown className="size-4 text-gold" aria-label="1st" /> : rank}
  </span>
);

const PlayerLink = ({ handle, name, avatar }: { handle: string | null; name: string; avatar: string | null }) => (
  <span className="flex min-w-0 items-center gap-2.5">
    <Avatar src={avatar} name={name} className="size-8" />
    {handle ? (
      <Link to={`/u/${handle}`} className="truncate font-medium hover:underline">{name}</Link>
    ) : <span className="truncate font-medium">{name}</span>}
  </span>
);

// League -------------------------------------------------------------------

const LeagueTab = () => {
  const league = useMyLeague();
  const leagueId = league.data?.league_id ?? null;

  // Live standings: refetch (at most every 2 s) when anyone in the league gains XP.
  useEffect(() => {
    if (!leagueId) return;
    let timer: number | undefined;
    const unsubscribe = subscribeToLeague(leagueId, () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: keys.league }), 2000);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [leagueId]);

  if (league.isError) return <ErrorState error={league.error} onRetry={() => void league.refetch()} />;
  if (!league.data) return <ListSkeleton />;
  const l = league.data;
  const n = l.members.length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg"><Trophy className="size-5 text-gold" aria-hidden /> {l.tier.name} league</CardTitle>
            <Badge variant="muted"><CalendarClock /> Ends {formatRelative(l.week_ends_at)}</Badge>
          </div>
          <CardDescription>
            Weekly XP decides your place. {l.promote_zone > 0 && `Top ${l.promote_zone} move up`}{l.promote_zone > 0 && l.demote_zone > 0 && ', '}
            {l.demote_zone > 0 && `bottom ${l.demote_zone} move down`}{(l.promote_zone > 0 || l.demote_zone > 0) && ' when the week ends.'}
          </CardDescription>
          {l.last_result && (
            <p className="text-sm">
              Last week you finished <strong>#{l.last_result.final_rank}</strong> and{' '}
              {l.last_result.outcome === 'promoted' ? 'moved up a league 🎉' : l.last_result.outcome === 'demoted' ? 'moved down a league' : 'kept your place'}.
            </p>
          )}
        </CardHeader>
      </Card>

      {!l.league_id ? (
        <EmptyState icon={<Users />} title="You're not in a league yet" action={<Button asChild><Link to="/">Play today's challenge</Link></Button>}>
          Earn any XP this week and you'll join a {l.tier.name} league with up to 30 players.
        </EmptyState>
      ) : (
        <Card>
          <ol aria-label={`${l.tier.name} league standings`} className="divide-y">
            {l.members.map((m) => {
              const promote = l.promote_zone > 0 && m.rank <= l.promote_zone;
              const demote = l.demote_zone > 0 && m.rank > n - l.demote_zone;
              return (
                <Fragment key={m.user_id}>
                  {l.demote_zone > 0 && m.rank === n - l.demote_zone + 1 && (
                    <li className="flex items-center gap-2 bg-danger-soft px-4 py-1.5 text-xs font-semibold text-danger-soft-foreground"><ArrowDown className="size-3.5" aria-hidden /> Demotion zone</li>
                  )}
                  <li className={cn('flex items-center gap-3 px-3 py-2.5 sm:px-4', m.is_me && 'bg-primary-soft/60')} aria-current={m.is_me ? 'true' : undefined}>
                    <RankBadge rank={m.rank} />
                    <PlayerLink handle={m.handle} name={displayName(m)} avatar={m.avatar_url} />
                    {m.is_me && <Badge>You</Badge>}
                    <span className="ml-auto flex items-center gap-2 text-sm font-semibold tabular-nums">
                      {promote && <ArrowUp className="size-4 text-success" aria-label="Promotion zone" />}
                      {demote && <ArrowDown className="size-4 text-danger" aria-label="Demotion zone" />}
                      {m.xp.toLocaleString()} XP
                    </span>
                  </li>
                  {l.promote_zone > 0 && m.rank === l.promote_zone && m.rank < n && (
                    <li className="flex items-center gap-2 bg-success-soft px-4 py-1.5 text-xs font-semibold text-success-soft-foreground"><ArrowUp className="size-3.5" aria-hidden /> Promotion zone above</li>
                  )}
                </Fragment>
              );
            })}
          </ol>
        </Card>
      )}
    </div>
  );
};

// Leaderboards ---------------------------------------------------------------

const BOARDS: { value: Board; label: string; metric: (e: LeaderboardEntry) => string }[] = [
  { value: 'weekly', label: 'This week', metric: (e) => `${(e.weekly_xp ?? 0).toLocaleString()} XP` },
  { value: 'all_time', label: 'All time', metric: (e) => `${(e.xp ?? 0).toLocaleString()} XP` },
  { value: 'rating', label: 'Rating', metric: (e) => `${e.rating}` },
];

const LeaderboardRow = ({ e, metric }: { e: LeaderboardEntry; metric: string }) => (
  <li className={cn('flex items-center gap-3 px-3 py-2.5 sm:px-4', e.is_me && 'bg-primary-soft/60')} aria-current={e.is_me ? 'true' : undefined}>
    <RankBadge rank={e.rank} />
    <PlayerLink handle={e.handle} name={displayName(e)} avatar={e.avatar_url} />
    {e.is_me && <Badge>You</Badge>}
    <span className="ml-auto text-right text-sm">
      <span className="block font-semibold tabular-nums">{metric}</span>
      <span className="text-xs text-muted-foreground">Level {e.level}</span>
    </span>
  </li>
);

const LeaderboardsTab = () => {
  const [board, setBoard] = useState<Board>('weekly');
  const [pages, setPages] = useState(1);
  const def = BOARDS.find((b) => b.value === board)!;
  const lb = useLeaderboard(board, 0);
  const more = useLeaderboard(board, 50);

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Leaderboard" className="inline-flex rounded-lg bg-muted p-1">
        {BOARDS.map((b) => (
          <button
            key={b.value} type="button" role="radio" aria-checked={board === b.value}
            onClick={() => { setBoard(b.value); setPages(1); }}
            className={cn('min-h-10 rounded-md px-3 text-sm font-medium text-muted-foreground', board === b.value && 'bg-card text-foreground shadow-sm')}
          >
            {b.label}
          </button>
        ))}
      </div>
      {lb.isError && <ErrorState error={lb.error} onRetry={() => void lb.refetch()} />}
      {!lb.data && !lb.isError && <ListSkeleton />}
      {lb.data && lb.data.entries.length === 0 && (
        <EmptyState icon={<Medal />} title="No one's on this board yet">Be the first: answer a question to earn XP.</EmptyState>
      )}
      {lb.data && lb.data.entries.length > 0 && (
        <Card>
          <ol aria-label={`${def.label} leaderboard`} className="divide-y">
            {lb.data.entries.map((e) => <LeaderboardRow key={e.user_id} e={e} metric={def.metric(e)} />)}
            {pages > 1 && more.data?.entries.map((e) => <LeaderboardRow key={e.user_id} e={e} metric={def.metric(e)} />)}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
            <span>{plural(lb.data.total, 'player')}{lb.data.refreshed_at ? ` · updated ${formatRelative(lb.data.refreshed_at)}` : ''}</span>
            {pages === 1 && lb.data.total > 50 && <Button size="sm" variant="ghost" onClick={() => setPages(2)}>Show more</Button>}
          </div>
        </Card>
      )}
      {lb.data?.me && !lb.data.entries.some((e) => e.is_me) && !(pages > 1 && more.data?.entries.some((e) => e.is_me)) && (
        <Card className="border-primary/40">
          <ol aria-label="Your position"><LeaderboardRow e={{ ...lb.data.me, is_me: true }} metric={def.metric(lb.data.me)} /></ol>
        </Card>
      )}
      {lb.data && !lb.data.me && (
        <p className="text-sm text-muted-foreground">
          {board === 'rating' ? 'Finish a daily challenge to get a rating.' : 'Earn some XP to appear on this board.'}
        </p>
      )}
    </div>
  );
};

// Contests -------------------------------------------------------------------

export const ContestStateBadge = ({ c }: { c: ContestSummary }) =>
  c.state === 'live' ? <Badge variant="danger"><Radio /> Live now</Badge>
    : c.state === 'upcoming' ? <Badge variant="default"><CalendarClock /> Starts {formatRelative(c.starts_at)}</Badge>
      : <Badge variant="muted">Ended</Badge>;

const ContestCard = ({ c }: { c: ContestSummary }) => (
  <Card className={cn(c.state === 'live' && 'border-danger/40')}>
    <CardHeader className="pb-3">
      <div className="flex flex-wrap items-center gap-2"><ContestStateBadge c={c} /></div>
      <CardTitle className="text-lg">{c.title}</CardTitle>
      {c.description && <CardDescription className="line-clamp-2">{c.description}</CardDescription>}
    </CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {formatDateTime(c.starts_at)} – {formatDateTime(c.ends_at)} · {plural(c.question_count, 'question')} · {plural(c.participants, 'player')}
      </p>
      {c.my_entry && (
        <p className="text-sm">
          {c.state === 'upcoming' ? "You're registered." : <>You: <strong>{c.my_entry.score} points</strong> · #{c.my_entry.rank} · {c.my_entry.answered}/{c.question_count} answered</>}
        </p>
      )}
      <Button asChild variant={c.state === 'live' ? 'default' : 'outline'}>
        <Link to={`/compete/contests/${c.id}`}>
          {c.state === 'live' ? (c.my_entry ? 'Continue' : 'Enter contest') : c.state === 'upcoming' ? (c.my_entry ? 'View details' : 'Register') : 'See results'}
          <ChevronRight />
        </Link>
      </Button>
    </CardContent>
  </Card>
);

const ContestsTab = () => {
  const contests = useContests();
  if (contests.isError) return <ErrorState error={contests.error} onRetry={() => void contests.refetch()} />;
  if (!contests.data) return <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-52" /><Skeleton className="h-52" /></div>;
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
        <TabsList>
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
