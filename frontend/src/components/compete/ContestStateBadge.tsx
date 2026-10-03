import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatRelative } from '@/lib/format';
import type { ContestSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Upcoming: soft blue. Live: solid violet with a pulsing dot. Ended: muted.
 * `onDark` swaps the upcoming and ended styles for the navy contest header.
 */
export const ContestStateBadge = ({ c, onDark = false, className }: { c: Pick<ContestSummary, 'state' | 'starts_at'>; onDark?: boolean; className?: string }) => {
  if (c.state === 'live') {
    return (
      <Badge variant="violet" className={cn('uppercase tracking-wide shadow-sm', className)}>
        <span aria-hidden className="size-2 rounded-full bg-violet-foreground motion-safe:animate-breathe" />
        Live now
      </Badge>
    );
  }
  if (c.state === 'upcoming') {
    return (
      <Badge variant="blue" className={cn(onDark && 'bg-white/12 text-sky', className)}>
        <CalendarClock /> Starts {formatRelative(c.starts_at)}
      </Badge>
    );
  }
  return <Badge variant="muted" className={cn(onDark && 'bg-white/12 text-navy-muted-foreground', className)}><CheckCircle2 /> Ended</Badge>;
};
