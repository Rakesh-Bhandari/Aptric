import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatRelative } from '@/lib/format';
import type { ContestSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Upcoming: navy soft. Live: orange with a pulsing dot. Ended: muted.
 * `onDark` swaps the upcoming and ended styles for the navy contest header.
 */
export const ContestStateBadge = ({ c, onDark = false, className }: { c: Pick<ContestSummary, 'state' | 'starts_at'>; onDark?: boolean; className?: string }) => {
  if (c.state === 'live') {
    return (
      <Badge variant="solid" className={cn('uppercase tracking-wide', className)}>
        <span aria-hidden className="size-2 rounded-full bg-primary-foreground motion-safe:animate-breathe" />
        Live now
      </Badge>
    );
  }
  if (c.state === 'upcoming') {
    return (
      <Badge variant="navy" className={cn(onDark && 'bg-white/12 text-navy-foreground', className)}>
        <CalendarClock /> Starts {formatRelative(c.starts_at)}
      </Badge>
    );
  }
  return <Badge variant="muted" className={cn(onDark && 'bg-white/12 text-navy-muted-foreground', className)}><CheckCircle2 /> Ended</Badge>;
};
