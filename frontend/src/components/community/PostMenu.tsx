import { useId, useState, type FormEvent } from 'react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Ban, Flag, MoreHorizontal, Trash2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Label, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { dropPost, invalidateFeeds, invalidateSocial, keys, queryClient } from '@/lib/queries';
import type { Post, PostReportReason } from '@/lib/types';

const REASONS: { value: PostReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'abuse', label: 'Abuse or harassment' },
  { value: 'answer_leak', label: 'Gives away an answer' },
  { value: 'personal_info', label: 'Shares personal information' },
  { value: 'other', label: 'Something else' },
];

const ReportPostDialog = ({ post, open, onOpenChange }: { post: Post; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const toast = useToast();
  const [reason, setReason] = useState<PostReportReason>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = { reason: useId(), details: useId() };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.reportPost(post.id, reason, details);
      toast.success('Thanks. Moderators will look at it. Posts with several reports are hidden until then.');
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
      <DialogContent title="Report this post" description="The author is not told who reported it.">
        <form className="space-y-4" onSubmit={send}>
          <div className="space-y-1.5">
            <Label htmlFor={ids.reason}>Reason</Label>
            <Select id={ids.reason} value={reason} onChange={(e) => setReason(e.target.value as PostReportReason)}>
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.details}>Anything we should know? (optional)</Label>
            <Textarea id={ids.details} maxLength={300} value={details} onChange={(e) => setDetails(e.target.value)} />
            <FieldHint>{details.length}/300</FieldHint>
          </div>
          <div className="flex justify-end"><Button type="submit" loading={busy}>Send report</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** "…" on a post: delete your own early; report, mute or block someone else's author. */
export const PostMenu = ({ post }: { post: Post }) => {
  const toast = useToast();
  const [reporting, setReporting] = useState(false);
  const handle = post.author.handle;
  const item =
    'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-card-foreground outline-none transition-colors data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary-soft-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground data-[highlighted]:[&_svg]:text-current';

  const remove = async () => {
    const ok = await toast.confirm({ title: 'Delete this post?', message: 'It disappears for everyone right away. This cannot be undone.', confirmText: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api.deletePost(post.id);
      dropPost(post.id);
      toast.success('Post deleted.');
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't delete it."));
    }
  };
  const mute = async () => {
    try {
      await api.muteUser(handle);
      toast.success(`You won't see @${handle}'s posts. Unmute them in Settings.`);
      await invalidateFeeds();
      void queryClient.invalidateQueries({ queryKey: keys.mutes });
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't mute them."));
    }
  };
  const block = async () => {
    const ok = await toast.confirm({
      title: `Block @${handle}?`, message: 'You will stop following each other and neither of you will see the other on Aptric.', confirmText: 'Block', danger: true,
    });
    if (!ok) return;
    try {
      await api.blockUser(handle);
      toast.success(`@${handle} is blocked.`);
      await Promise.all([invalidateFeeds(), invalidateSocial()]);
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't block them."));
    }
  };

  return (
    <>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <Button variant="ghost" size="icon" className="-mr-2" aria-label="More actions for this post"><MoreHorizontal /></Button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content align="end" sideOffset={6} className="z-50 min-w-52 overflow-hidden rounded-2xl border bg-card p-1.5 shadow-lg motion-safe:animate-fade-in">
            {post.is_mine ? (
              <Dropdown.Item className={item} onSelect={() => void remove()}><Trash2 /> Delete post</Dropdown.Item>
            ) : (
              <>
                <Dropdown.Item className={item} onSelect={() => setReporting(true)}><Flag /> Report post</Dropdown.Item>
                <Dropdown.Item className={item} onSelect={() => void mute()}><VolumeX /> Mute @{handle}</Dropdown.Item>
                <Dropdown.Item className={item} onSelect={() => void block()}><Ban /> Block @{handle}</Dropdown.Item>
              </>
            )}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
      <ReportPostDialog post={post} open={reporting} onOpenChange={setReporting} />
    </>
  );
};
