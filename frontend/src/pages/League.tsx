import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, Download, Flame, Megaphone, Share2, Swords, Trash2 } from 'lucide-react';
import { ChallengeDialog } from '@/components/community/ChallengeDialog';
import { InviteDialog } from '@/components/community/GroupDialogs';
import { UserListSkeleton, UserRow } from '@/components/community/UserRow';
import { LeagueAdmin } from '@/components/community/LeagueAdmin';
import { PlayerLink, StandingRow } from '@/components/compete/standings';
import { NotFound } from '@/components/layout/ErrorBoundary';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldHint, Input, Label, Textarea } from '@/components/ui/input';
import { Page } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { activityText } from '@/lib/community';
import { errorCode, friendlyError } from '@/lib/errors';
import { displayName, formatRelative, plural } from '@/lib/format';
import { canManage, downloadText, rankDeltaSpeech, rankDeltaText, validRange, WINDOW_LABEL, windowsFor } from '@/lib/groups';
import { invalidateGroups, keys, queryClient, useChallengesEnabled, useGroup, useGroupBoard } from '@/lib/queries';
import { LEAGUES_PATH } from '@/lib/routes';
import type { Group, GroupWindow } from '@/lib/types';
import { cn } from '@/lib/utils';
import { GroupBadges, GroupsGate } from './Leagues';

const TABS = ['leaderboard', 'activity', 'challenges', 'announcements', 'manage'] as const;
type Tab = (typeof TABS)[number];

const Delta = ({ delta }: { delta: number | null }) => {
  if (delta === null) return null;
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : null;
  return (
    <span
      className={cn('inline-flex min-w-9 items-center justify-end gap-0.5 text-xs font-semibold tabular-nums', delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-muted-foreground')}
    >
      {Icon && <Icon className="size-3" aria-hidden />}<span aria-hidden>{rankDeltaText(delta)}</span><span className="sr-only">{rankDeltaSpeech(delta)}</span>
    </span>
  );
};

const Board = ({ g }: { g: Group }) => {
  const toast = useToast();
  const [win, setWin] = useState<GroupWindow>(g.weekly_reset || !g.season_start ? 'weekly' : 'season');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const custom = win === 'custom';
  const ok = !custom || validRange(from, to);
  const board = useGroupBoard(g.id, win, custom ? from : null, custom ? to : null, ok);
  const data = board.data;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const r = await api.exportGroupResults({ id: g.id, win, from: custom ? from : undefined, to: custom ? to : undefined });
      downloadText(r.filename, r.csv);
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't export the results."));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Time window" className="inline-flex max-w-full overflow-x-auto rounded-full bg-muted p-1">
          {windowsFor(g).map((w) => (
            <button
              key={w} type="button" role="radio" aria-checked={win === w} onClick={() => setWin(w)}
              className={cn('min-h-11 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors duration-200 sm:px-4',
                win === w ? 'bg-card text-accent-text shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {WINDOW_LABEL[w]}
            </button>
          ))}
        </div>
        {canManage(g.my_role) && <Button variant="outline" size="sm" onClick={() => void exportCsv()} loading={exporting} disabled={!ok}><Download /> Export CSV</Button>}
      </div>

      {custom && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label htmlFor="lg-from">From</Label><Input id="lg-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="lg-to">To</Label><Input id="lg-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          {from && to && !ok && <FieldHint error>Choose dates in order, up to 93 days apart.</FieldHint>}
        </div>
      )}

      {board.isError && <ErrorState error={board.error} onRetry={() => void board.refetch()} />}
      {!data && !board.isError && ok && <Card><UserListSkeleton rows={5} /></Card>}
      {data && data.entries.length === 0 && <EmptyState icon={<Flame />} title="No one on the board yet">Earn XP in today's set to get it started.</EmptyState>}
      {data && data.most_improved && (
        <p className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-sm text-success-soft-foreground">
          <ArrowUp className="size-4" aria-hidden /> Most improved: <strong>{displayName(data.most_improved.user)}</strong> (+{data.most_improved.gain.toLocaleString()} XP on the window before)
        </p>
      )}
      {data && data.entries.length > 0 && (
        <Card className="overflow-hidden">
          <ol aria-label={`${g.name} leaderboard, ${WINDOW_LABEL[win].toLowerCase()}`} className="divide-y">
            {data.entries.map((e) => (
              <StandingRow
                key={e.user.handle} rank={e.rank} me={e.is_me}
                player={<PlayerLink handle={e.user.handle} name={displayName(e.user)} avatar={e.user.avatar_url} />}
              >
                <span className="block font-bold tabular-nums text-heading">{e.xp.toLocaleString()} XP</span>
                <span className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
                  {e.streak > 0 && <span className="inline-flex items-center gap-0.5"><Flame className="size-3 text-streak" aria-hidden />{e.streak}</span>}
                  <span>{e.correct} right</span>
                  <Delta delta={e.rank_delta} />
                </span>
              </StandingRow>
            ))}
          </ol>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">
            {plural(data.total, 'member')} · XP earned {data.window.from ? `${data.window.from} to ${data.window.to}` : 'all time'}. Ties go to more correct answers, then to whoever got there first.
          </p>
        </Card>
      )}
    </div>
  );
};

const Activity = ({ g }: { g: Group }) => {
  const feed = useInfiniteQuery({
    queryKey: ['group-extra', 'activity', g.id], initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.getGroupActivity(g.id, pageParam), getNextPageParam: (last) => last.next_cursor,
  });
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  if (feed.isError) return <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />;
  if (feed.isPending) return <Card><UserListSkeleton /></Card>;
  if (items.length === 0) return <EmptyState icon={<Flame />} title="Quiet so far">Finished daily sets, streaks and promotions of members show up here for 14 days.</EmptyState>;
  return (
    <Card className="overflow-hidden">
      <ul aria-label="League activity" className="divide-y">
        {items.map((a) => (
          <li key={a.id} className="flex min-h-14 items-center gap-3 px-3 py-2.5 sm:px-4">
            <Avatar src={a.user.avatar_url} name={displayName(a.user)} className="size-9" />
            <p className="min-w-0 flex-1 text-sm">
              <Link to={`/u/${a.user.handle}`} className="font-semibold text-heading underline-offset-2 hover:underline">{displayName(a.user)}</Link> {activityText(a)}
              <span className="block text-xs text-muted-foreground">{formatRelative(a.created_at)}</span>
            </p>
          </li>
        ))}
      </ul>
      {feed.hasNextPage && <div className="border-t p-2 text-center"><Button variant="ghost" size="sm" loading={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>Show more</Button></div>}
    </Card>
  );
};

const Challenges = ({ g }: { g: Group }) => {
  const [target, setTarget] = useState<string | null>(null);
  const on = useChallengesEnabled();
  const members = useQuery({ queryKey: ['group-extra', 'members', g.id], queryFn: () => api.getGroupMembers(g.id) });
  const results = useQuery({ queryKey: ['group-extra', 'challenges', g.id], queryFn: () => api.getGroupChallenges(g.id) });
  const others = (members.data?.items ?? []).filter((m) => !m.relationship.is_me);
  return (
    <div className="space-y-4">
      {!on && <EmptyState icon={<Swords />} title="Challenges are coming soon">Members will be able to challenge each other here.</EmptyState>}
      {on && (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-bold text-heading">Challenge a member</h2>
            {members.isError && <ErrorState error={members.error} onRetry={() => void members.refetch()} />}
            {members.isPending && <Card><UserListSkeleton rows={3} /></Card>}
            {members.data && others.length === 0 && <FieldHint>No one else is in this league yet.</FieldHint>}
            {others.length > 0 && !g.is_archived && (
              <Card className="overflow-hidden">
                <ul aria-label="Members" className="divide-y">
                  {others.map((m) => (
                    <UserRow key={m.handle} user={m}>
                      <Button size="sm" variant="secondary" className="relative z-10" onClick={() => setTarget(m.handle)}><Swords /> Challenge<span className="sr-only"> @{m.handle}</span></Button>
                    </UserRow>
                  ))}
                </ul>
              </Card>
            )}
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-bold text-heading">Recent results</h2>
            {results.data && results.data.items.length === 0 && <FieldHint>No finished challenges between members in the last 14 days.</FieldHint>}
            {results.data && results.data.items.length > 0 && (
              <Card><ul aria-label="Recent challenge results" className="divide-y">
                {results.data.items.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                    <span className={cn('font-semibold', r.winner === 'challenger' && 'text-success')}>@{r.challenger.handle} {r.challenger_score}</span>
                    <span className="text-muted-foreground">vs</span>
                    <span className={cn('font-semibold', r.winner === 'opponent' && 'text-success')}>@{r.opponent.handle} {r.opponent_score}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{r.winner === 'draw' ? 'Draw · ' : ''}{formatRelative(r.completed_at)}</span>
                  </li>
                ))}
              </ul></Card>
            )}
          </section>
        </>
      )}
      {target && <ChallengeDialog open onOpenChange={(o) => { if (!o) setTarget(null); }} opponent={target} />}
    </div>
  );
};

const Announcements = ({ g }: { g: Group }) => {
  const toast = useToast();
  const list = useQuery({ queryKey: ['group-extra', 'announcements', g.id], queryFn: () => api.getGroupAnnouncements(g.id) });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const manage = canManage(g.my_role) && !g.is_archived;
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['group-extra', 'announcements', g.id] }), invalidateGroups()]);

  const post = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.postGroupAnnouncement(g.id, text.trim());
      setText('');
      await refresh();
      toast.success('Announcement posted.');
    } catch (err) {
      toast.error(['22023', '55000'].includes(errorCode(err) ?? '') ? (err as Error).message : friendlyError(err, "We couldn't post that."));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    try { await api.deleteGroupAnnouncement(g.id, id); await refresh(); } catch (err) { toast.error(friendlyError(err, "We couldn't delete it.")); }
  };

  return (
    <div className="space-y-4">
      {manage && (
        <Card className="p-4">
          <form onSubmit={post} className="space-y-2">
            <Label htmlFor="ann-body">New announcement</Label>
            <Textarea id="ann-body" value={text} onChange={(e) => setText(e.target.value)} maxLength={280} placeholder="Season starts Monday. Good luck!" />
            <div className="flex items-center justify-between gap-3">
              <FieldHint>{text.length}/280 · pinned for everyone; stays until replaced or deleted</FieldHint>
              <Button type="submit" size="sm" loading={busy} disabled={!text.trim()}><Megaphone /> Post</Button>
            </div>
          </form>
        </Card>
      )}
      {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
      {list.isPending && <Card><UserListSkeleton rows={2} /></Card>}
      {list.data && list.data.items.length === 0 && <EmptyState icon={<Megaphone />} title="No announcements">Organisers can post official notices here.</EmptyState>}
      {list.data && list.data.items.length > 0 && (
        <ul aria-label="Announcements" className="space-y-3">
          {list.data.items.map((a) => (
            <li key={a.id}>
              <Card className={cn('p-4', a.pinned && 'border-primary/40 bg-primary-wash')}>
                <p className="text-sm text-heading [overflow-wrap:anywhere]">{a.body}</p>
                <p className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{a.pinned ? 'Pinned · ' : ''}{a.author ? `@${a.author.handle} · ` : ''}{formatRelative(a.created_at)}</span>
                  {manage && <Button variant="ghost" size="icon" className="size-9" aria-label="Delete announcement" onClick={() => void remove(a.id)}><Trash2 /></Button>}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const LeagueInner = () => {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const group = useGroup(slug);
  const [inviting, setInviting] = useState(false);
  const g = group.data;
  const manage = canManage(g?.my_role);
  const tab: Tab = TABS.includes(params.get('tab') as Tab) && (params.get('tab') !== 'manage' || manage) ? (params.get('tab') as Tab) : 'leaderboard';

  const leave = useCallback(async () => {
    if (!g) return;
    const ok = await toast.confirm({ title: `Leave ${g.name}?`, message: 'You will drop off its board. You can rejoin with the invite unless an admin removed you.', confirmText: 'Leave', danger: true });
    if (!ok) return;
    try { await api.leaveGroup(g.id); await invalidateGroups(); navigate(LEAGUES_PATH); } catch (err) { toast.error(['55000'].includes(errorCode(err) ?? '') ? (err as Error).message : friendlyError(err, "We couldn't leave.")); }
  }, [g, navigate, toast]);

  useEffect(() => { void queryClient.invalidateQueries({ queryKey: keys.group(slug) }); }, [slug]);

  if (group.isError) {
    if (['P0002', '22023'].includes(errorCode(group.error) ?? '')) return <NotFound title="League not found" message="It is private: you can only open leagues you belong to." />;
    return <Page><ErrorState error={group.error} onRetry={() => void group.refetch()} /></Page>;
  }
  if (!g) return <Page className="max-w-2xl"><LoadingRegion className="space-y-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-64" /></LoadingRegion></Page>;
  if (g.my_status !== 'active') {
    return (
      <Page className="max-w-xl">
        <EmptyState icon={<Megaphone />} title={g.my_status === 'pending' ? 'Waiting for approval' : 'You are not in this league'} action={<Button asChild><Link to={LEAGUES_PATH}>Back to Leagues</Link></Button>}>
          An admin of {g.name} has to approve your request.
        </EmptyState>
      </Page>
    );
  }

  return (
    <Page className="max-w-2xl space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2"><Link to={LEAGUES_PATH}><ArrowLeft /> Leagues</Link></Button>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-heading sm:text-3xl [overflow-wrap:anywhere]">{g.name}</h1>
          <GroupBadges g={g} />
          <p className="text-sm text-muted-foreground">{plural(g.member_count, 'member')} of {g.max_members.toLocaleString()}{g.season_start ? ` · season ${g.season_start} to ${g.season_end}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {manage && !g.is_archived && <Button onClick={() => setInviting(true)}><Share2 /> Share invite</Button>}
          {g.my_role !== 'owner' && <Button variant="ghost" onClick={() => void leave()}>Leave</Button>}
        </div>
      </header>

      {g.announcement && (
        <aside aria-label="Pinned announcement" className="flex gap-3 rounded-lg border border-primary/40 bg-primary-wash p-4">
          <Megaphone className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden />
          <div className="min-w-0"><p className="text-sm text-heading [overflow-wrap:anywhere]">{g.announcement.body}</p><p className="mt-1 text-xs text-muted-foreground">{formatRelative(g.announcement.created_at)}</p></div>
        </aside>
      )}

      <Tabs value={tab} onValueChange={(v) => setParams(v === 'leaderboard' ? {} : { tab: v }, { replace: true })}>
        <TabsList aria-label="League sections">
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="challenges">Challenges</TabsTrigger>
          <TabsTrigger value="announcements">Notices</TabsTrigger>
          {manage && <TabsTrigger value="manage">Manage</TabsTrigger>}
        </TabsList>
        <TabsContent value="leaderboard"><Board g={g} /></TabsContent>
        <TabsContent value="activity"><Activity g={g} /></TabsContent>
        <TabsContent value="challenges"><Challenges g={g} /></TabsContent>
        <TabsContent value="announcements"><Announcements g={g} /></TabsContent>
        {manage && <TabsContent value="manage"><LeagueAdmin g={g} /></TabsContent>}
      </Tabs>
      {manage && <InviteDialog groupId={g.id} name={g.name} open={inviting} onOpenChange={setInviting} />}
    </Page>
  );
};

/** /leagues/:slug */
const League = () => <GroupsGate><LeagueInner /></GroupsGate>;

export default League;
