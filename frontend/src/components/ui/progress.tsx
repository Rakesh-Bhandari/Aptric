import { useId } from 'react';
import { cn } from '@/lib/utils';

interface ProgressProps {
  value: number;
  max?: number;
  label: string;
  className?: string;
  /** Extra classes for the fill. It is the orange gradient by default; add `bg-none` with a `bg-*` colour to replace it. */
  barClassName?: string;
  /** Text read by screen readers instead of the percentage, e.g. "3 of 10". */
  valueText?: string;
}

export const Progress = ({ value, max = 100, label, className, barClassName, valueText }: ProgressProps) => {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={valueText}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn('h-full rounded-full bg-primary bg-gradient-orange transition-[width] duration-500 ease-out', barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

/** Circular progress for the daily target. Orange gradient stroke; green once complete. */
export const Ring = ({ value, max, size = 64, label, children }: { value: number; max: number; size?: number; label: string; children?: React.ReactNode }) => {
  const id = useId().replace(/:/g, '');
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--primary)' }} />
            <stop offset="1" style={{ stopColor: 'var(--orange-light)' }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct >= 1 ? 'var(--success)' : `url(#${id}-ring)`} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
};
