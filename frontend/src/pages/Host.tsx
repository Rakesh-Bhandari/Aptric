import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Lock, Plus, ShieldCheck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { formatDateTime, plural } from '@/lib/format';
import { hostBlockers, hostedLabel, quotaLeft, quotaText, VISIBILITY_SHORT } from '@/lib/hosting';
import { useContestsEnabled, useEntitlements, useHostHub } from '@/lib/queries';
import { HOST_PATH, hostContestHref } from '@/lib/routes';

/** Waits for the plan, then shows `children` only when hosting is on for the player. */
export const ContestsGate = ({ children }: { children: ReactNode }) => {
  const ent = useEntitlements();
  const on = useContestsEnabled();
  if (ent.isPending) return <Page className="max-w-3xl"><LoadingRegion className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-48" /></LoadingRegion></Page>;
  return on ? <>{children}</> : (
    <Page className="max-w-2xl"><EmptyState icon={<Lock />} title="Hosting is coming soon">Hosting your own contests will be available to you shortly.</EmptyState></Page>
  );
};

const Inner = () => {
  const hub = useHostHub();
  if (hub.isError) return <Page className="max-w-3xl"><ErrorState error={hub.error} onRetry={() => void hub.refetch()} /></Page>;
  if (!hub.data) return <Page className="max-w-3xl"><LoadingRegion className="space-y-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-28" /><Skeleton className="h-40" /></LoadingRegion></Page>;
  const { status, items } = hub.data;
  const blockers = hostBlockers(status);
  const left = quotaLeft(status.quota);
  const canCreate = status.ok && left > 0;

  return (
    <Page className="max-w-3xl space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2"><Link to="/compete?tab=contests"><ArrowLeft /> All contests</Link></Button>
      <PageHeader
        title="Host a contest"
        description="Pick questions from Aptric's verified bank, choose who can enter, and watch it run. Everyone plays by the same rules and the same clock."
        actions={canCreate ? <Button asChild><Link to={`${HOST_PATH}/new`}><Plus /> New contest</Link></Button> : undefined}
      />

      <Card className="space-y-3 p-4 sm:p-5">
        {status.ok ? (
          <p className="flex items-center gap-2 text-sm"><ShieldCheck className="size-5 text-success" aria-hidden /> You can host. <strong>{quotaText(status.quota)}</strong> ({left} left), up to {status.quota.max_participants} players each.</p>
        ) : (
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-heading">What you need to host</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            <p className="text-sm text-muted-foreground">Admins of a league can host for that league without these. <Link to="/leagues" className="font-semibold text-accent-text underline-offset-2 hover:underline">Open your leagues</Link></p>
          </div>
        )}
        {status.ok && left <= 0 && <p className="text-sm text-warning-soft-foreground">You have used this month's contests. They come back on the 1st.</p>}
      </Card>

      {items.length === 0
        ? <EmptyState icon={<CalendarClock />} title="No contests yet">Your drafts, scheduled and finished contests will show up here.</EmptyState>
        : (
          <ul aria-label="Your contests" className="space-y-3">
            {items.map((c) => (
              <li key={c.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <h2 className="text-base font-bold text-heading [overflow-wrap:anywhere]"><Link to={hostContestHref(c.id)} className="underline-offset-2 hover:underline">{c.title}</Link></h2>
                      <p className="text-sm text-muted-foreground">{formatDateTime(c.starts_at)} – {formatDateTime(c.ends_at)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={c.status === 'cancelled' || c.review_state === 'rejected' || c.hidden ? 'danger' : c.status === 'draft' ? 'muted' : c.review_state === 'pending' ? 'warning' : 'blue'}>{hostedLabel(c)}</Badge>
                      <Badge variant="muted">{VISIBILITY_SHORT[c.visibility]}</Badge>
                    </div>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="size-3.5" aria-hidden /> {plural(c.participants, 'player')} · {plural(c.question_count, 'question')}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
    </Page>
  );
};

/** /compete/host */
const Host = () => <ContestsGate><Inner /></ContestsGate>;

export default Host;
