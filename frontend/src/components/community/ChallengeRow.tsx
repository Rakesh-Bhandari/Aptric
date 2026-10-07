import { Link } from 'react-router-dom';
import { ChevronRight, Swords } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatTarget, headline, outcomeFor, timeToAct } from '@/lib/challenges';
import { displayName, formatRelative } from '@/lib/format';
import { clockSkew, formatTimeLeft } from '@/lib/posts';
import { challengeHref } from '@/lib/routes';
import type { Challenge } from '@/lib/types';

/** One challenge in a list: who, what is at stake, and how long is left. */
export const ChallengeRow = ({ c, now }: { c: Challenge; now: number }) => {
  const them = c.role === 'challenger' ? c.opponent : c.challenger;
  const left = timeToAct(c, now, clockSkew(c.server_now, now));
  const outcome = outcomeFor(c);
  return (
    <li className="relative flex min-h-16 items-center gap-3 px-3 py-2.5 sm:px-4">
      {them ? <Avatar src={them.avatar_url} name={displayName(them)} className="size-9" /> : <span className="grid size-9 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground"><Swords className="size-4" aria-hidden /></span>}
      <div className="min-w-0 flex-1 leading-tight">
        <Link to={challengeHref(c.id)} className="block truncate font-semibold text-heading after:absolute after:inset-0 hover:underline">{headline(c)}</Link>
        <span className="block truncate text-xs text-muted-foreground">
          {c.target ? `Target ${formatTarget(c.target.score, c.target.total, c.target.time_ms)} · ` : ''}{formatRelative(c.created_at)}
        </span>
      </div>
      {outcome && <Badge variant={outcome === 'won' ? 'success' : outcome === 'lost' ? 'danger' : 'muted'}>{outcome === 'won' ? 'Won' : outcome === 'lost' ? 'Lost' : 'Draw'}</Badge>}
      {left !== null && left > 0 && <Badge variant={left < 6 * 3_600_000 ? 'warning' : 'muted'}>{formatTimeLeft(left)} left</Badge>}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </li>
  );
};
