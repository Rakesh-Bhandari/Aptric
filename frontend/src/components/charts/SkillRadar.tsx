import { useId, useState } from 'react';

export interface RadarAxis {
  label: string;
  /** 0–1 accuracy, or null when the player hasn't tried this section yet. */
  value: number | null;
  detail: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Single-series radar of accuracy per section. Grid and axes are recessive
 * (Border), labels muted; the polygon is the one coloured mark: a blue
 * --chart-accent stroke over a low-opacity violet --chart-fill wash. Points take hover and keyboard focus for a tooltip and
 * carry <title>s. Pair it with a table (see Progress).
 */
export const SkillRadar = ({ axes, size = 300 }: { axes: RadarAxis[]; size?: number }) => {
  const [active, setActive] = useState<number | null>(null);
  const tipId = useId();
  const n = axes.length;
  if (n < 3) return null;
  const pad = 50;
  const gutter = 70; // room for labels left and right
  const c = size / 2;
  const r = c - pad;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i: number, v: number) => [c + Math.cos(angle(i)) * r * v, c + Math.sin(angle(i)) * r * v] as const;
  const poly = axes.map((a, i) => point(i, a.value ?? 0).join(',')).join(' ');

  return (
    <div className="relative mx-auto w-full max-w-[28rem]">
      <svg viewBox={`${-gutter} 0 ${size + 2 * gutter} ${size}`} className="h-auto w-full overflow-visible" role="group"
        aria-label={`Accuracy by section: ${axes.map((a) => `${a.label} ${a.value == null ? 'not started' : pct(a.value)}`).join(', ')}`}
      >
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon key={ring} points={axes.map((_, i) => point(i, ring).join(',')).join(' ')}
            fill={ring === 1 ? 'var(--muted)' : 'none'} fillOpacity={ring === 1 ? 0.45 : undefined}
            stroke="var(--border)" strokeWidth={1} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, 1);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />;
        })}
        {/* Ring scale on the first axis, so 50% and 100% can be read off. */}
        {[0.5, 1].map((ring) => {
          const [x, y] = point(0, ring);
          return <text key={ring} x={x + 4} y={y + 3} fontSize={9} fill="var(--muted-foreground)" aria-hidden>{pct(ring)}</text>;
        })}
        <polygon points={poly} fill="var(--chart-fill)" fillOpacity={0.14} stroke="var(--chart-accent)" strokeWidth={2} strokeLinejoin="round" />
        {axes.map((a, i) => {
          const [x, y] = point(i, a.value ?? 0);
          const [lx, ly] = point(i, 1.18);
          const anchor = Math.abs(lx - c) < 4 ? 'middle' : lx > c ? 'start' : 'end';
          return (
            <g key={a.label}>
              <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize={11} fontWeight={600} fill="var(--muted-foreground)">
                {a.label.length > 22 ? `${a.label.slice(0, 21)}…` : a.label}
              </text>
              {a.value != null && (
                <g
                  tabIndex={0}
                  role="img"
                  aria-label={`${a.label}: ${a.detail}`}
                  aria-describedby={active === i ? tipId : undefined}
                  className="cursor-default focus-visible:outline-none [&:focus-visible>circle:last-child]:stroke-ring"
                  onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                >
                  <title>{`${a.label}: ${a.detail}`}</title>
                  {/* Hit target larger than the mark. */}
                  <circle cx={x} cy={y} r={14} fill="transparent" />
                  <circle cx={x} cy={y} r={active === i ? 6.5 : 5} fill="var(--chart-accent)" stroke="var(--card)" strokeWidth={2} pointerEvents="none" />
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {active != null && (
        <div id={tipId} role="tooltip" className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap rounded-full border bg-card px-3 py-1.5 text-xs shadow-md">
          <span className="font-semibold text-heading">{axes[active].label}</span>
          <span className="text-muted-foreground"> · {axes[active].detail}</span>
        </div>
      )}
    </div>
  );
};
