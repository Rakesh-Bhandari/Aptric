import { formatDay, plural } from '@/lib/format';
import type { ActivityDay } from '@/lib/types';

// One hue, light → dark (sequential), on the primary ramp.
const STEPS = ['var(--muted)', 'color-mix(in oklab, var(--primary) 30%, var(--card))', 'color-mix(in oklab, var(--primary) 55%, var(--card))', 'color-mix(in oklab, var(--primary) 80%, var(--card))', 'var(--primary)'];

const level = (n: number, target: number) => (n === 0 ? 0 : n >= target ? 4 : n >= target * 0.66 ? 3 : n >= target * 0.33 ? 2 : 1);

/** Calendar of the last weeks: columns are weeks (Mon–Sun), cells are days. */
export const ActivityHeatmap = ({ days, target }: { days: ActivityDay[]; target: number }) => {
  if (days.length === 0) return null;
  const [y, m, d] = days[0].date.split('-').map(Number);
  const lead = (new Date(y, m - 1, d).getDay() + 6) % 7; // Monday = 0
  const cells: (ActivityDay | null)[] = [...Array<null>(lead).fill(null), ...days];
  const weeks: (ActivityDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const active = days.filter((x) => x.attempted > 0).length;

  return (
    <figure className="space-y-2">
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-[3px]" role="img" aria-label={`Activity over the last ${days.length} days: active on ${plural(active, 'day')}.`}>
          {weeks.map((w, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {Array.from({ length: 7 }, (_, di) => {
                const day = w[di];
                if (!day) return <span key={di} className="size-3.5" />;
                return (
                  <span
                    key={di}
                    title={`${formatDay(day.date)}: ${plural(day.attempted, 'question')}, ${day.correct} correct`}
                    className="size-3.5 rounded-[3px]"
                    style={{ background: STEPS[level(day.attempted, target)] }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        Less
        {STEPS.map((s, i) => <span key={i} className="size-3 rounded-[3px]" style={{ background: s }} aria-hidden />)}
        More <span className="sr-only">(darkest = daily goal of {target} reached)</span>
      </figcaption>
    </figure>
  );
};
