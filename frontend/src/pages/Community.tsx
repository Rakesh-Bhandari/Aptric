import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessagesSquare, PenSquare, Lock } from 'lucide-react';
import { Composer } from '@/components/community/Composer';
import { PostCard } from '@/components/community/PostCard';
import { useNow } from '@/components/compete/time';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Page, PageHeader } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { clockSkew, livePosts, msLeft, quantizeMs } from '@/lib/posts';
import { useEntitlements, useFeed, usePostsEnabled, useTopics } from '@/lib/queries';
import type { FeedName, FeedSort } from '@/lib/types';
import { cn } from '@/lib/utils';

const FEEDS: { value: FeedName; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'following', label: 'Following' },
  { value: 'topic', label: 'Topic' },
  { value: 'mine', label: 'My posts' },
];

const EMPTY: Record<FeedName, { title: string; text: string }> = {
  everyone: { title: 'No posts right now', text: 'Posts last 48 hours, so the feed is always fresh. Start the conversation.' },
  following: { title: 'Nothing from people you follow', text: 'Follow people from the Friends page, or switch to Everyone.' },
  topic: { title: 'Nothing on this topic', text: 'Be the first to post about it.' },
  mine: { title: "You haven't posted in the last 48 hours", text: 'Posts disappear after 48 hours. Share a tip, a win or a question.' },
};

/** Waits for the plan, then shows `children` only when 48-hour posts are on for the player. */
const PostsGate = ({ children }: { children: ReactNode }) => {
  const ent = useEntitlements();
  const on = usePostsEnabled();
  if (ent.isPending) {
    return <Page className="max-w-2xl"><LoadingRegion className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-48" /></LoadingRegion></Page>;
  }
  return on ? <>{children}</> : (
    <Page className="max-w-2xl">
      <EmptyState icon={<Lock />} title="Community is coming soon">Short posts about practice, shared with other learners, will be available to you shortly.</EmptyState>
    </Page>
  );
};

const SortSwitch = ({ value, onChange }: { value: FeedSort; onChange: (s: FeedSort) => void }) => (
  <div role="radiogroup" aria-label="Sort posts" className="inline-flex rounded-full bg-muted p-1">
    {([['new', 'New'], ['hot', 'Hot']] as const).map(([v, text]) => (
      <button
        key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
        className={cn('min-h-11 rounded-full px-4 text-sm font-semibold transition-colors duration-200',
          value === v ? 'bg-card text-accent-text shadow-sm' : 'text-muted-foreground hover:text-foreground')}
      >
        {text}
      </button>
    ))}
  </div>
);

const Feed = ({ feed, sort, topicId }: { feed: FeedName; sort: FeedSort; topicId: string | null }) => {
  const query = useFeed(feed, sort, topicId);
  const now = useNow(1000);
  const pages = query.data?.pages;
  // The countdown runs on the server's clock, as of the newest page we fetched.
  const skew = useMemo(() => clockSkew(pages?.at(-1)?.server_now, query.dataUpdatedAt), [pages, query.dataUpdatedAt]);
  const live = useMemo(() => livePosts(pages?.flatMap((p) => p.items) ?? [], now, skew), [pages, now, skew]);

  if (feed === 'topic' && !topicId) return <EmptyState icon={<MessagesSquare />} title="Choose a topic">Pick a topic above to see its posts.</EmptyState>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.isPending) return <LoadingRegion label="Loading posts" className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</LoadingRegion>;
  if (live.length === 0) return <EmptyState icon={<MessagesSquare />} title={EMPTY[feed].title}>{EMPTY[feed].text}</EmptyState>;
  return (
    <div className="space-y-3">
      <ul aria-label="Posts" className="space-y-3">
        {live.map((p) => (
          <li key={p.id}><PostCard post={p} ms={quantizeMs(msLeft(p.expires_at, now, skew))} /></li>
        ))}
      </ul>
      {query.hasNextPage && (
        <div className="text-center">
          <Button variant="outline" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Show more</Button>
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">Posts disappear 48 hours after they are written.</p>
    </div>
  );
};

const CommunityInner = () => {
  const [params, setParams] = useSearchParams();
  const topics = useTopics();
  const feed: FeedName = FEEDS.some((f) => f.value === params.get('feed')) ? (params.get('feed') as FeedName) : 'everyone';
  const sort: FeedSort = params.get('sort') === 'hot' ? 'hot' : 'new';
  const topicId = params.get('topic');
  const linkedQuestion = params.get('question');
  const [composing, setComposing] = useState(params.get('compose') === '1');

  // Arriving from a solved question opens the composer once; the params are then cleared.
  useEffect(() => {
    if (params.get('compose') === '1') {
      setComposing(true);
      const next = new URLSearchParams(params);
      next.delete('compose');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  return (
    <Page className="max-w-2xl space-y-4">
      <PageHeader
        title="Community" description="Short posts about practice. Everything disappears after 48 hours."
        actions={<Button onClick={() => setComposing(true)}><PenSquare /> New post</Button>}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Which posts" className="inline-flex max-w-full overflow-x-auto rounded-full bg-muted p-1">
          {FEEDS.map((f) => (
            <button
              key={f.value} type="button" role="radio" aria-checked={feed === f.value}
              onClick={() => set({ feed: f.value === 'everyone' ? null : f.value })}
              className={cn('min-h-11 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors duration-200 sm:px-4',
                feed === f.value ? 'bg-card text-accent-text shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <SortSwitch value={sort} onChange={(s) => set({ sort: s === 'new' ? null : s })} />
      </div>
      {feed === 'topic' && (
        <Select aria-label="Topic" value={topicId ?? ''} onChange={(e) => set({ topic: e.target.value || null })}>
          <option value="">Choose a topic</option>
          {(topics.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      )}
      <Feed feed={feed} sort={sort} topicId={topicId} />
      <Composer
        open={composing} onOpenChange={(o) => { setComposing(o); if (!o && linkedQuestion) set({ question: null }); }}
        questionId={linkedQuestion} defaultTopicId={feed === 'topic' ? topicId : null}
      />
    </Page>
  );
};

/** /community */
const Community = () => <PostsGate><CommunityInner /></PostsGate>;

export default Community;
