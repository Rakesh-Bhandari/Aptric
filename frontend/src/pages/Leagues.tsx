import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, Lock, Plus, ShieldCheck, Trophy, Users } from 'lucide-react';
import { CreateGroupDialog, JoinGroupDialog } from '@/components/community/GroupDialogs';
import { useJoinGroup } from '@/components/community/useJoinGroup';
import { UserListSkeleton } from '@/components/community/UserRow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { isCode, KIND_LABEL, memberText } from '@/lib/groups';
import { useEntitlements, useGroupsEnabled, useMyGroups } from '@/lib/queries';
import { LEAGUES_PATH, leagueHref } from '@/lib/routes';
import type { Group } from '@/lib/types';

/** Waits for the plan, then shows `children` only when private leagues are on for the player. */
export const GroupsGate = ({ children }: { children: ReactNode }) => {
  const ent = useEntitlements();
  const on = useGroupsEnabled();
  if (ent.isPending) return <Page className="max-w-2xl"><LoadingRegion className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-48" /></LoadingRegion></Page>;
  return on ? <>{children}</> : (
    <Page className="max-w-2xl"><EmptyState icon={<Lock />} title="Leagues are coming soon">Private leagues for your college or batch will be available to you shortly.</EmptyState></Page>
  );
};

export const GroupBadges = ({ g }: { g: Group }) => (
  <span className="flex flex-wrap items-center gap-1.5">
    <Badge variant="blue">{KIND_LABEL[g.kind]}</Badge>
    {g.verified && <Badge variant="success"><ShieldCheck aria-hidden /> Verified @{g.domain}</Badge>}
    {g.is_archived && <Badge variant="muted">Archived</Badge>}
    {g.my_status === 'pending' && <Badge variant="warning">Waiting for approval</Badge>}
    {g.my_role === 'owner' && <Badge variant="default">Owner</Badge>}
    {g.my_role === 'admin' && <Badge variant="default">Admin</Badge>}
  </span>
);

const Inner = () => {
  const groups = useMyGroups();
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const items = groups.data?.items ?? [];

  return (
    <Page className="max-w-2xl space-y-4">
      <PageHeader
        title="Leagues" description="Private groups for your college, batch or friends. Compete on the XP you already earn."
        actions={<>
          <Button variant="outline" onClick={() => setJoining(true)}><KeyRound /> Join with code</Button>
          <Button onClick={() => setCreating(true)}><Plus /> Start a league</Button>
        </>}
      />
      {groups.isError && <ErrorState error={groups.error} onRetry={() => void groups.refetch()} />}
      {groups.isPending && !groups.isError && <Card><UserListSkeleton rows={3} /></Card>}
      {groups.data && items.length === 0 && (
        <EmptyState
          icon={<Users />} title="You're not in a league yet"
          action={<Button variant="outline" onClick={() => setJoining(true)}><KeyRound /> Join with code</Button>}
        >
          Ask your college or coaching class for an invite link, or start one for your friends. Leagues are private: nobody can browse them.
        </EmptyState>
      )}
      {items.length > 0 && (
        <ul aria-label="Your leagues" className="space-y-3">
          {items.map((g) => (
            <li key={g.id}>
              <Card className="relative p-4 transition-shadow hover:shadow-md sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    <h2 className="truncate font-display text-lg font-extrabold text-heading">
                      {g.my_status === 'active'
                        ? <Link to={leagueHref(g.slug)} className="after:absolute after:inset-0 hover:underline">{g.name}</Link>
                        : g.name}
                    </h2>
                    <GroupBadges g={g} />
                  </div>
                  <Trophy className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{g.my_status === 'pending' ? 'An admin has to approve your request.' : memberText(g)}</p>
                {g.announcement && <p className="mt-2 line-clamp-2 text-sm text-heading">{g.announcement.body}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <JoinGroupDialog open={joining} onOpenChange={setJoining} />
      <CreateGroupDialog open={creating} onOpenChange={setCreating} />
    </Page>
  );
};

/** /leagues */
const Leagues = () => <GroupsGate><Inner /></GroupsGate>;

const JoinInner = () => {
  const [params] = useSearchParams();
  const join = useJoinGroup();
  const navigate = useNavigate();
  const code = (params.get('code') ?? '').toLowerCase();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!isCode(code)) {
    return <Page className="max-w-md"><EmptyState icon={<KeyRound />} title="That invite link looks wrong" action={<Button asChild><Link to={LEAGUES_PATH}>Go to Leagues</Link></Button>}>Ask the organiser to send it again.</EmptyState></Page>;
  }
  const go = async () => {
    setBusy(true);
    const r = await join(code);
    setBusy(false);
    if (!r || r.status === 'not_found') setFailed(true);
  };
  return (
    <Page className="max-w-md">
      <Card className="space-y-4 p-6 text-center">
        <Users className="mx-auto size-10 text-accent-text" aria-hidden />
        <h1 className="font-display text-xl font-extrabold text-heading">You've been invited to a private league</h1>
        <p className="text-sm text-muted-foreground">Joining shows your handle, level and weekly XP to the other members. You can leave any time.</p>
        {failed && <p role="alert" className="text-sm text-danger">That invite didn't work. It may have been replaced, or you may not be allowed in.</p>}
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="lg" onClick={() => void go()} loading={busy}>Join league</Button>
          <Button size="lg" variant="ghost" onClick={() => navigate(LEAGUES_PATH)}>Not now</Button>
        </div>
      </Card>
    </Page>
  );
};

/** /leagues/join?code=… */
export const JoinLeaguePage = () => <GroupsGate><JoinInner /></GroupsGate>;

export default Leagues;
