import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Crown } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/*
 * Shared pieces for ranked lists: the weekly league, leaderboards and contest
 * standings all use the same row so they read as one system.
 */

const MEDAL = ['bg-medal-gold', 'bg-medal-silver', 'bg-medal-bronze'];
const PLACE = ['1st', '2nd', '3rd'];

/** Rank number; 1st, 2nd and 3rd get gold, silver and bronze medals. */
export const RankBadge = ({ rank, className }: { rank: number; className?: string }) => (
  <span
    className={cn(
      'grid size-8 shrink-0 place-items-center rounded-full text-sm font-extrabold tabular-nums',
      rank <= 3 ? cn(MEDAL[rank - 1], 'text-medal-foreground shadow-sm ring-2 ring-white/60 dark:ring-white/15') : 'text-muted-foreground',
      className,
    )}
  >
    {rank === 1 ? <Crown className="size-4" aria-label={PLACE[0]} /> : rank <= 3 ? <span aria-label={PLACE[rank - 1]}>{rank}</span> : rank}
  </span>
);

/** Avatar plus name (linked to the public profile), with the @handle muted underneath. */
export const PlayerLink = ({ handle, name, avatar, showHandle = true }: { handle: string | null; name: string; avatar: string | null; showHandle?: boolean }) => (
  <span className="flex min-w-0 flex-1 items-center gap-2.5">
    <Avatar src={avatar} name={name} className="size-9" />
    <span className="min-w-0 leading-tight">
      {handle ? (
        <Link to={`/u/${handle}`} className="block truncate font-semibold text-heading underline-offset-2 after:absolute after:inset-0 hover:underline">{name}</Link>
      ) : <span className="block truncate font-semibold text-heading">{name}</span>}
      {showHandle && handle && name !== `@${handle}` && <span className="block truncate text-xs text-muted-foreground">@{handle}</span>}
    </span>
  </span>
);

export type Zone = 'promote' | 'demote' | 'safe';

/**
 * One ranked row. Your own row gets the soft-orange fill and an orange bar on
 * the left; promotion and demotion rows get a faint success or danger tint.
 */
export const StandingRow = ({ rank, me, zone = 'safe', player, children, className }: {
  rank: number; me?: boolean; zone?: Zone; player: ReactNode; children?: ReactNode; className?: string;
}) => (
  <li
    className={cn(
      'relative flex min-h-14 items-center gap-3 px-3 py-2 sm:px-4',
      zone === 'promote' && 'bg-success-soft/45',
      zone === 'demote' && 'bg-danger-soft/45',
      me && 'bg-primary-soft before:absolute before:inset-y-0 before:left-0 before:w-1 before:rounded-r-full before:bg-primary',
      className,
    )}
    aria-current={me ? 'true' : undefined}
  >
    <RankBadge rank={rank} />
    {player}
    {me && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-primary-foreground">You</span>}
    {zone !== 'safe' && <span className="sr-only">{zone === 'promote' ? 'Promotion zone' : 'Demotion zone'}</span>}
    <span className="ml-auto shrink-0 text-right text-sm">{children}</span>
  </li>
);

/** Small label row that opens the promotion or demotion block. */
export const ZoneDivider = ({ zone, count }: { zone: 'promote' | 'demote'; count: number }) => (
  <li
    className={cn(
      'flex items-center gap-2 px-3 py-1.5 text-[0.7rem] font-bold uppercase tracking-wider sm:px-4',
      zone === 'promote' ? 'bg-success-soft text-success-soft-foreground' : 'bg-danger-soft text-danger-soft-foreground',
    )}
  >
    {zone === 'promote' ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />}
    {zone === 'promote' ? 'Promotion' : 'Demotion'}
    <span className="font-semibold normal-case tracking-normal opacity-80">· {zone === 'promote' ? `top ${count} move up` : `bottom ${count} move down`}</span>
  </li>
);

/** Orange dot with a soft pulse; the pulse stops under reduced motion. */
export const LiveDot = ({ className }: { className?: string }) => (
  <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full bg-primary motion-safe:animate-pulse-ring', className)} />
);

/** "Live · updates every 20s" next to auto-refreshing lists. */
export const LiveIndicator = ({ every }: { every: string }) => (
  <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
    <LiveDot />
    <span><span className="font-bold text-heading">Live</span> · updates every {every}</span>
  </span>
);
