import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown, ChevronRight, Play, Search, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Page, PageHeader } from '@/components/ui/page';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { MasteryStars } from '@/components/ui/stars';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { formatPercent, plural } from '@/lib/format';
import { usePracticeTree } from '@/lib/queries';
import type { Difficulty, SectionNode, SubtopicNode } from '@/lib/types';
import { cn } from '@/lib/utils';
import { practiceHref } from '@/lib/routes';

type Pref = Difficulty | 'any';
const PREFS: { value: Pref; label: string }[] = [
  { value: 'any', label: 'Any' }, { value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' },
];

const readPref = (): Pref => {
  try {
    const v = localStorage.getItem('aptric.practiceDifficulty');
    return PREFS.some((p) => p.value === v) ? (v as Pref) : 'any';
  } catch {
    return 'any';
  }
};

const accuracyText = (n: { attempted: number; correct: number }) =>
  n.attempted > 0 ? `${formatPercent(n.correct, n.attempted)} of ${plural(n.attempted, 'answer')}` : 'Not started';

const DifficultyPicker = ({ value, onChange }: { value: Pref; onChange: (p: Pref) => void }) => {
  const id = useId();
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend id={id} className="sr-only">Preferred difficulty</legend>
      <span className="text-sm text-muted-foreground" aria-hidden>Difficulty:</span>
      <div className="inline-flex rounded-lg bg-muted p-1">
        {PREFS.map((p) => (
          <label key={p.value} className={cn(
            'cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
            value === p.value && 'bg-card text-foreground shadow-sm',
          )}
          >
            <input type="radio" name={id} value={p.value} checked={value === p.value} onChange={() => onChange(p.value)} className="sr-only" />
            {p.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
};

const SubtopicRow = ({ s, difficulty }: { s: SubtopicNode; difficulty: Difficulty | null }) => (
  <li>
    <Link
      to={practiceHref({ subtopics: [s.id], difficulty, title: s.name })}
      aria-disabled={s.available === 0 || undefined}
      className={cn(
        'flex min-h-14 items-center gap-3 rounded-md px-3 py-2 hover:bg-muted',
        s.available === 0 && 'pointer-events-none opacity-60',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {s.name}
          {s.weak && <Badge variant="warning" className="ml-2 align-middle">Needs work</Badge>}
        </p>
        <p className="text-xs text-muted-foreground">
          {accuracyText(s)} · {s.available > 0 ? `${plural(s.available, 'new question')}` : 'All done'}
        </p>
      </div>
      <MasteryStars stars={s.stars} />
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  </li>
);

const SectionItem = ({ section, difficulty, filter }: { section: SectionNode; difficulty: Difficulty | null; filter: string }) => {
  const topics = section.topics
    .map((t) => ({ ...t, subtopics: t.subtopics.filter((s) => !filter || s.name.toLowerCase().includes(filter) || t.name.toLowerCase().includes(filter)) }))
    .filter((t) => t.subtopics.length > 0);
  if (topics.length === 0) return null;
  return (
    <Accordion.Item value={section.id} className="overflow-hidden rounded-lg border bg-card">
      <Accordion.Header>
        <Accordion.Trigger className="group flex w-full items-center gap-3 p-4 text-left hover:bg-muted/50">
          <div className="min-w-0 flex-1">
            <span className="block font-semibold">{section.name}</span>
            <span className="text-sm text-muted-foreground">{accuracyText(section)}</span>
          </div>
          <MasteryStars stars={section.stars} />
          <ChevronDown className="size-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="border-t">
        <div className="divide-y">
          {topics.map((t) => (
            <section key={t.id} aria-labelledby={`topic-${t.id}`} className="p-2 sm:p-3">
              <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
                <h3 id={`topic-${t.id}`} className="flex-1 text-sm font-semibold">{t.name}</h3>
                <MasteryStars stars={t.stars} className="hidden sm:inline-flex" />
                <Button
                  size="sm" variant="ghost" asChild disabled={t.available === 0}
                  className={cn(t.available === 0 && 'pointer-events-none opacity-60')}
                >
                  <Link to={practiceHref({ subtopics: t.subtopics.map((s) => s.id), difficulty, title: t.name })}>
                    <Play /> Practice topic
                  </Link>
                </Button>
              </div>
              <ul>{t.subtopics.map((s) => <SubtopicRow key={s.id} s={s} difficulty={difficulty} />)}</ul>
            </section>
          ))}
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
};

const Practice = () => {
  const tree = usePracticeTree();
  const [pref, setPref] = useState<Pref>(readPref);
  const [query, setQuery] = useState('');
  const difficulty = pref === 'any' ? null : pref;
  const filter = query.trim().toLowerCase();

  const weak = useMemo(
    () => (tree.data ?? []).flatMap((s) => s.topics.flatMap((t) => t.subtopics.filter((x) => x.weak)))
      .sort((a, b) => a.correct / a.attempted - b.correct / b.attempted),
    [tree.data],
  );

  const choosePref = (p: Pref) => {
    setPref(p);
    try { localStorage.setItem('aptric.practiceDifficulty', p); } catch { /* not persisted */ }
  };

  return (
    <Page>
      <PageHeader title="Practice" description="Pick a topic and work through 10 new questions at your own pace." />

      <Card className="mb-5 border-warning/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><Target className="size-5 text-warning" aria-hidden /> Weak areas</CardTitle>
          <CardDescription>
            {weak.length > 0
              ? 'Topics where you get fewer than 6 in 10 right. A focused session mixes questions from up to five of them.'
              : 'Answer a few questions in each topic and we’ll find the ones that need work. Until then, this mixes questions from everywhere.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {weak.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {weak.slice(0, 5).map((s) => (
                <li key={s.id}><Badge variant="warning">{s.name} · {formatPercent(s.correct, s.attempted)}</Badge></li>
              ))}
            </ul>
          )}
          <Button asChild><Link to={practiceHref({ mode: 'weak', difficulty, title: 'Weak areas' })}><Play /> Practice weak areas</Link></Button>
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" placeholder="Find a topic" aria-label="Find a topic" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <DifficultyPicker value={pref} onChange={choosePref} />
      </div>

      {tree.isError && <ErrorState error={tree.error} onRetry={() => void tree.refetch()} />}
      {!tree.data && !tree.isError && (
        <LoadingRegion label="Loading topics" className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[4.5rem] rounded-lg" />)}
        </LoadingRegion>
      )}
      {tree.data && tree.data.length === 0 && (
        <EmptyState title="No topics yet">Questions are being added. Check back soon.</EmptyState>
      )}
      {tree.data && tree.data.length > 0 && (
        <Accordion.Root type="multiple" defaultValue={filter ? tree.data.map((s) => s.id) : [tree.data[0].id]} key={filter ? 'filtered' : 'all'} className="space-y-3">
          {tree.data.map((s) => <SectionItem key={s.id} section={s} difficulty={difficulty} filter={filter} />)}
        </Accordion.Root>
      )}
      {tree.data && filter && tree.data.every((s) => s.topics.every((t) => !t.name.toLowerCase().includes(filter) && t.subtopics.every((x) => !x.name.toLowerCase().includes(filter)))) && (
        <EmptyState title={`No topics match “${query.trim()}”`} className="mt-3">Try a shorter word, like “percent” or “train”.</EmptyState>
      )}
    </Page>
  );
};

export default Practice;
