import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock, UserPlus } from 'lucide-react';
import { ActivityFeed, FollowList, RequestsList } from '@/components/community/lists';
import { UserSearchDialog } from '@/components/community/UserSearchDialog';
import { Button } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/ui/page';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/states';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/context/SessionContext';
import { useCommunityEnabled, useEntitlements, useFollowRequests } from '@/lib/queries';

const TABS = ['activity', 'following', 'followers', 'requests'] as const;
type Tab = (typeof TABS)[number];

/** Shown instead of a community screen while the feature is off for the player's plan. */
export const CommunityOff = () => (
  <Page className="max-w-3xl">
    <EmptyState icon={<Lock />} title="Friends are coming soon">Following friends and comparing progress will be available to you shortly.</EmptyState>
  </Page>
);

/** Waits for the plan, then shows `children` only when the community feature is on. */
export const CommunityGate = ({ children }: { children: React.ReactNode }) => {
  const ent = useEntitlements();
  const on = useCommunityEnabled();
  if (ent.isPending) return <Page className="max-w-3xl"><LoadingRegion className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-64" /></LoadingRegion></Page>;
  return on ? <>{children}</> : <CommunityOff />;
};

const FriendsInner = () => {
  const { profile } = useSession();
  const [params, setParams] = useSearchParams();
  const [finding, setFinding] = useState(false);
  const requests = useFollowRequests();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'activity';
  const handle = profile?.handle ?? '';
  const pending = requests.data?.items.length ?? 0;
  const find = () => setFinding(true);

  return (
    <Page className="max-w-3xl space-y-5">
      <PageHeader
        title="Friends" description="See what the people you follow are up to. Everything here is about practice, nothing else."
        actions={<Button onClick={find}><UserPlus /> Find people</Button>}
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList aria-label="Friends sections">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="following">Following</TabsTrigger>
          <TabsTrigger value="followers">Followers</TabsTrigger>
          <TabsTrigger value="requests">
            Requests{pending > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground" aria-label={`${pending} waiting`}>{pending}</span>}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="activity"><ActivityFeed onFind={find} /></TabsContent>
        <TabsContent value="following">{handle && <FollowList handle={handle} mode="following" own onFind={find} />}</TabsContent>
        <TabsContent value="followers">{handle && <FollowList handle={handle} mode="followers" own />}</TabsContent>
        <TabsContent value="requests"><RequestsList /></TabsContent>
      </Tabs>
      <UserSearchDialog open={finding} onOpenChange={setFinding} />
    </Page>
  );
};

/** /friends */
const Friends = () => <CommunityGate><FriendsInner /></CommunityGate>;

/** /u/:handle/followers and /u/:handle/following */
export const FollowListPage = ({ mode }: { mode: 'followers' | 'following' }) => {
  const { handle = '' } = useParams();
  return (
    <CommunityGate>
      <Page className="max-w-3xl space-y-4">
        <Button variant="ghost" size="sm" asChild><Link to={`/u/${handle}`}><ArrowLeft /> @{handle}</Link></Button>
        <PageHeader
          title={mode === 'followers' ? 'Followers' : 'Following'}
          description={mode === 'followers' ? `People who follow @${handle}.` : `People @${handle} follows.`}
        />
        <FollowList handle={handle.toLowerCase()} mode={mode} />
      </Page>
    </CommunityGate>
  );
};

export default Friends;
