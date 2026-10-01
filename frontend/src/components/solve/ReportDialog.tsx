import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Label, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/context/ToastContext';
import { reportQuestion, type ReportReason } from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'wrong_answer', label: 'The answer is wrong' },
  { value: 'ambiguous', label: "It's unclear or has more than one answer" },
  { value: 'typo', label: 'Typo or formatting problem' },
  { value: 'duplicate', label: "I've seen this question before" },
  { value: 'offensive', label: "It's offensive" },
  { value: 'other', label: 'Something else' },
];

export const ReportDialog = ({ questionId, open, onOpenChange }: { questionId: string; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const [reason, setReason] = useState<ReportReason>('wrong_answer');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const ids = { reason: useId(), details: useId() };

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
          <div className="space-y-1.5">
            <Label htmlFor={ids.reason}>What's wrong?</Label>
            <Select id={ids.reason} value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.details}>Details <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id={ids.details} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. The answer should be 42 because…" />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Send report</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
