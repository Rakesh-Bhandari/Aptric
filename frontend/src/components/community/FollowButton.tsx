import { Check, Clock, UserPlus } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useToast } from '@/context/ToastContext';
import { followLabel } from '@/lib/community';
import { friendlyError } from '@/lib/errors';
import { useFollowAction } from '@/lib/queries';
import type { Relationship } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Follow / Following / Requested / Follow back. Updates at once and rolls back with a toast
 * if the request fails. Following a private account sends a request; unfollowing one asks
 * first, because following again needs their approval.
 */
export const FollowButton = ({ handle, relationship, isPrivate = false, size = 'sm', className }: {
  handle: string; relationship: Relationship; isPrivate?: boolean; size?: ButtonProps['size']; className?: string;
}) => {
  const toast = useToast();
  const action = useFollowAction(handle, relationship, isPrivate);
  if (relationship.is_me) return null;

  const label = followLabel(relationship);
  const active = relationship.following || relationship.requested;
  const Icon = relationship.requested && !relationship.following ? Clock : active ? Check : UserPlus;

  const press = async () => {
    if (relationship.following && isPrivate) {
      const ok = await toast.confirm({
        title: `Unfollow @${handle}?`, message: 'Their account is private, so you would need to ask to follow again.',
        confirmText: 'Unfollow', danger: true,
      });
      if (!ok) return;
    }
    action.mutate(undefined, {
      onSuccess: (status) => { if (status === 'requested') toast.info(`Request sent. @${handle} will see it.`); },
      onError: (err) => toast.error(friendlyError(err, "We couldn't update that. Please try again.")),
    });
  };

  return (
    <Button
      type="button" size={size} variant={active ? 'outline' : 'default'} aria-pressed={active}
      disabled={action.isPending} onClick={() => void press()}
      className={cn('relative z-10 min-w-28', className)}
    >
      <Icon aria-hidden /> {label}<span className="sr-only"> @{handle}</span>
    </Button>
  );
};
