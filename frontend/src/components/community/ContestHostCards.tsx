import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Flag, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Label, Select, Textarea } from '@/components/ui/input';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';
import { formatClock, plural } from '@/lib/format';
import { REPORT_LABEL } from '@/lib/hosting';
import { contestShareHref, hostContestHref } from '@/lib/routes';
import type { ContestDetail, ContestReportReason } from '@/lib/types';

/** Copy the link people use to reach a contest (unlisted contests are reached only by it). */
export const CopyLinkButton = ({ id, variant = 'outline' }: { id: string; variant?: 'outline' | 'ghost' | 'secondary' }) => {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(contestShareHref(id));
      toast.success('Link copied.');
    } catch {
      toast.error('Copy the address from the browser bar instead.');
    }
  };
  return <Button type="button" variant={variant} size="sm" onClick={() => void copy()}><Copy /> Copy link</Button>;
};

/**
 * What the host sees on their own contest page: how many registered, started and finished while it runs; after the end,
 * the average and the hardest question. Never anyone's answers, never the key before the end.
 */
export const HostPanel = ({ c, manage = true }: { c: Pick<ContestDetail, 'id' | 'state' | 'is_host' | 'dashboard'>; manage?: boolean }) => {
  const d = c.dashboard;
  if (!c.is_host || !d) return null;
  const ended = c.state === 'ended';
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><Settings2 className="size-5 text-muted-foreground" aria-hidden /> You host this contest</CardTitle>
          <div className="flex gap-2">
            <CopyLinkButton id={c.id} />
            {manage && <Button asChild size="sm" variant="secondary"><Link to={hostContestHref(c.id)}>Manage</Link></Button>}
          </div>
        </div>
        <CardDescription>
          {ended ? 'A summary of how it went. Individual answers stay private.' : 'You see counts, not answers, until it ends.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Participation">
          {([['Registered', d.registrations], ['Started', d.started], ['Finished', d.finished], ...(d.active_now !== null ? [['Answering now', d.active_now]] : [])] as [string, number][]).map(([label, value]) => (
            <div key={label} className="rounded-md bg-muted px-3 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-display text-2xl font-extrabold tabular-nums text-heading">{value}{label === 'Registered' && d.capacity ? <span className="text-sm font-semibold text-muted-foreground"> / {d.capacity}</span> : null}</dd>
            </div>
          ))}
        </dl>
        {ended && (
          <div className="space-y-2 text-sm">
            <p>Average score <strong>{d.average_score ?? '–'}</strong> · average time <strong>{d.average_time_ms ? formatClock(Number(d.average_time_ms)) : '–'}</strong></p>
            {d.hardest && <p>Hardest question: <strong>#{d.hardest.position + 1}</strong> ({d.hardest.accuracy}% right of {plural(d.hardest.answers, 'answer')}).</p>}
            {d.questions && d.questions.length > 0 && (
              <ol className="space-y-1" aria-label="Accuracy by question">
                {d.questions.map((q) => (
                  <li key={q.question_id} className="flex items-center gap-2">
                    <span className="w-6 text-right tabular-nums text-muted-foreground">{q.position + 1}.</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full bg-primary" style={{ width: `${q.accuracy ?? 0}%` }} /></span>
                    <span className="w-12 text-right tabular-nums">{q.accuracy ?? '–'}%</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/** Report a hosted contest: three people reporting it hides it until a moderator looks. The answer is the same whatever happens. */
export const ReportContestDialog = ({ id, open, onOpenChange }: { id: string; open: boolean; onOpenChange: (open: boolean) => void }) => {
  const toast = useToast();
  const [reason, setReason] = useState<ContestReportReason>('spam');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = { reason: useId(), detail: useId() };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.reportContest(id, reason, detail.trim());
      toast.success('Thanks. A moderator will look at it.');
      onOpenChange(false);
      setDetail('');
    } catch (err) {
      toast.error(errorCode(err) === '42501' ? 'Verify your email to report a contest.' : friendlyError(err, "We couldn't send that report."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Report this contest" description="Tell us what is wrong. Reports are private; the host is not told who sent them.">
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor={ids.reason}>What is wrong?</Label>
            <Select id={ids.reason} value={reason} onChange={(e) => setReason(e.target.value as ContestReportReason)}>
              {(Object.keys(REPORT_LABEL) as ContestReportReason[]).map((r) => <option key={r} value={r}>{REPORT_LABEL[r]}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.detail}>Details (optional)</Label>
            <Textarea id={ids.detail} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={300} />
            <FieldHint>{detail.length}/300. Please do not include answers.</FieldHint>
          </div>
          <div className="flex justify-end"><Button type="submit" loading={busy}><Flag /> Send report</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
