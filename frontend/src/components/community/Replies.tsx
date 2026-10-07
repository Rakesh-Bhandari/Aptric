import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Markdown } from '@/components/markdown/Markdown';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FieldHint, Label, Textarea } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';
import { displayName, formatRelative } from '@/lib/format';
import { keys, queryClient, useReplies } from '@/lib/queries';
import type { Post } from '@/lib/types';

const refresh = (postId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.replies(postId) }),
    queryClient.invalidateQueries({ queryKey: ['feed'] }),
    queryClient.invalidateQueries({ queryKey: keys.post(postId) }),
  ]);

/** Flat replies under a post (one level). They expire with the post. */
export const Replies = ({ post }: { post: Post }) => {
  const replies = useReplies(post.id, true);
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = useId();
  const items = replies.data?.pages.flatMap((p) => p.items) ?? [];

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.createReply(post.id, text.trim());
      setText('');
      await refresh(post.id);
    } catch (err) {
      const code = errorCode(err);
      setError(['22023', '55000', 'SP422'].includes(code ?? '') ? (err as Error).message : friendlyError(err, "We couldn't send your reply."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (replyId: string) => {
    try {
      await api.deleteReply(replyId);
      await refresh(post.id);
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't delete that reply."));
    }
  };

  return (
    <section aria-label="Replies" className="mt-3 space-y-3 border-t pt-3">
      {replies.isError && <ErrorState error={replies.error} onRetry={() => void replies.refetch()} />}
      {replies.isPending && !replies.isError && <p role="status" className="text-sm text-muted-foreground">Loading replies…</p>}
      {replies.data && items.length === 0 && <p className="text-sm text-muted-foreground">No replies yet. Be the first.</p>}
      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="flex gap-2.5">
              <Avatar src={r.author.avatar_url} name={displayName(r.author)} className="size-7" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="leading-tight">
                  <Link to={`/u/${r.author.handle}`} className="font-semibold text-heading underline-offset-2 hover:underline">{displayName(r.author)}</Link>
                  <span className="ml-2 text-xs text-muted-foreground">{formatRelative(r.created_at)}</span>
                </p>
                <div className="[overflow-wrap:anywhere]"><Markdown strict text={r.body} /></div>
              </div>
              {r.can_delete && (
                <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0" aria-label="Delete reply" onClick={() => void remove(r.id)}>
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {replies.hasNextPage && (
        <Button variant="ghost" size="sm" loading={replies.isFetchingNextPage} onClick={() => void replies.fetchNextPage()}>Show more replies</Button>
      )}
      <form onSubmit={send} className="space-y-2">
        <Label htmlFor={id} className="sr-only">Write a reply</Label>
        <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} maxLength={280} placeholder="Write a reply (280 characters)" className="min-h-16" />
        <div className="flex items-center justify-between gap-3">
          <FieldHint error={Boolean(error)}>{error || `${text.length}/280 · Replies disappear with the post.`}</FieldHint>
          <Button type="submit" size="sm" loading={busy} disabled={!text.trim()}>Reply</Button>
        </div>
      </form>
    </section>
  );
};
