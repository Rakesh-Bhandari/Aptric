import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MasteryStars } from '@/components/ui/stars';
import { correctRatio, sessionStars } from '@/lib/game';
import { cn } from '@/lib/utils';

/** Where one question stands, for the segmented progress bar. */
export type SegmentState = 'pending' | 'current' | 'answered' | 'correct' | 'wrong';

/** The SolveScreen portals its timer into this element when it's on the page. */
export const SESSION_TIMER_SLOT = 'session-timer-slot';

// Past this many questions, segments get too thin to read: draw one continuous bar.
const MAX_SEGMENTS = 30;

const SEGMENT_CLASS: Record<SegmentState, string> = {
  pending: 'bg-muted',
  current: 'bg-primary bg-gradient-primary',
  answered: 'bg-primary bg-gradient-primary',
  correct: 'bg-success',
  // Half height as well as red, so a wrong answer doesn't rely on colour alone.
  wrong: 'h-1 self-center bg-danger',
};

/**
 * Slim sticky bar for a solving session: exit, one progress segment per
 * question, the count and the question timer (rendered by SolveScreen).
 * `results` gives the state of earlier questions. With it the fill, the count
 * and the stars show correct answers (attempted is a secondary label);
 * without it (no grading yet) earlier questions read as answered.
 */
export const SessionHeader = ({ title, index, total, onExit, exitLabel = 'Exit', results }: {
  title: string; index: number; total: number; onExit: () => void; exitLabel?: string; results?: SegmentState[];
}) => {
  const position = Math.min(index + 1, total);
  const graded = !!results;
  const states: SegmentState[] = Array.from({ length: total }, (_, i) =>
    results?.[i] ?? (graded ? (i === index ? 'current' : 'pending') : i < index ? 'answered' : i === index ? 'current' : 'pending'));
  const right = states.filter((x) => x === 'correct').length;
  const wrong = states.filter((x) => x === 'wrong').length;
  const attempted = states.filter((x) => x === 'correct' || x === 'wrong' || x === 'answered').length;
  const valueText = graded
    ? `${right} of ${total} correct, ${attempted} attempted`
    : `Question ${position} of ${total}` + (right + wrong ? `, ${right} correct, ${wrong} wrong` : '');

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
          aria-valuenow={graded ? right : Math.min(index, total)}
          aria-valuetext={valueText}
          className="flex h-2 min-w-0 flex-1 gap-[3px]"
        >
          {total > MAX_SEGMENTS ? (
            <div className="h-full w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary bg-gradient-primary transition-[width] duration-300 ease-out" style={{ width: `${(graded ? correctRatio(right, total) : position / total) * 100}%` }} />
            </div>
          ) : (
            states.map((s, i) => (
              <span
                key={i}
                className={cn(
                  'h-full flex-1 rounded-full transition-colors duration-200 ease-out',
                  SEGMENT_CLASS[s === 'current' && graded ? 'pending' : s],
                  s === 'current' && 'ring-2 ring-primary/25',
                )}
              />
            ))
          )}
        </div>
        {graded && <MasteryStars stars={sessionStars(right, total)} className="hidden shrink-0 min-[400px]:inline-flex" />}
        <span className="shrink-0 text-sm font-semibold tabular-nums text-heading" aria-hidden>
          {graded ? right : position}<span className="font-normal text-muted-foreground"> / {total}</span>
          {graded && <span className="ml-1.5 hidden text-xs font-normal text-muted-foreground sm:inline">· attempted {attempted} of {total}</span>}
        </span>
        <div id={SESSION_TIMER_SLOT} className="shrink-0 empty:hidden" />
      </div>
    </header>
  );
};
