import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, EyeOff, Flame, Lightbulb, MessageCircle, ThumbsUp } from 'lucide-react';
import { Markdown } from '@/components/markdown/Markdown';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { displayName, formatRelative } from '@/lib/format';
import { DIFFICULTY_LABEL } from '@/lib/game';
import { formatTimeLeft, isUrgent, KIND_LABEL, speakTimeLeft } from '@/lib/posts';
import { keys, queryClient, useReactAction } from '@/lib/queries';
import { practiceHref } from '@/lib/routes';
import type { Post, PostKind, Reaction } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PostMenu } from './PostMenu';
import { Replies } from './Replies';

const KIND_VARIANT: Record<PostKind, 'blue' | 'default' | 'success' | 'navy' | 'warning'> = {
  question: 'blue', tip: 'default', win: 'success', study_buddy: 'navy', poll: 'warning',
};

const REACTIONS: { value: Reaction; label: string; icon: typeof ThumbsUp }[] = [
  { value: 'up', label: 'Helpful', icon: ThumbsUp },
  { value: 'fire', label: 'Fire', icon: Flame },
  { value: 'idea', label: 'Good idea', icon: Lightbulb },
];

/**
 * "expires in 5h 12m". The line has a fixed height and a tabular, minimum-width figure so a changing
 * number never moves the card; it turns amber (and says so in words) under six hours.
 */
export const Countdown = ({ expiresAt, ms }: { expiresAt: string; ms: number }) => {
  const urgent = isUrgent(ms);
  return (
    <time
      dateTime={expiresAt} aria-label={speakTimeLeft(ms)}
      className={cn(
        'inline-flex h-6 min-w-[8.75rem] shrink-0 items-center justify-end gap-1 whitespace-nowrap text-xs tabular-nums',
        urgent ? 'rounded-full bg-warning-soft px-2 font-semibold text-warning-soft-foreground' : 'text-muted-foreground',
      )}
    >
      <Clock className="size-3.5" aria-hidden />
      <span aria-hidden>expires in {formatTimeLeft(ms)}</span>
    </time>
  );
};

const PollBlock = ({ post }: { post: Post }) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const poll = post.poll;
  if (!poll) return null;
  const total = poll.options.reduce((n, o) => n + o.votes, 0);
  const voted = poll.my_vote !== null;
  const vote = async (i: number) => {
    setBusy(true);
    try {
      const next = await api.votePoll(post.id, i);
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: keys.post(post.id) });
      return next;
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't save your vote."));
      return null;
    } finally {
      setBusy(false);
    }
  };
  return (
    <ul aria-label="Poll options" className="space-y-2">
      {poll.options.map((o, i) => {
        const pct = total ? Math.round((o.votes / total) * 100) : 0;
        return (
          <li key={i}>
            <button
              type="button" disabled={voted || busy} onClick={() => void vote(i)}
              aria-pressed={poll.my_vote === i}
              className={cn(
                'relative flex min-h-11 w-full items-center justify-between gap-3 overflow-hidden rounded-md border px-3 text-left text-sm font-medium transition-colors',
                poll.my_vote === i ? 'border-primary text-heading' : 'hover:border-primary/50',
                voted && 'cursor-default',
              )}
            >
              {voted && <span aria-hidden className="absolute inset-y-0 left-0 bg-primary-soft" style={{ width: `${pct}%` }} />}
              <span className="relative">{o.text}</span>
              {voted && <span className="relative tabular-nums text-muted-foreground">{pct}% · {o.votes}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

/** One post. `ms` is the time left on the server's clock; the page decides when it is gone. */
export const PostCard = memo(({ post, ms }: { post: Post; ms: number }) => {
  const [revealed, setRevealed] = useState(false);
  const [open, setOpen] = useState(false);
  const react = useReactAction(post);
  const toast = useToast();
  const name = displayName(post.author);
  const blurred = post.spoiler && !post.spoiler_locked && !revealed && !post.is_mine;

  const press = (r: Reaction) =>
    react.mutate(r, { onError: (err) => toast.error(friendlyError(err, "We couldn't save that reaction.")) });

  return (
    <Card className="p-4 sm:p-5" role="article" aria-label={`${KIND_LABEL[post.kind]} by ${name}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Avatar src={post.author.avatar_url} name={name} className="size-9" />
        <div className="min-w-0 flex-1 leading-tight">
          <Link to={`/u/${post.author.handle}`} className="block truncate font-semibold text-heading underline-offset-2 hover:underline">{name}</Link>
          <span className="text-xs text-muted-foreground">@{post.author.handle} · {formatRelative(post.created_at)}</span>
        </div>
        <Countdown expiresAt={post.expires_at} ms={ms} />
        <PostMenu post={post} />
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant={KIND_VARIANT[post.kind]}>{KIND_LABEL[post.kind]}</Badge>
        {post.topic && <Badge variant="muted">{post.topic.name}</Badge>}
        {post.exam_tag && <Badge variant="muted">{post.exam_tag.toUpperCase()}</Badge>}
        {post.spoiler && <Badge variant="warning"><EyeOff aria-hidden /> Spoiler</Badge>}
      </div>

      {post.is_mine && post.status === 'hidden' && (
        <p role="status" className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
          Only you can see this while a moderator reviews it.
        </p>
      )}

      <div className="mt-3 text-sm leading-relaxed text-card-foreground [overflow-wrap:anywhere]">
        {post.spoiler_locked ? (
          <p className="rounded-md border border-dashed bg-muted/50 px-3 py-3 text-muted-foreground">
            <EyeOff className="mr-1.5 inline size-4" aria-hidden />
            This post gives something away about a question. Try the question first to read it.
          </p>
        ) : blurred ? (
          <button
            type="button" onClick={() => setRevealed(true)}
            className="group relative block w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Spoiler. Tap to reveal this post."
          >
            <span aria-hidden className="block select-none blur-sm"><Markdown strict links={post.author_verified} text={post.body} /></span>
            <span className="absolute inset-0 grid place-items-center text-sm font-semibold text-heading">Spoiler · tap to reveal</span>
          </button>
        ) : (
          <Markdown strict links={post.author_verified} text={post.body} />
        )}
      </div>

      {post.poll && <div className="mt-3"><PollBlock post={post} /></div>}

      {post.question && (
        <div className="mt-3 rounded-md border bg-muted/40 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            About this question · {DIFFICULTY_LABEL[post.question.difficulty]}
          </p>
          <div className="line-clamp-3 text-sm"><Markdown text={post.question.stem} inline /></div>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link to={practiceHref({ subtopics: [post.question.subtopic_id], title: 'Practice' })}>
              {post.question.attempted ? 'Practise this topic' : 'Try it first'}
            </Link>
          </Button>
        </div>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="React" className="flex gap-1">
          {REACTIONS.map(({ value, label, icon: Icon }) => (
            <Button
              key={value} type="button" size="sm" variant={post.my_reaction === value ? 'secondary' : 'ghost'}
              aria-pressed={post.my_reaction === value} aria-label={label} onClick={() => press(value)}
            >
              <Icon aria-hidden />
            </Button>
          ))}
          <span className="inline-flex min-w-6 items-center text-sm tabular-nums text-muted-foreground" aria-label={`${post.like_count} reactions`}>
            {post.like_count}
          </span>
        </div>
        <Button
          type="button" size="sm" variant="ghost" className="ml-auto" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        >
          <MessageCircle aria-hidden /> {post.reply_count === 1 ? '1 reply' : `${post.reply_count} replies`}
        </Button>
      </footer>
      {open && <Replies post={post} />}
    </Card>
  );
});
PostCard.displayName = 'PostCard';
