import { useState } from 'react';

export interface RadarAxis {
  label: string;
  /** 0–1 accuracy, or null when the player hasn't tried this section yet. */
  value: number | null;
  detail: string;
}

/**
 * Single-series radar of accuracy per section. Grid and axes are recessive;
 * points carry a hover/focus tooltip. Pair it with a table (see Progress).
 */
export const SkillRadar = ({ axes, size = 300 }: { axes: RadarAxis[]; size?: number }) => {
  const [active, setActive] = useState<number | null>(null);
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
      <svg viewBox={`${-gutter} 0 ${size + 2 * gutter} ${size}`} className="h-auto w-full overflow-visible" role="img"
        aria-label={`Accuracy by section: ${axes.map((a) => `${a.label} ${a.value == null ? 'not started' : `${Math.round(a.value * 100)}%`}`).join(', ')}`}
      >
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon key={ring} points={axes.map((_, i) => point(i, ring).join(',')).join(' ')}
            fill="none" stroke="var(--border)" strokeWidth={1} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, 1);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />;
        })}
        <polygon points={poly} fill="var(--primary)" fillOpacity={0.18} stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" />
        {axes.map((a, i) => {
          const [x, y] = point(i, a.value ?? 0);
          const [lx, ly] = point(i, 1.18);
          const anchor = Math.abs(lx - c) < 4 ? 'middle' : lx > c ? 'start' : 'end';
          return (
            <g key={a.label}>
              <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)">
                {a.label.length > 22 ? `${a.label.slice(0, 21)}…` : a.label}
              </text>
              {a.value != null && (
                <>
                  {/* Hit target larger than the mark. */}
                  <circle cx={x} cy={y} r={14} fill="transparent" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} />
                  <circle cx={x} cy={y} r={5} fill="var(--primary)" stroke="var(--card)" strokeWidth={2} pointerEvents="none" />
                </>
              )}
            </g>
          );
        })}
      </svg>
      {active != null && (
        <div role="tooltip" className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border bg-card px-3 py-1.5 text-xs shadow-md">
          <span className="font-semibold">{axes[active].label}</span>
          <span className="text-muted-foreground"> · {axes[active].detail}</span>
        </div>
      )}
    </div>
  );
};
