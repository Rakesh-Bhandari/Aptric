import type { ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCheck, Flame, Lock, Swords, Trophy, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { activityText } from '@/lib/community';
import { friendlyError } from '@/lib/errors';
import { displayName, formatRelative } from '@/lib/format';
import { queryClient, keys, useFollowers, useFollowing, useFollowRequests, useFriendActivity, useSuggestedUsers } from '@/lib/queries';
import type { ActivityKind, UserCard } from '@/lib/types';
import { UserListSkeleton, UserRow } from './UserRow';

/** Everything a list of people shows besides the rows: loading, error, empty and "show more". */
const PeopleList = ({ label, query, empty, rows }: {
  label: string;
  query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown; hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown };
  empty: ReactNode;
  rows: UserCard[] | null;
}) => {
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.isPending || !rows) return <Card><UserListSkeleton /></Card>;
  if (rows.length === 0) return <>{empty}</>;
  return (
    <Card className="overflow-hidden">
      <ul aria-label={label} className="divide-y">{rows.map((u) => <UserRow key={u.handle} user={u} />)}</ul>
      {query.hasNextPage && (
        <div className="border-t p-2 text-center">
          <Button variant="ghost" size="sm" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Show more</Button>
        </div>
      )}
    </Card>
  );
};

const Restricted = () => (
  <EmptyState icon={<Lock />} title="This list is private">Only people who follow this account can see who follows it and who it follows.</EmptyState>
);

/** The people `handle` follows or who follow them. `own` tunes the empty state. */
export const FollowList = ({ handle, mode, own = false, onFind }: { handle: string; mode: 'followers' | 'following'; own?: boolean; onFind?: () => void }) => {
  const followers = useFollowers(mode === 'followers' ? handle : '');
  const following = useFollowing(mode === 'following' ? handle : '');
  const query = mode === 'followers' ? followers : following;
  const pages = query.data?.pages;
  const restricted = pages?.[0]?.restricted === true;
  const rows = pages ? pages.flatMap((p) => p.items) : null;
  const find = onFind && (
    <Button variant="outline" onClick={onFind}><UserPlus /> Find people</Button>
  );

  if (restricted) return <Restricted />;
  return (
    <PeopleList
      label={mode === 'followers' ? 'Followers' : 'Following'} query={query} rows={rows}
      empty={mode === 'followers'
        ? <EmptyState icon={<Users />} title="No followers yet">{own ? 'Share your profile link so friends can follow you.' : 'Nobody follows this player yet.'}</EmptyState>
        : <EmptyState icon={<Users />} title="Not following anyone yet" action={own ? find : undefined}>{own ? 'Follow friends to see their activity and compare on the leaderboards.' : 'This player does not follow anyone yet.'}</EmptyState>}
    />
  );
};

/** People from your weekly league you have not followed yet. */
export const Suggestions = ({ title = 'People in your league' }: { title?: string }) => {
  const suggested = useSuggestedUsers();
  const items = suggested.data?.items ?? [];
  if (suggested.isError || (suggested.data && items.length === 0)) return null;
  return (
    <section aria-labelledby="suggested-title" className="space-y-2">
      <h3 id="suggested-title" className="text-sm font-bold text-heading">{title}</h3>
      <Card className="overflow-hidden">
        {suggested.isPending ? <UserListSkeleton rows={3} /> : <ul aria-label={title} className="divide-y">{items.map((u) => <UserRow key={u.handle} user={u} />)}</ul>}
      </Card>
    </section>
  );
};

const KIND_ICON: Record<ActivityKind, typeof Flame> = { daily_set: CheckCheck, league_up: Trophy, streak: Flame, challenge_won: Swords };

/** What the people you follow did in the last 14 days. Facts only, never free text. */
export const ActivityFeed = ({ onFind }: { onFind: () => void }) => {
  const feed = useFriendActivity();
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  if (feed.isError) return <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />;
  if (feed.isPending) return <Card><UserListSkeleton /></Card>;
  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={<Users />} title="No activity yet"
          action={<Button variant="outline" onClick={onFind}><UserPlus /> Find people</Button>}
        >
          When people you follow finish a daily set, reach a streak or move up a league, you will see it here for 14 days.
        </EmptyState>
        <Suggestions />
      </div>
    );
  }
  return (
    <Card className="overflow-hidden">
      <ul aria-label="Friend activity" className="divide-y">
        {items.map((a) => {
          const Icon = KIND_ICON[a.kind] ?? Flame;
          return (
            <li key={a.id} className="flex min-h-16 items-center gap-3 px-3 py-2.5 sm:px-4">
              <Avatar src={a.user.avatar_url} name={displayName(a.user)} className="size-9" />
              <p className="min-w-0 flex-1 text-sm">
                <Link to={`/u/${a.user.handle}`} className="font-semibold text-heading underline-offset-2 hover:underline">{displayName(a.user)}</Link>{' '}
                {activityText(a)}
                <span className="block text-xs text-muted-foreground">{formatRelative(a.created_at)}</span>
              </p>
              <Icon className="size-5 shrink-0 text-accent-text" aria-hidden />
            </li>
          );
        })}
      </ul>
      {feed.hasNextPage && (
        <div className="border-t p-2 text-center">
          <Button variant="ghost" size="sm" loading={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>Show more</Button>
        </div>
      )}
    </Card>
  );
};

/** Follow requests to a private account: accept or decline. */
export const RequestsList = () => {
  const requests = useFollowRequests();
  const toast = useToast();
  const respond = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => api.respondFollowRequest(id, accept),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: keys.followRequests });
      const previous = queryClient.getQueryData<{ items: { id: string }[] }>(keys.followRequests);
      if (previous) queryClient.setQueryData(keys.followRequests, { ...previous, items: previous.items.filter((r) => r.id !== id) });
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(keys.followRequests, ctx.previous);
      toast.error(friendlyError(err, "We couldn't answer that request."));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.followRequests });
      void queryClient.invalidateQueries({ queryKey: ['users', 'followers'] });
    },
  });
  const items = requests.data?.items ?? [];
  if (requests.isError) return <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />;
  if (requests.isPending) return <Card><UserListSkeleton rows={2} /></Card>;
  if (items.length === 0) {
    return <EmptyState icon={<UserPlus />} title="No follow requests">When someone asks to follow your private account, it shows up here.</EmptyState>;
  }
  return (
    <Card className="overflow-hidden">
      <ul aria-label="Follow requests" className="divide-y">
        {items.map((r) => (
          <UserRow key={r.id} user={r}>
            <span className="relative z-10 flex shrink-0 gap-2">
              <Button size="sm" onClick={() => respond.mutate({ id: r.id, accept: true })}>Accept<span className="sr-only"> @{r.handle}</span></Button>
              <Button size="sm" variant="outline" onClick={() => respond.mutate({ id: r.id, accept: false })}>Decline<span className="sr-only"> @{r.handle}</span></Button>
            </span>
          </UserRow>
        ))}
      </ul>
    </Card>
  );
};
