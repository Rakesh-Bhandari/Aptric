import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Lock, Swords } from 'lucide-react';
import { ChallengeDialog } from '@/components/community/ChallengeDialog';
import { ChallengeRow } from '@/components/community/ChallengeRow';
import { UserListSkeleton } from '@/components/community/UserRow';
import { useNow } from '@/components/compete/time';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useChallenges, useChallengesEnabled, useEntitlements } from '@/lib/queries';
import type { ChallengeTab } from '@/lib/types';
import { cn } from '@/lib/utils';

const TABS: { value: ChallengeTab; label: string }[] = [
  { value: 'incoming', label: 'Incoming' },
  { value: 'outgoing', label: 'Outgoing' },
  { value: 'completed', label: 'Completed' },
];

const EMPTY: Record<ChallengeTab, { title: string; text: string }> = {
  incoming: { title: 'Nobody has challenged you', text: 'When a friend sends "beat my score", it shows up here.' },
  outgoing: { title: 'No open challenges', text: 'Challenge a friend to beat your score on a set.' },
  completed: { title: 'No finished challenges yet', text: 'Results, with a rematch button, land here.' },
};

/** Waits for the plan, then shows `children` only when challenges are on for the player. */
export const ChallengesGate = ({ children }: { children: ReactNode }) => {
  const ent = useEntitlements();
  const on = useChallengesEnabled();
  if (ent.isPending) return <Page className="max-w-2xl"><LoadingRegion className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-48" /></LoadingRegion></Page>;
  return on ? <>{children}</> : (
    <Page className="max-w-2xl"><EmptyState icon={<Lock />} title="Challenges are coming soon">Challenging friends to beat your score will be available to you shortly.</EmptyState></Page>
  );
};

const List = ({ tab }: { tab: ChallengeTab }) => {
  const query = useChallenges(tab);
  const now = useNow(30_000);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.isPending) return <Card><UserListSkeleton /></Card>;
  if (items.length === 0) return <EmptyState icon={<Swords />} title={EMPTY[tab].title}>{EMPTY[tab].text}</EmptyState>;
  return (
    <Card className="overflow-hidden">
      <ul aria-label={`${TABS.find((t) => t.value === tab)?.label} challenges`} className="divide-y">{items.map((c) => <ChallengeRow key={c.id} c={c} now={now} />)}</ul>
      {query.hasNextPage && (
        <div className="border-t p-2 text-center"><Button variant="ghost" size="sm" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Show more</Button></div>
      )}
    </Card>
  );
};

const Inner = () => {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const tab: ChallengeTab = TABS.some((t) => t.value === params.get('tab')) ? (params.get('tab') as ChallengeTab) : 'incoming';
  return (
    <Page className="max-w-2xl space-y-4">
      <PageHeader title="Challenges" description="Beat a friend's score on the same questions." actions={<Button onClick={() => setCreating(true)}><Swords /> New challenge</Button>} />
      <div role="radiogroup" aria-label="Which challenges" className="inline-flex max-w-full overflow-x-auto rounded-full bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.value} type="button" role="radio" aria-checked={tab === t.value}
            onClick={() => setParams(t.value === 'incoming' ? {} : { tab: t.value }, { replace: true })}
            className={cn('min-h-11 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors duration-200',
              tab === t.value ? 'bg-card text-accent-text shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <List tab={tab} />
      <ChallengeDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
};

/** /challenges */
const Challenges = () => <ChallengesGate><Inner /></ChallengesGate>;

export default Challenges;
