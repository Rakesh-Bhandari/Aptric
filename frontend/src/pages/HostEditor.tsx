import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Ban, CalendarCheck, ExternalLink, Save, Trash2, Undo2 } from 'lucide-react';
import { HostPanel } from '@/components/community/ContestHostCards';
import { QuestionPicker, type PickedItem } from '@/components/community/QuestionPicker';
import { NotFound } from '@/components/layout/ErrorBoundary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldHint, Input, Label, Select, Textarea } from '@/components/ui/input';
import { Page, PageHeader } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { SwitchRow } from '@/components/ui/switch-row';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import {
  defaultWindow, fromLocalInput, hostBlockers, hostedLabel, toLocalInput, validateDraft, VISIBILITY_HELP, VISIBILITY_LABEL,
} from '@/lib/hosting';
import { invalidateHosting, useHostContest, useHostStatus } from '@/lib/queries';
import { contestHref, HOST_PATH, hostContestHref } from '@/lib/routes';
import type { ContestVisibility, HostContest, HostDraft } from '@/lib/types';
import { ContestsGate } from './Host';

const say = (err: unknown, fallback: string) =>
  ['22023', '42501', '54000', '55000', 'RL429'].includes(errorCode(err) ?? '') ? (err as Error).message : friendlyError(err, fallback);

const blankDraft = (leagueId: string | null): HostDraft => ({
  title: '', description: '', ...defaultWindow(Date.now()), question_ids: [], visibility: leagueId ? 'group' : 'unlisted', group_id: leagueId,
  access_code: null, clear_access_code: false, max_participants: null, late_join_minutes: 15, host_plays: false,
});

const draftOf = (c: HostContest): { draft: HostDraft; items: PickedItem[] } => ({
  draft: {
    title: c.title, description: c.description ?? '', starts_at: c.starts_at, ends_at: c.ends_at, question_ids: c.questions.map((q) => q.question_id),
    visibility: c.visibility, group_id: c.group?.id ?? null, access_code: null, clear_access_code: false, max_participants: c.max_participants,
    late_join_minutes: c.late_join_minutes ?? 15, host_plays: c.host_plays,
  },
  items: c.questions.map((q) => ({ id: q.question_id, stem: q.stem, difficulty: q.difficulty, seen: q.seen })),
});

/** The form: a new contest or a draft. */
const DraftForm = ({ contest, leagueId = null }: { contest: HostContest | null; leagueId?: string | null }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const status = useHostStatus();
  const initial = useMemo(() => (contest ? draftOf(contest) : { draft: blankDraft(leagueId), items: [] as PickedItem[] }), [contest, leagueId]);
  const [draft, setDraft] = useState<HostDraft>(initial.draft);
  const [items, setItems] = useState<PickedItem[]>(initial.items);
  const [busy, setBusy] = useState<'save' | 'publish' | 'delete' | null>(null);
  const [touched, setTouched] = useState(false);
  const ids = { title: useId(), desc: useId(), start: useId(), end: useId(), vis: useId(), group: useId(), code: useId(), players: useId(), late: useId() };
  const set = (patch: Partial<HostDraft>) => setDraft((d) => ({ ...d, ...patch }));
  useEffect(() => { setDraft((d) => ({ ...d, question_ids: items.map((i) => i.id) })); }, [items]);

  const st = status.data;
  const maxPlayers = st?.quota.max_participants ?? 50;
  const errors = validateDraft(draft, Date.now(), maxPlayers, false);
  const publishErrors = validateDraft(draft, Date.now(), maxPlayers, true);
  const leagues = (st?.groups ?? []).filter((g) => g.gate);
  const canHostGeneral = st?.ok ?? false;
  const visibilities = (['unlisted', 'group', 'public'] as ContestVisibility[]).filter((v) => (v === 'group' ? leagues.length > 0 : canHostGeneral));
  const groupOnly = !canHostGeneral && leagues.length > 0;
  useEffect(() => { if (st && !canHostGeneral && draft.visibility !== 'group' && leagues.length > 0) set({ visibility: 'group', group_id: draft.group_id ?? leagues[0].id }); }, [st]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (): Promise<HostContest | null> => {
    setTouched(true);
    if (Object.keys(errors).length) return null;
    const saved = await api.hostSaveContest(contest?.id ?? null, {
      ...draft, title: draft.title.trim(), description: draft.description.trim(), access_code: draft.access_code?.trim() || null,
      max_participants: draft.max_participants ?? maxPlayers,
    });
    await invalidateHosting();
    return saved;
  };
  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('save');
    try {
      const saved = await save();
      if (saved) { toast.success('Draft saved.'); if (!contest) navigate(hostContestHref(saved.id), { replace: true }); }
    } catch (err) {
      toast.error(say(err, "We couldn't save that."));
    } finally { setBusy(null); }
  };
  const onPublish = async () => {
    setTouched(true);
    if (Object.keys(publishErrors).length) return;
    const ok = await toast.confirm({
      title: 'Schedule this contest?',
      message: draft.visibility === 'public'
        ? 'It counts as one of your contests this month. A moderator reviews public contests before they appear in the list. You cannot edit it after this; you can unpublish it until someone enters.'
        : 'It counts as one of your contests this month and starts as soon as you schedule it. You cannot edit it after this; you can unpublish it until someone enters.',
      confirmText: 'Schedule it',
    });
    if (!ok) return;
    setBusy('publish');
    try {
      const saved = await save();
      if (!saved) return;
      await api.hostPublishContest(saved.id);
      await invalidateHosting();
      toast.success(draft.visibility === 'public' ? 'Submitted for review.' : 'Scheduled.');
      navigate(hostContestHref(saved.id), { replace: true });
    } catch (err) {
      toast.error(say(err, "We couldn't schedule it."));
    } finally { setBusy(null); }
  };
  const onDelete = async () => {
    if (!contest) return;
    if (!(await toast.confirm({ title: 'Delete this draft?', message: 'This cannot be undone.', confirmText: 'Delete', danger: true }))) return;
    setBusy('delete');
    try { await api.hostDeleteDraft(contest.id); await invalidateHosting(); navigate(HOST_PATH, { replace: true }); } catch (err) { toast.error(say(err, "We couldn't delete it.")); setBusy(null); }
  };

  if (status.isPending) return <LoadingRegion className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-64" /></LoadingRegion>;
  if (st && !canHostGeneral && leagues.length === 0) {
    return (
      <Card className="space-y-2 p-5">
        <h2 className="font-bold text-heading">You cannot host yet</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{hostBlockers(st).map((b) => <li key={b}>{b}</li>)}</ul>
      </Card>
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-6" noValidate>
      <section className="space-y-4" aria-labelledby="ed-details">
        <h2 id="ed-details" className="text-lg font-bold text-heading">Details</h2>
        <div className="space-y-1.5">
          <Label htmlFor={ids.title}>Title</Label>
          <Input id={ids.title} value={draft.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} aria-invalid={touched && Boolean(errors.title)} />
          {touched && errors.title && <FieldHint error>{errors.title}</FieldHint>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.desc}>Description (optional)</Label>
          <Textarea id={ids.desc} value={draft.description} onChange={(e) => set({ description: e.target.value })} maxLength={1000} />
          <FieldHint>{draft.description.length}/1000. Plain text: no images or HTML.</FieldHint>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={ids.start}>Starts</Label>
            <Input id={ids.start} type="datetime-local" value={toLocalInput(draft.starts_at)} onChange={(e) => set({ starts_at: fromLocalInput(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.end}>Ends</Label>
            <Input id={ids.end} type="datetime-local" value={toLocalInput(draft.ends_at)} onChange={(e) => set({ ends_at: fromLocalInput(e.target.value) })} />
          </div>
        </div>
        {touched && errors.when ? <FieldHint error>{errors.when}</FieldHint> : <FieldHint>Starts at least an hour from now. The clock is the server's, the same for everyone.</FieldHint>}
      </section>

      <section className="space-y-4" aria-labelledby="ed-who">
        <h2 id="ed-who" className="text-lg font-bold text-heading">Who can enter</h2>
        <div className="space-y-1.5">
          <Label htmlFor={ids.vis}>Visibility</Label>
          <Select id={ids.vis} value={draft.visibility} onChange={(e) => set({ visibility: e.target.value as ContestVisibility, group_id: e.target.value === 'group' ? (draft.group_id ?? leagues[0]?.id ?? null) : null, access_code: null })}>
            {visibilities.map((v) => <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>)}
          </Select>
          <FieldHint>{VISIBILITY_HELP[draft.visibility]}{groupOnly ? ' You can host for the leagues you run.' : ''}</FieldHint>
        </div>
        {draft.visibility === 'group' && (
          <div className="space-y-1.5">
            <Label htmlFor={ids.group}>League</Label>
            <Select id={ids.group} value={draft.group_id ?? ''} onChange={(e) => set({ group_id: e.target.value || null })}>
              <option value="" disabled>Choose a league</option>
              {leagues.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            {touched && errors.group && <FieldHint error>{errors.group}</FieldHint>}
          </div>
        )}
        {draft.visibility === 'unlisted' && (
          <div className="space-y-1.5">
            <Label htmlFor={ids.code}>Access code (optional)</Label>
            <Input id={ids.code} value={draft.access_code ?? ''} onChange={(e) => set({ access_code: e.target.value || null, clear_access_code: false })} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={contest?.has_code ? 'Set. Type a new one to change it.' : 'e.g. friday24'} />
            {touched && errors.code ? <FieldHint error>{errors.code}</FieldHint> : <FieldHint>Players need it to enter, even with the link. Share it separately. We store only a hash of it.</FieldHint>}
            {contest?.has_code && <Button type="button" variant="ghost" size="sm" onClick={() => set({ clear_access_code: true, access_code: null })}>Remove the code{draft.clear_access_code ? ' (on save)' : ''}</Button>}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={ids.players}>Most players</Label>
            <Input id={ids.players} type="number" min={2} max={maxPlayers} value={draft.max_participants ?? maxPlayers} onChange={(e) => set({ max_participants: Number(e.target.value) })} />
            {touched && errors.players ? <FieldHint error>{errors.players}</FieldHint> : <FieldHint>Up to {maxPlayers} on your plan.</FieldHint>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.late}>Late entry (minutes)</Label>
            <Input id={ids.late} type="number" min={0} max={1440} value={draft.late_join_minutes} onChange={(e) => set({ late_join_minutes: Number(e.target.value) })} />
            {touched && errors.late ? <FieldHint error>{errors.late}</FieldHint> : <FieldHint>How long after the start players can still enter.</FieldHint>}
          </div>
        </div>
        <SwitchRow label="I play too, for fun" checked={draft.host_plays} onChange={(v) => set({ host_plays: v })} hint="You are unrated and earn no XP. Otherwise you watch: the questions stay hidden from you until it ends." />
      </section>

      <section className="space-y-3" aria-labelledby="ed-questions">
        <h2 id="ed-questions" className="text-lg font-bold text-heading">Questions ({items.length})</h2>
        <QuestionPicker items={items} onChange={setItems} />
        {touched && publishErrors.questions && <FieldHint error>{publishErrors.questions}</FieldHint>}
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" variant="outline" loading={busy === 'save'}><Save /> Save draft</Button>
        <Button type="button" onClick={() => void onPublish()} loading={busy === 'publish'}><CalendarCheck /> Schedule contest</Button>
        {contest && <Button type="button" variant="ghost" onClick={() => void onDelete()} loading={busy === 'delete'}><Trash2 /> Delete draft</Button>}
      </div>
    </form>
  );
};

/** What you can do with a contest that is scheduled, running or over. */
const Scheduled = ({ c }: { c: HostContest }) => {
  const toast = useToast();
  const [busy, setBusy] = useState<'unpublish' | 'cancel' | null>(null);
  const label = hostedLabel(c);
  const canUnpublish = c.status === 'scheduled' && c.state === 'upcoming' && c.participants === 0;
  const canCancel = c.status === 'scheduled' && c.state !== 'ended';

  const unpublish = async () => {
    setBusy('unpublish');
    try { await api.hostUnpublishContest(c.id); await invalidateHosting(); toast.success('Back to a draft.'); } catch (err) { toast.error(say(err, "We couldn't unpublish it.")); } finally { setBusy(null); }
  };
  const cancel = async () => {
    const ok = await toast.confirm({ title: 'Cancel this contest?', message: 'Players who entered are told it was cancelled and nothing counts. It still counts toward this month\'s limit.', confirmText: 'Cancel contest', cancelText: 'Keep it', danger: true });
    if (!ok) return;
    setBusy('cancel');
    try { await api.hostCancelContest(c.id); await invalidateHosting(); toast.success('Cancelled.'); } catch (err) { toast.error(say(err, "We couldn't cancel it.")); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={c.status === 'cancelled' || c.review_state === 'rejected' || c.hidden ? 'danger' : c.review_state === 'pending' ? 'warning' : 'blue'}>{label}</Badge>
          <span className="text-sm text-muted-foreground">{formatDateTime(c.starts_at)} – {formatDateTime(c.ends_at)}</span>
        </div>
        {c.review_state === 'pending' && <p className="text-sm text-muted-foreground">A moderator will check it before it appears in the contest list. You will see the result here.</p>}
        {c.status_note && <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground"><strong>Note from the moderators:</strong> {c.status_note}</p>}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary"><Link to={contestHref(c.id)}><ExternalLink /> Open contest page</Link></Button>
          {canUnpublish && <Button variant="outline" onClick={() => void unpublish()} loading={busy === 'unpublish'}><Undo2 /> Back to draft</Button>}
          {canCancel && <Button variant="ghost" onClick={() => void cancel()} loading={busy === 'cancel'}><Ban /> Cancel contest</Button>}
        </div>
      </Card>
      <HostPanel c={c} manage={false} />
    </div>
  );
};

const Inner = () => {
  const { id } = useParams();
  const [params] = useSearchParams();
  const contest = useHostContest(id ?? null);
  if (!id) return <Page className="max-w-3xl space-y-5"><Back /><PageHeader title="New contest" /><DraftForm contest={null} leagueId={params.get('league')} /></Page>;
  if (contest.isError) {
    if (['P0002', '22P02'].includes(errorCode(contest.error) ?? '')) return <NotFound title="Contest not found" message="It may be someone else's, or deleted." />;
    return <Page className="max-w-3xl"><ErrorState error={contest.error} onRetry={() => void contest.refetch()} /></Page>;
  }
  if (!contest.data) return <Page className="max-w-3xl"><LoadingRegion className="space-y-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-64" /></LoadingRegion></Page>;
  const c = contest.data;
  return (
    <Page className="max-w-3xl space-y-5">
      <Back />
      <PageHeader title={c.title} description={c.status === 'draft' ? 'Draft: only you can see it.' : undefined} />
      {c.status === 'draft' ? <DraftForm key={c.id + c.title} contest={c} /> : <Scheduled c={c} />}
    </Page>
  );
};

const Back = () => <Button variant="ghost" size="sm" asChild className="-ml-2"><Link to={HOST_PATH}><ArrowLeft /> Your contests</Link></Button>;

/** /compete/host/new and /compete/host/:id */
const HostEditor = () => <ContestsGate><Inner /></ContestsGate>;

export default HostEditor;
