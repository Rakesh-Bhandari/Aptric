import { useEffect, useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, KeyRound, Plus, RefreshCw, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Input, Label, Select } from '@/components/ui/input';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { groupMessage as message, useJoinGroup } from './useJoinGroup';
import { codeFromInput, isCode, JOIN_LABEL, KIND_LABEL } from '@/lib/groups';
import { invalidateGroups } from '@/lib/queries';
import { inviteHref, leagueHref } from '@/lib/routes';
import type { GroupJoinMode, GroupKind } from '@/lib/types';

/** "Join with code": paste the code or the whole link. */
export const JoinGroupDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const join = useJoinGroup();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const id = useId();
  const code = codeFromInput(text);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isCode(code)) return;
    setBusy(true);
    const r = await join(code);
    setBusy(false);
    if (r && r.status !== 'not_found') { onOpenChange(false); setText(''); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Join a league" description="Leagues are private: you need the invite code or link from an organiser.">
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor={id}>Invite code or link</Label>
            <Input id={id} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="abcd23efgh" />
            <FieldHint>{text && !isCode(code) ? 'A code is 10 letters and numbers.' : 'You can paste the whole link.'}</FieldHint>
          </div>
          <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!isCode(code)}><KeyRound /> Join</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** Start a league (needs a verified email). */
export const CreateGroupDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>('batch');
  const [mode, setMode] = useState<GroupJoinMode>('invite_code');
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ids = { name: useId(), kind: useId(), mode: useId(), domain: useId() };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const g = await api.createGroup({
        name: name.trim(), kind, join_mode: mode, ...(mode === 'email_domain' ? { allowed_email_domain: domain.trim().toLowerCase() } : {}),
      });
      await invalidateGroups();
      onOpenChange(false);
      navigate(leagueHref(g.slug));
    } catch (err) {
      setError(message(err, "We couldn't create the league."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Start a league" description="A private group on top of the XP everyone already earns. Only people with your invite can see it.">
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor={ids.name}>Name</Label>
            <Input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} minLength={3} maxLength={60} required placeholder="IIT-X 2026 batch" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ids.kind}>Type</Label>
              <Select id={ids.kind} value={kind} onChange={(e) => setKind(e.target.value as GroupKind)}>
                {(Object.keys(KIND_LABEL) as GroupKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.mode}>Who can join</Label>
              <Select id={ids.mode} value={mode} onChange={(e) => setMode(e.target.value as GroupJoinMode)}>
                {(Object.keys(JOIN_LABEL) as GroupJoinMode[]).map((m) => <option key={m} value={m}>{JOIN_LABEL[m]}</option>)}
              </Select>
            </div>
          </div>
          {mode === 'email_domain' && (
            <div className="space-y-1.5">
              <Label htmlFor={ids.domain}>Email domain</Label>
              <Input id={ids.domain} value={domain} onChange={(e) => setDomain(e.target.value)} required placeholder="iitx.ac.in" autoCapitalize="none" />
              <FieldHint>Members must have a verified email on this domain, so the league really is that college. You need one too.</FieldHint>
            </div>
          )}
          {error && <FieldHint error>{error}</FieldHint>}
          <div className="flex justify-end"><Button type="submit" loading={busy} disabled={name.trim().length < 3}><Plus /> Create league</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** Invite sheet for organisers: the link and code, copy and share, and a new code that ends the old link. */
export const InviteDialog = ({ groupId, name, open, onOpenChange }: { groupId: string; name: string; open: boolean; onOpenChange: (open: boolean) => void }) => {
  const toast = useToast();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    api.getGroupInvite(groupId).then((r) => setCode(r.code)).catch((err) => toast.error(message(err, "We couldn't load the invite.")));
  }, [open, groupId, toast]);
  const link = code ? inviteHref(code) : '';

  const rotate = async () => {
    const ok = await toast.confirm({ title: 'Make a new invite?', message: 'The current link and code stop working at once. People already in stay in.', confirmText: 'New invite', danger: true });
    if (!ok) return;
    setBusy(true);
    try { setCode((await api.rotateGroupCode(groupId)).code); toast.success('New invite ready.'); } catch (err) { toast.error(message(err, "We couldn't change the code.")); } finally { setBusy(false); }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: name, text: `Join ${name} on Aptric`, url: link });
      else { await navigator.clipboard.writeText(link); toast.success('Link copied.'); }
    } catch { /* share sheet dismissed */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Invite people" description={`Anyone with this link can ask to join ${name}.`}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-link">Link</Label>
            <div className="flex gap-2">
              <Input id="invite-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="icon" aria-label="Copy link" disabled={!code} onClick={() => { void navigator.clipboard?.writeText(link).then(() => toast.success('Link copied.')); }}><Copy /></Button>
              <Button size="icon" aria-label="Share" disabled={!code} onClick={() => void share()}><Share2 /></Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Code: <strong className="font-mono tracking-wider text-heading">{code ?? '…'}</strong></p>
          <Button variant="outline" size="sm" onClick={() => void rotate()} loading={busy}><RefreshCw /> Make a new code</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
