import { useLayoutEffect, useRef } from 'react';
import { formatDay, plural } from '@/lib/format';
import type { ActivityDay } from '@/lib/types';

// One hue, five steps (sequential): --muted for no activity, then the orange
// heat ramp, which darkens in light mode and brightens in dark (see index.css).
const STEPS = ['var(--muted)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)'];
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const MONTH = new Intl.DateTimeFormat(undefined, { month: 'short' });

const level = (n: number, target: number) => (n === 0 ? 0 : n >= target ? 4 : n >= target * 0.66 ? 3 : n >= target * 0.33 ? 2 : 1);
const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Calendar of the last weeks: columns are weeks (Mon–Sun), cells are days. */
export const ActivityHeatmap = ({ days, target }: { days: ActivityDay[]; target: number }) => {
  const scroller = useRef<HTMLDivElement>(null);
  // On narrow screens the grid scrolls inside its card; start at the latest week.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [days.length]);

  if (days.length === 0) return null;
  const lead = (parse(days[0].date).getDay() + 6) % 7; // Monday = 0
  const cells: (ActivityDay | null)[] = [...Array<null>(lead).fill(null), ...days];
  const weeks: (ActivityDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const active = days.filter((x) => x.attempted > 0).length;
  // Label the week that holds a month's 1st; the first column gets its month unless a label follows right after.
  const firstOfMonth = (w: (ActivityDay | null)[]) => w.find((d) => d && parse(d.date).getDate() === 1);
  const months = weeks.map((w, wi) => {
    const start = firstOfMonth(w);
    if (start) return MONTH.format(parse(start.date));
    if (wi === 0 && !weeks.slice(1, 3).some(firstOfMonth)) return MONTH.format(parse(w.find(Boolean)!.date));
    return '';
  });

  return (
    <figure className="space-y-3">
      <div ref={scroller} className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="inline-grid min-w-max grid-cols-[auto_1fr] gap-x-2" role="img"
          aria-label={`Activity over the last ${days.length} days: active on ${plural(active, 'day')}.`}
        >
          <span aria-hidden />
          <div className="flex gap-1 text-[11px] font-medium text-muted-foreground" aria-hidden>
            {months.map((m, i) => <span key={i} className="w-[18px] overflow-visible whitespace-nowrap sm:w-5">{m}</span>)}
          </div>
          <div className="grid grid-rows-7 gap-1 text-[11px] font-medium text-muted-foreground" aria-hidden>
            {DAY_LABELS.map((l, i) => <span key={i} className="flex h-[18px] items-center sm:h-5">{l}</span>)}
          </div>
          <div className="flex gap-1">
            {weeks.map((w, wi) => (
              <div key={wi} className="grid grid-rows-7 gap-1">
                {Array.from({ length: 7 }, (_, di) => {
                  const day = w[di];
                  if (!day) return <span key={di} className="size-[18px] sm:size-5" />;
                  return (
                    <span
                      key={di}
                      title={`${formatDay(day.date)}: ${day.attempted === 0 ? 'no questions' : `${plural(day.attempted, 'question')}, ${day.correct} correct`}`}
                      className="size-4 rounded-[4px] shadow-[inset_0_0_0_1px_rgb(11_31_75/0.05)] sm:size-[18px] dark:shadow-none"
                      style={{ background: STEPS[level(day.attempted, target)] }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Strongest colour: daily goal of {plural(target, 'question')} reached</span>
        <span className="flex items-center gap-1" aria-hidden>
          Less
          {STEPS.map((s, i) => <span key={i} className="size-3 rounded-[3px] shadow-[inset_0_0_0_1px_rgb(11_31_75/0.05)] dark:shadow-none" style={{ background: s }} />)}
          More
        </span>
      </figcaption>
    </figure>
  );
};
