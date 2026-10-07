import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Label + description on the left, a switch on the right. */
export const SwitchRow = ({ label, hint, checked, disabled, onChange }: {
  label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (next: boolean) => void;
}) => {
  const ids = { label: useId(), hint: useId() };
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/40 p-4">
      <div className="min-w-0 space-y-0.5">
        <p id={ids.label} className="text-sm font-semibold text-heading">{label}</p>
        <p id={ids.hint} className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <button
        type="button" role="switch" aria-checked={checked} aria-labelledby={ids.label} aria-describedby={ids.hint}
        disabled={disabled} onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 before:absolute before:-inset-2 before:content-[""] disabled:opacity-60',
          checked ? 'bg-primary bg-gradient-primary' : 'bg-input',
        )}
      >
        <span className={cn('inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200', checked ? 'translate-x-6' : 'translate-x-1')} />
      </button>
    </div>
  );
};

