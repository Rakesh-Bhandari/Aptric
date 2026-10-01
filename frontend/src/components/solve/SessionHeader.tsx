import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

/** Top bar of a solving session: exit, title, "3 of 10" progress. */
export const SessionHeader = ({ title, index, total, onExit, exitLabel = 'Exit' }: {
  title: string; index: number; total: number; onExit: () => void; exitLabel?: string;
}) => (
  <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
    <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2 sm:px-6">
      <Button variant="ghost" size="icon" onClick={onExit} aria-label={exitLabel} className="-ml-2">
        <X className="size-5" />
      </Button>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="truncate text-sm font-semibold">{title}</h1>
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {Math.min(index + 1, total)} of {total}
          </span>
        </div>
        <Progress value={index} max={total} label="Session progress" valueText={`Question ${Math.min(index + 1, total)} of ${total}`} />
      </div>
    </div>
  </header>
);
