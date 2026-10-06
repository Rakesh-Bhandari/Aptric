import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Ban, Flag, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Label, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { invalidateSocial } from '@/lib/queries';
import { FRIENDS_PATH } from '@/lib/routes';
import type { UserReportReason } from '@/lib/types';

const REASONS: { value: UserReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'abuse', label: 'Abuse or harassment' },
  { value: 'impersonation', label: 'Pretending to be someone else' },
  { value: 'personal_info', label: 'Shares personal information' },
  { value: 'other', label: 'Something else' },
];

const ReportDialog = ({ handle, open, onOpenChange }: { handle: string; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const toast = useToast();
  const [reason, setReason] = useState<UserReportReason>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = { reason: useId(), details: useId() };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.reportUser(handle, reason, details);
      toast.success('Thanks. Our moderators will take a look. We never tell them who reported.');
      setDetails('');
      onOpenChange(false);
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't send your report."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Report @${handle}`} description="Moderators review every report. The person is not told who reported them.">
        <form className="space-y-4" onSubmit={send}>
          <div className="space-y-1.5">
            <Label htmlFor={ids.reason}>Reason</Label>
            <Select id={ids.reason} value={reason} onChange={(e) => setReason(e.target.value as UserReportReason)}>
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.details}>Anything we should know? (optional)</Label>
            <Textarea id={ids.details} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
            <FieldHint>{details.length}/500</FieldHint>
          </div>
          <div className="flex justify-end"><Button type="submit" loading={busy}>Send report</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** "…" menu on someone's profile: block (removes follows both ways, hides you from each other) and report. */
export const ProfileMenu = ({ handle }: { handle: string }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [reporting, setReporting] = useState(false);
  const item =
    'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-card-foreground outline-none transition-colors data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary-soft-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground data-[highlighted]:[&_svg]:text-current';

  const block = async () => {
    const ok = await toast.confirm({
      title: `Block @${handle}?`,
      message: "You will stop following each other, and neither of you will see the other on Aptric. You can unblock them in Settings.",
      confirmText: 'Block', danger: true,
    });
    if (!ok) return;
    try {
      await api.blockUser(handle);
      toast.success(`@${handle} is blocked.`);
      await invalidateSocial();
      navigate(FRIENDS_PATH, { replace: true });
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't block them."));
    }
  };

  return (
    <>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={`More actions for @${handle}`}><MoreHorizontal /></Button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content align="end" sideOffset={6} className="z-50 min-w-52 overflow-hidden rounded-2xl border bg-card p-1.5 shadow-lg motion-safe:animate-fade-in">
            <Dropdown.Item className={item} onSelect={() => setReporting(true)}><Flag /> Report @{handle}</Dropdown.Item>
            <Dropdown.Item className={item} onSelect={() => void block()}><Ban /> Block @{handle}</Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
      <ReportDialog handle={handle} open={reporting} onOpenChange={setReporting} />
    </>
  );
};
