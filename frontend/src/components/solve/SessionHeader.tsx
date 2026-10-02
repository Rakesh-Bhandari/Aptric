import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Where one question stands, for the segmented progress bar. */
export type SegmentState = 'pending' | 'current' | 'answered' | 'correct' | 'wrong';

/** The SolveScreen portals its timer into this element when it's on the page. */
export const SESSION_TIMER_SLOT = 'session-timer-slot';

// Past this many questions, segments get too thin to read: draw one continuous bar.
const MAX_SEGMENTS = 30;

const SEGMENT_CLASS: Record<SegmentState, string> = {
  pending: 'bg-muted',
  current: 'bg-primary bg-gradient-orange',
  answered: 'bg-primary bg-gradient-orange',
  correct: 'bg-success',
  // Half height as well as red, so a wrong answer doesn't rely on colour alone.
  wrong: 'h-1 self-center bg-danger',
};

/**
 * Slim sticky bar for a solving session: exit, one progress segment per
 * question, "3 / 10" and the question timer (rendered by SolveScreen).
 * `results` gives the state of earlier questions; without it they read as answered.
 */
export const SessionHeader = ({ title, index, total, onExit, exitLabel = 'Exit', results }: {
  title: string; index: number; total: number; onExit: () => void; exitLabel?: string; results?: SegmentState[];
}) => {
  const position = Math.min(index + 1, total);
  const states: SegmentState[] = Array.from({ length: total }, (_, i) =>
    results?.[i] ?? (i < index ? 'answered' : i === index ? 'current' : 'pending'));
  const right = states.filter((x) => x === 'correct').length;
  const wrong = states.filter((x) => x === 'wrong').length;
  const valueText = `Question ${position} of ${total}` + (right + wrong ? `, ${right} correct, ${wrong} wrong` : '');

  return (
    <header className="sticky top-0 z-30 border-b bg-card/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-2.5 px-2 sm:gap-3 sm:px-4">
        <Button variant="ghost" size="icon" onClick={onExit} aria-label={exitLabel} className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="size-5" />
        </Button>
        <h1 className="sr-only">{title}</h1>
        <div
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(index, total)}
          aria-valuetext={valueText}
          className="flex h-2 min-w-0 flex-1 gap-[3px]"
        >
          {total > MAX_SEGMENTS ? (
            <div className="h-full w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary bg-gradient-orange transition-[width] duration-300 ease-out" style={{ width: `${(position / total) * 100}%` }} />
            </div>
          ) : (
            states.map((s, i) => (
              <span
                key={i}
                className={cn(
                  'h-full flex-1 rounded-full transition-colors duration-200 ease-out',
                  SEGMENT_CLASS[s],
                  s === 'current' && 'ring-2 ring-primary/25',
                )}
              />
            ))
          )}
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-heading" aria-hidden>
          {position}<span className="font-normal text-muted-foreground"> / {total}</span>
        </span>
        <div id={SESSION_TIMER_SLOT} className="shrink-0 empty:hidden" />
      </div>
    </header>
  );
};
