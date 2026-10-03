import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Label, Textarea } from '@/components/ui/input';
import { useToast } from '@/context/ToastContext';
import { reportQuestion, type ReportReason } from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'wrong_answer', label: 'Answer is wrong' },
  { value: 'ambiguous', label: 'Unclear or more than one answer' },
  { value: 'typo', label: 'Typo or formatting' },
  { value: 'duplicate', label: 'Seen it before' },
  { value: 'offensive', label: 'Offensive' },
  { value: 'other', label: 'Something else' },
];

export const ReportDialog = ({ questionId, open, onOpenChange }: { questionId: string; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const [reason, setReason] = useState<ReportReason>('wrong_answer');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const ids = { reason: useId(), details: useId() };
  const name = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await reportQuestion(questionId, reason, details.trim());
      toast.success('Thanks! Our team will take a look.');
      onOpenChange(false);
      setDetails('');
    } catch (err) {
      toast.error(errorCode(err) === '23505' ? "You've already reported this question. We're on it." : friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Report a problem" description="Tell us what's wrong and we'll fix it. You'll earn 25 XP if we accept your report.">
        <form className="space-y-4" onSubmit={submit}>
          <fieldset className="space-y-2">
            <legend id={ids.reason} className="mb-2 text-sm font-semibold text-heading">What's wrong?</legend>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((r) => {
                const checked = reason === r.value;
                return (
                  <label
                    key={r.value}
                    className={cn(
                      'relative inline-flex min-h-11 cursor-pointer select-none items-center rounded-full border-2 px-3.5 text-sm font-semibold transition-colors duration-150',
                      'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                      checked
                        ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                        : 'border-border bg-card text-foreground hover:border-hover-border',
                    )}
                  >
                    <input
                      type="radio"
                      name={name}
                      value={r.value}
                      checked={checked}
                      onChange={() => setReason(r.value)}
                      className="sr-only"
                    />
                    {r.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor={ids.details}>Details <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id={ids.details} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. The answer should be 42 because…" />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={busy} className="sm:min-w-36">Send report</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
