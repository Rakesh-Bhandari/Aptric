import { cn } from '@/lib/utils';

export type Scope = 'all' | 'friends';

/** "Everyone | Friends": the Friends filter on boards and standings (the people you follow, plus you). */
export const ScopeSwitch = ({ value, onChange, label }: { value: Scope; onChange: (s: Scope) => void; label: string }) => (
  <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-muted p-1">
    {([['all', 'Everyone'], ['friends', 'Friends']] as const).map(([v, text]) => (
      <button
        key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
        className={cn(
          'min-h-11 rounded-full px-4 text-sm font-semibold transition-colors duration-200',
          value === v ? 'bg-card text-accent-text shadow-sm' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {text}
      </button>
    ))}
  </div>
);
