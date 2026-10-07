import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Archive, Check, X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldHint, Input, Label, Select } from '@/components/ui/input';
import { SwitchRow } from '@/components/ui/switch-row';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';
import { displayName } from '@/lib/format';
import { JOIN_LABEL } from '@/lib/groups';
import { invalidateGroups, queryClient } from '@/lib/queries';
import { LEAGUES_PATH } from '@/lib/routes';
import type { Group, GroupJoinMode } from '@/lib/types';
import { UserListSkeleton } from './UserRow';

const say = (err: unknown, fallback: string) =>
  ['22023', '42501', '54000', '55000', 'P0002'].includes(errorCode(err) ?? '') ? (err as Error).message : friendlyError(err, fallback);

/** Organiser tools: settings and season, join requests, members and roles, archive. Scores cannot be edited here: none of these calls touch XP. */
export const LeagueAdmin = ({ g }: { g: Group }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const owner = g.my_role === 'owner';
  const [name, setName] = useState(g.name);
  const [mode, setMode] = useState<GroupJoinMode>(g.join_mode);
  const [domain, setDomain] = useState(g.domain ?? '');
  const [size, setSize] = useState(String(g.max_members));
  const [start, setStart] = useState(g.season_start ?? '');
  const [end, setEnd] = useState(g.season_end ?? '');
  const [weekly, setWeekly] = useState(g.weekly_reset);
  const [busy, setBusy] = useState(false);
  const requests = useQuery({ queryKey: ['group-extra', 'requests', g.id], queryFn: () => api.getGroupRequests(g.id) });
  const members = useQuery({ queryKey: ['group-extra', 'members', g.id], queryFn: () => api.getGroupMembers(g.id) });
  const refresh = () => Promise.all([invalidateGroups(), queryClient.invalidateQueries({ queryKey: ['group-extra'] })]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.updateGroup(g.id, {
        name: name.trim(), join_mode: mode, max_members: Number(size), weekly_reset: weekly,
        ...(mode === 'email_domain' ? { allowed_email_domain: domain.trim().toLowerCase() } : {}),
        ...(start && end ? { season_start: start, season_end: end } : {}),
      });
      await refresh();
      toast.success('Saved.');
    } catch (err) { toast.error(say(err, "We couldn't save that.")); } finally { setBusy(false); }
  };
  const clearSeason = async () => {
    try { await api.updateGroup(g.id, { clear_season: true }); setStart(''); setEnd(''); await refresh(); toast.success('Season cleared.'); } catch (err) { toast.error(say(err, "We couldn't clear it.")); }
  };
  const answer = async (handle: string, approve: boolean) => {
    try { await api.respondGroupRequest(g.id, handle, approve); await refresh(); } catch (err) { toast.error(say(err, "We couldn't answer that request.")); }
  };
  const remove = async (handle: string) => {
    const ok = await toast.confirm({ title: `Remove @${handle}?`, message: 'They leave the board at once and cannot rejoin with the code.', confirmText: 'Remove', danger: true });
    if (!ok) return;
    try { await api.removeGroupMember(g.id, handle); await refresh(); } catch (err) { toast.error(say(err, "We couldn't remove them.")); }
  };
  const role = async (handle: string, next: 'admin' | 'member') => {
    try { await api.setGroupMemberRole(g.id, handle, next); await refresh(); } catch (err) { toast.error(say(err, "We couldn't change the role.")); }
  };
  const archive = async () => {
    const ok = await toast.confirm({ title: `Archive ${g.name}?`, message: 'It becomes read-only: nobody can join, post notices or challenge through it. This cannot be undone.', confirmText: 'Archive', danger: true });
    if (!ok) return;
    try { await api.archiveGroup(g.id); await refresh(); toast.success('League archived.'); navigate(LEAGUES_PATH); } catch (err) { toast.error(say(err, "We couldn't archive it.")); }
  };

  const pending = requests.data?.items ?? [];
  const list = (members.data?.items ?? []).filter((m) => !m.relationship.is_me);

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-heading">Join requests ({pending.length})</h2>
          <Card><ul aria-label="Join requests" className="divide-y">
            {pending.map((r) => (
              <li key={r.handle} className="flex min-h-14 items-center gap-3 px-3 py-2">
                <Avatar src={r.avatar_url} name={displayName(r)} className="size-9" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-heading">@{r.handle}</span>
                <Button size="sm" onClick={() => void answer(r.handle, true)}><Check /> Approve<span className="sr-only"> @{r.handle}</span></Button>
                <Button size="sm" variant="outline" onClick={() => void answer(r.handle, false)}><X /> Decline<span className="sr-only"> @{r.handle}</span></Button>
              </li>
            ))}
          </ul></Card>
        </section>
      )}

      {!g.is_archived && (
        <form onSubmit={save} className="space-y-4">
          <h2 className="text-sm font-bold text-heading">Settings</h2>
          <div className="space-y-1.5"><Label htmlFor="lg-name">Name</Label><Input id="lg-name" value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={60} required /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lg-mode">Who can join</Label>
              <Select id="lg-mode" value={mode} onChange={(e) => setMode(e.target.value as GroupJoinMode)}>
                {(Object.keys(JOIN_LABEL) as GroupJoinMode[]).map((m) => <option key={m} value={m} disabled={m === 'email_domain' && !owner}>{JOIN_LABEL[m]}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="lg-size">Most members</Label><Input id="lg-size" type="number" min={2} max={300} value={size} onChange={(e) => setSize(e.target.value)} /></div>
          </div>
          {mode === 'email_domain' && (
            <div className="space-y-1.5"><Label htmlFor="lg-domain">Email domain</Label><Input id="lg-domain" value={domain} onChange={(e) => setDomain(e.target.value)} disabled={!owner} /><FieldHint>Only the owner can set this, with a verified email on the domain.</FieldHint></div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="lg-start">Season starts</Label><Input id="lg-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="lg-end">Season ends</Label><Input id="lg-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <SwitchRow label="Weekly reset" checked={weekly} onChange={setWeekly} hint="The board opens on this week's XP (it resets every Monday). Turn off to open on the season." />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy}>Save settings</Button>
            {g.season_start && <Button type="button" variant="ghost" onClick={() => void clearSeason()}>Clear season</Button>}
          </div>
        </form>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-heading">Members</h2>
        {members.isPending && <Card><UserListSkeleton rows={3} /></Card>}
        {members.data && list.length === 0 && <FieldHint>You're the only member so far.</FieldHint>}
        {list.length > 0 && (
          <Card><ul aria-label="Members" className="divide-y">
            {list.map((m) => (
              <li key={m.handle} className="flex min-h-14 flex-wrap items-center gap-2 px-3 py-2">
                <Avatar src={m.avatar_url} name={displayName(m)} className="size-9" />
                <span className="min-w-0 flex-1 truncate text-sm"><span className="font-semibold text-heading">@{m.handle}</span> <span className="text-xs text-muted-foreground">{m.role}</span></span>
                {owner && m.role !== 'owner' && !g.is_archived && (
                  <Button size="sm" variant="ghost" onClick={() => void role(m.handle, m.role === 'admin' ? 'member' : 'admin')}>{m.role === 'admin' ? 'Make member' : 'Make admin'}<span className="sr-only"> @{m.handle}</span></Button>
                )}
                {m.role !== 'owner' && (owner || m.role === 'member') && !g.is_archived && (
                  <Button size="sm" variant="outline" onClick={() => void remove(m.handle)}>Remove<span className="sr-only"> @{m.handle}</span></Button>
                )}
              </li>
            ))}
          </ul></Card>
        )}
        <p className="text-xs text-muted-foreground">Organisers see handles, ranks and XP. They never see anyone's answers, and nothing here can change a score.</p>
      </section>

      {owner && !g.is_archived && (
        <section className="space-y-2 border-t pt-4">
          <h2 className="text-sm font-bold text-heading">Archive</h2>
          <p className="text-sm text-muted-foreground">Closes the league for good. Members keep read-only access to the final board.</p>
          <Button variant="outline" onClick={() => void archive()}><Archive /> Archive league</Button>
        </section>
      )}
    </div>
  );
};
