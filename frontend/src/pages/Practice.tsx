import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as Accordion from '@radix-ui/react-accordion';
import {
  ArrowRight, BookOpenText, Calculator, ChartColumn, ChevronDown, ChevronRight, Globe, Play, Puzzle, Search, SearchX, Shapes, Target,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Page, PageHeader } from '@/components/ui/page';
import { Progress as Bar } from '@/components/ui/progress';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { MasteryStars } from '@/components/ui/stars';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { formatPercent, plural } from '@/lib/format';
import { usePracticeTree } from '@/lib/queries';
import type { Difficulty, SectionNode, SubtopicNode, TopicNode } from '@/lib/types';
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
    <fieldset className="flex items-center gap-2">
      <legend id={id} className="sr-only">Preferred difficulty</legend>
      <span className="hidden text-sm font-medium text-muted-foreground lg:inline" aria-hidden>Difficulty</span>
      <div className="flex w-full rounded-full border bg-card p-1 shadow-sm sm:w-auto">
        {PREFS.map((p) => (
          <label key={p.value} className={cn(
            'flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-full px-4 text-sm font-semibold text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground sm:flex-none',
            'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
            value === p.value && 'bg-navy text-navy-foreground shadow-sm hover:bg-navy hover:text-navy-foreground dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary dark:hover:text-primary-foreground',
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

// Icon per section, matched on its slug; navy and orange tints alternate (no rainbow).
const SECTION_ICONS: [RegExp, LucideIcon][] = [
  [/quant|arith|math|number/, Calculator], [/logic|reason/, Puzzle], [/verbal|english|language|reading/, BookOpenText],
  [/data|interpret|chart/, ChartColumn], [/general|aware|gk|current/, Globe],
];
const sectionIcon = (slug: string) => SECTION_ICONS.find(([re]) => re.test(slug))?.[1] ?? Shapes;
const TINTS = ['bg-navy-soft text-navy-soft-foreground', 'bg-primary-soft text-primary-soft-foreground'];

const MasteryBar = ({ node, label }: { node: { attempted: number; correct: number }; label: string }) => (
  <Bar value={node.correct} max={Math.max(node.attempted, 1)} label={label} className="h-1.5"
    valueText={node.attempted > 0 ? `${formatPercent(node.correct, node.attempted)} correct` : 'Not started'} />
);

const SubtopicRow = ({ s, difficulty }: { s: SubtopicNode; difficulty: Difficulty | null }) => (
  <li>
    <Link
      to={practiceHref({ subtopics: [s.id], difficulty, title: s.name })}
      aria-disabled={s.available === 0 || undefined}
      className={cn(
        'group/sub flex min-h-12 items-center gap-3 rounded-md px-3 py-2 transition-colors duration-150 hover:bg-muted',
        s.available === 0 && 'pointer-events-none opacity-60',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {s.name}
          {s.weak && <Badge variant="warning" className="ml-2 align-middle">Needs work</Badge>}
        </p>
        <p className="text-xs text-muted-foreground">
          {accuracyText(s)} · {s.available > 0 ? `${plural(s.available, 'new question')}` : 'All done'}
        </p>
      </div>
      <MasteryStars stars={s.stars} className="hidden min-[400px]:inline-flex" />
      <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-primary-soft px-3 text-xs font-semibold text-primary-soft-foreground transition-colors duration-150 group-hover/sub:bg-primary group-hover/sub:text-primary-foreground" aria-hidden>
        Practice <ChevronRight className="size-3.5" />
      </span>
    </Link>
  </li>
);

const TopicItem = ({ t, difficulty }: { t: TopicNode; difficulty: Difficulty | null }) => (
  <Accordion.Item value={t.id} className="rounded-md data-[state=open]:bg-background/60">
    <Accordion.Header asChild>
      <h4>
        <Accordion.Trigger className="group flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-150 hover:bg-muted">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-heading">{t.name}</span>
            <span className="text-xs text-muted-foreground">{plural(t.subtopics.length, 'subtopic')} · {accuracyText(t)}</span>
          </span>
          <MasteryStars stars={t.stars} />
          <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
        </Accordion.Trigger>
      </h4>
    </Accordion.Header>
    <Accordion.Content className="pb-2 pl-2 sm:pl-3">
      <ul className="space-y-0.5 border-l-2 border-border pl-1 sm:pl-2">
        {t.subtopics.map((s) => <SubtopicRow key={s.id} s={s} difficulty={difficulty} />)}
      </ul>
      <div className="mt-1 pl-2 sm:pl-3">
        <Button
          size="sm" variant="ghost" asChild disabled={t.available === 0}
          className={cn('text-accent-text', t.available === 0 && 'pointer-events-none opacity-60')}
        >
          <Link to={practiceHref({ subtopics: t.subtopics.map((s) => s.id), difficulty, title: t.name })}>
            <Play /> Practice all of {t.name}
          </Link>
        </Button>
      </div>
    </Accordion.Content>
  </Accordion.Item>
);

const SectionItem = ({ section, index, difficulty, filter }: { section: SectionNode; index: number; difficulty: Difficulty | null; filter: string }) => {
  const topics = section.topics
    .map((t) => ({ ...t, subtopics: t.subtopics.filter((s) => !filter || s.name.toLowerCase().includes(filter) || t.name.toLowerCase().includes(filter)) }))
    .filter((t) => t.subtopics.length > 0);
  if (topics.length === 0) return null;
  const Icon = sectionIcon(section.slug);
  return (
    <Accordion.Item value={section.id} className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <Accordion.Header>
        <Accordion.Trigger className="group flex w-full items-center gap-3 p-4 text-left transition-colors duration-150 hover:bg-muted/50 sm:gap-4 sm:p-5">
          <span className={cn('grid size-11 shrink-0 place-items-center rounded-md sm:size-12', TINTS[index % 2])} aria-hidden>
            <Icon className="size-5 sm:size-6" />
          </span>
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
              <span className="text-base font-bold tracking-tight text-heading sm:text-lg">{section.name}</span>
              <MasteryStars stars={section.stars} />
            </span>
            <MasteryBar node={section} label={`${section.name} accuracy`} />
            <span className="block text-xs text-muted-foreground">
              {accuracyText(section)} · {plural(section.available, 'new question')}
            </span>
          </span>
          <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="border-t px-2 py-2 sm:px-3">
        <Accordion.Root type="multiple" defaultValue={filter ? topics.map((t) => t.id) : []} className="space-y-0.5">
          {topics.map((t) => <TopicItem key={t.id} t={t} difficulty={difficulty} />)}
        </Accordion.Root>
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

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" placeholder="Find a topic" aria-label="Find a topic" value={query} onChange={(e) => setQuery(e.target.value)} className="rounded-full pl-10 shadow-sm" />
        </div>
        <DifficultyPicker value={pref} onChange={choosePref} />
      </div>

      <section aria-labelledby="weak-areas" className="mb-6 overflow-hidden rounded-lg border border-primary/25 bg-primary-soft p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm" aria-hidden>
            <Target className="size-6" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 id="weak-areas" className="text-lg font-bold tracking-tight text-heading">Weak areas</h2>
            <p className="text-sm text-primary-soft-foreground">
              {weak.length > 0
                ? 'Topics where you get fewer than 6 in 10 right. A focused session mixes questions from up to five of them.'
                : 'Answer a few questions in each topic and we’ll find the ones that need work. Until then, this mixes questions from everywhere.'}
            </p>
            {weak.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 pt-1.5">
                {weak.slice(0, 5).map((s) => (
                  <li key={s.id}><Badge className="bg-card text-foreground shadow-sm">{s.name} · <span className="text-accent-text">{formatPercent(s.correct, s.attempted)}</span></Badge></li>
                ))}
              </ul>
            )}
          </div>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link to={practiceHref({ mode: 'weak', difficulty, title: 'Weak areas' })}>Practice weak areas <ArrowRight /></Link>
          </Button>
        </div>
      </section>

      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">{filter ? 'Matching topics' : 'All sections'}</h2>
      {tree.isError && <ErrorState error={tree.error} onRetry={() => void tree.refetch()} />}
      {!tree.data && !tree.isError && (
        <LoadingRegion label="Loading topics" className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </LoadingRegion>
      )}
      {tree.data && tree.data.length === 0 && (
        <EmptyState icon={<BookOpenText />} title="No topics yet">Questions are being added. Check back soon.</EmptyState>
      )}
      {tree.data && tree.data.length > 0 && (
        <Accordion.Root type="multiple" defaultValue={filter ? tree.data.map((s) => s.id) : [tree.data[0].id]} key={filter ? 'filtered' : 'all'} className="space-y-3">
          {tree.data.map((s, i) => <SectionItem key={s.id} section={s} index={i} difficulty={difficulty} filter={filter} />)}
        </Accordion.Root>
      )}
      {tree.data && filter && tree.data.every((s) => s.topics.every((t) => !t.name.toLowerCase().includes(filter) && t.subtopics.every((x) => !x.name.toLowerCase().includes(filter)))) && (
        <EmptyState icon={<SearchX />} title={`Nothing matches “${query.trim()}”`} className="mt-3">
          Try a shorter word, like “percent” or “train”, or clear the search to see every section.
        </EmptyState>
      )}
    </Page>
  );
};

export default Practice;
