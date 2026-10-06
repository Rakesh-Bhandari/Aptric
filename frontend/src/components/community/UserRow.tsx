import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { PlayerLink } from '@/components/compete/standings';
import { displayName, plural } from '@/lib/format';
import type { UserCard } from '@/lib/types';
import { cn } from '@/lib/utils';
import { FollowButton } from './FollowButton';

/** A person in a list: avatar and name (linked to their profile), level and streak, and a Follow button (or your own actions). */
export const UserRow = ({ user, children, className }: { user: UserCard; children?: ReactNode; className?: string }) => (
  <li className={cn('relative flex min-h-16 items-center gap-3 px-3 py-2.5 sm:px-4', className)}>
    <PlayerLink handle={user.handle} name={displayName(user)} avatar={user.avatar_url} />
    <span className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
      <span className="block">Level {user.level}</span>
      {user.current_streak > 0 && <span className="block">{plural(user.current_streak, 'day')} streak</span>}
    </span>
    {user.is_private && <span className="shrink-0 text-muted-foreground"><Lock className="size-4" aria-label="Private account" /></span>}
    {children ?? <FollowButton handle={user.handle} relationship={user.relationship} isPrivate={user.is_private} />}
  </li>
);

export const UserListSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <ul aria-hidden className="divide-y">
    {Array.from({ length: rows }, (_, i) => (
      <li key={i} className="flex min-h-16 items-center gap-3 px-4 py-2.5">
        <span className="size-9 rounded-full bg-border dark:bg-muted" />
        <span className="h-4 w-40 rounded bg-border dark:bg-muted" />
        <span className="ml-auto h-9 w-24 rounded-full bg-border dark:bg-muted" />
      </li>
    ))}
  </ul>
);
