import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Award, BarChart3, BookOpen, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, CircleAlert, Flag, Flame, History, Lightbulb, Medal,
  Sparkles, Target, X,
} from 'lucide-react';
import { ActivityHeatmap } from '@/components/charts/ActivityHeatmap';
import { SkillRadar } from '@/components/charts/SkillRadar';
import { Markdown } from '@/components/markdown/Markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/ui/page';
import { Progress as Bar } from '@/components/ui/progress';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { MasteryStars } from '@/components/ui/stars';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDay, formatPercent, formatRelative, plural } from '@/lib/format';
import { DIFFICULTY_LABEL, OPTION_LETTERS } from '@/lib/game';
import { useActivity, useMistakes, usePlayer, usePracticeTree } from '@/lib/queries';
import type { Mistake } from '@/lib/types';
import { cn } from '@/lib/utils';
import { practiceHref } from '@/lib/routes';

/** KPI tile: big navy number, muted label, a tinted icon. */
const Kpi = ({ label, value, hint, icon, tone = 'navy' }: {
  label: string; value: ReactNode; hint?: ReactNode; icon: ReactNode; tone?: 'navy' | 'orange';
}) => (
  <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm sm:p-5">
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs font-semibold text-muted-foreground sm:text-sm">{label}</span>
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-full [&_svg]:size-4',
        tone === 'orange' ? 'bg-primary-soft text-primary-soft-foreground' : 'bg-navy-soft text-navy-soft-foreground')} aria-hidden
      >
        {icon}
      </span>
    </div>
    <span className="text-2xl font-extrabold leading-none tracking-tight text-heading tabular-nums sm:text-3xl">{value}</span>
    {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
  </div>
);

const Overview = () => {
  const player = usePlayer(null);
  const tree = usePracticeTree();
  if (player.isError) return <ErrorState error={player.error} onRetry={() => void player.refetch()} />;
  if (!player.data || !tree.data) {
    return (
      <LoadingRegion className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        <Skeleton className="h-80" />
      </LoadingRegion>
    );
  }
  const p = player.data;
  const sections = tree.data;
  const axes = sections.map((s) => ({
    label: s.name,
    value: s.attempted > 0 ? s.correct / s.attempted : null,
    detail: s.attempted > 0 ? `${formatPercent(s.correct, s.attempted)} of ${plural(s.attempted, 'answer')}` : 'not started',
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={<CheckCheck />} label="Questions solved" value={p.solved.toLocaleString()} hint={`${plural(p.attempts, 'answer')} in total`} />
        <Kpi icon={<Target />} label="Accuracy" value={formatPercent(p.correct, p.attempts)} hint={`${p.correct.toLocaleString()} correct`} />
        <Kpi icon={<Flame />} tone="orange" label="Best streak" value={plural(p.longest_streak, 'day')} hint={p.current_streak > 0 ? `Current: ${plural(p.current_streak, 'day')}` : 'Play today to start one'} />
        <Kpi icon={<Sparkles />} tone="orange" label="Level" value={p.level}
          hint={<>Rating <strong className="font-semibold text-foreground">{p.rating}</strong> · {p.rated_sets > 0 ? plural(p.rated_sets, 'rated set') : 'unrated'}</>} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Skills</CardTitle>
          <CardDescription>How often you answer correctly in each section, across daily challenges and practice.</CardDescription>
        </CardHeader>
        <CardContent className="grid items-center gap-6 md:grid-cols-[1fr_1fr]">
          {axes.length >= 3 && axes.some((a) => a.value != null)
            ? <SkillRadar axes={axes} />
            : <EmptyState icon={<BarChart3 />} title="Your skill map appears here">Answer questions in a few sections to see where you're strong.</EmptyState>}
          <table className="w-full text-sm">
            <caption className="sr-only">Accuracy and mastery by section</caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="pb-2 font-medium">Section</th>
                <th scope="col" className="pb-2 font-medium">Accuracy</th>
                <th scope="col" className="pb-2 text-right font-medium">Mastery</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sections.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="py-3 pr-3 text-left font-semibold text-heading">{s.name}</th>
                  <td className="w-2/5 py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <Bar value={s.correct} max={Math.max(s.attempted, 1)} label={`${s.name} accuracy`} className="h-1.5" />
                      <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-foreground">{s.attempted ? formatPercent(s.correct, s.attempted) : '–'}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right"><MasteryStars stars={s.stars} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Award className="size-5 text-gold" aria-hidden /> Badges</CardTitle></CardHeader>
        <CardContent>
          {p.badges.length === 0 ? (
            <p className="text-sm text-muted-foreground">No badges yet. Keep a 7-day streak or solve 100 questions to earn your first.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {p.badges.map((b) => (
                <li key={`${b.slug}-${b.topic ?? ''}`} className="flex items-start gap-3 rounded-md border bg-background/60 p-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-2xl" aria-hidden>{b.icon}</span>
                  <div>
                    <p className="font-semibold text-heading">{b.name}{b.topic ? ` · ${b.topic}` : ''}</p>
                    <p className="text-sm text-muted-foreground">{b.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const HistoryTab = () => {
  const activity = useActivity(84);
  if (activity.isError) return <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />;
  if (!activity.data) return <LoadingRegion className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-64" /></LoadingRegion>;
  const a = activity.data;
  const last7 = a.days.slice(-7);
  const week = last7.reduce((s, d) => ({ q: s.q + d.attempted, c: s.c + d.correct, xp: s.xp + d.xp }), { q: 0, c: 0, xp: 0 });
  const goalDays = last7.filter((d) => d.attempted >= a.daily_target).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={<CalendarDays />} label="This week" value={week.q} hint="questions answered" />
        <Kpi icon={<Target />} label="Correct" value={formatPercent(week.c, week.q)} hint="this week" />
        <Kpi icon={<Sparkles />} tone="orange" label="XP" value={`+${week.xp}`} hint="this week" />
        <Kpi icon={<Flag />} tone="orange" label="Goal met" value={`${goalDays}/7`} hint={`days with ${a.daily_target}+ questions`} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Last 12 weeks</CardTitle>
          <CardDescription>Questions answered each day, from daily challenges and practice.</CardDescription>
        </CardHeader>
        <CardContent><ActivityHeatmap days={a.days} target={a.daily_target} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-lg">Recent daily challenges</CardTitle></CardHeader>
        <CardContent className="px-0 sm:px-0">
          {a.recent_sets.length === 0 ? (
            <p className="px-4 text-sm text-muted-foreground sm:px-5">You haven't played a daily challenge yet.</p>
          ) : (
            <ul className="divide-y border-t">
              {a.recent_sets.map((s) => (
                <li key={s.daily_set_id}>
                  <Link to={`/session/summary?daily=${s.daily_set_id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-muted/60 sm:gap-4 sm:px-5">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-heading">{formatDay(s.set_date)}</p>
                        <Badge variant="navy">Daily</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <Bar value={s.correct} max={Math.max(s.total, 1)} label={`${formatDay(s.set_date)} accuracy`} className="h-1.5 max-w-48"
                          valueText={`${s.correct} of ${s.total} correct`} />
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {s.answered < s.total ? `${s.answered} of ${s.total} answered` : 'Completed'} · +{s.xp} XP
                        </span>
                      </div>
                    </div>
                    <Badge variant={s.correct === s.total ? 'success' : 'muted'} className="px-3 py-1 text-sm tabular-nums">{s.correct}/{s.total}</Badge>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const MistakeItem = ({ m }: { m: Mistake }) => {
  const correctIndex = m.options.findIndex((o) => o.id === m.correct_option_id);
  const pickedIndex = m.options.findIndex((o) => o.id === m.selected_option_id);
  return (
    <li>
      <details className="group overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow duration-200 open:shadow-md">
        <summary className="flex min-h-16 cursor-pointer list-none items-start gap-3 p-4 transition-colors duration-150 hover:bg-muted/50 sm:p-5 [&::-webkit-details-marker]:hidden">
          <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-full', m.resolved ? 'bg-success-soft text-success-soft-foreground' : 'bg-danger-soft text-danger-soft-foreground')}>
            {m.resolved ? <Check className="size-4" aria-label="Fixed since" /> : <X className="size-4" aria-label="Still to review" />}
          </span>
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="line-clamp-2 font-semibold text-heading"><Markdown text={m.stem.split('\n')[0]} inline /></span>
            <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="navy">{m.subtopic.name}</Badge>
              <Badge variant="muted">{DIFFICULTY_LABEL[m.difficulty]}</Badge>
              <span>{m.topic.name} · {m.gave_up ? 'Gave up' : 'Wrong answer'} {formatRelative(m.answered_at)}</span>
            </span>
          </span>
          <ChevronDown className="mt-1.5 size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-4 border-t p-4 sm:p-5">
          <Markdown text={m.stem} />
          <ol className="space-y-2">
            {m.options.map((o, i) => {
              const correct = i === correctIndex;
              const picked = i === pickedIndex && !correct;
              return (
                <li key={o.id} className={cn('flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm',
                  correct && 'border-success/40 bg-success-soft text-success-soft-foreground',
                  picked && 'border-danger/40 bg-danger-soft text-danger-soft-foreground')}
                >
                  <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold',
                    correct ? 'bg-success text-white dark:text-background' : picked ? 'bg-danger text-white dark:text-background' : 'bg-muted text-muted-foreground')}
                  >
                    {OPTION_LETTERS[i]}
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5"><Markdown text={o.body} inline /></span>
                  {correct && <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-xs font-bold"><Check className="size-3.5" aria-hidden /> Correct</span>}
                  {picked && <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-xs font-bold"><X className="size-3.5" aria-hidden /> Your answer</span>}
                </li>
              );
            })}
          </ol>
          {m.hint && (
            <p className="flex gap-2 text-sm text-muted-foreground"><Lightbulb className="mt-0.5 size-4 shrink-0 text-gold" aria-hidden /> <Markdown text={m.hint} inline /></p>
          )}
          <div className="rounded-md border-l-4 border-primary bg-muted/70 p-4">
            <h4 className="mb-1.5 text-sm font-bold text-heading">Explanation</h4>
            <Markdown text={m.explanation} />
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to={practiceHref({ subtopics: [m.subtopic.id], difficulty: m.difficulty, title: m.subtopic.name })}>
              <BookOpen /> Practice this subtopic
            </Link>
          </Button>
        </div>
      </details>
    </li>
  );
};

const MistakesTab = () => {
  const [offset, setOffset] = useState(0);
  const mistakes = useMistakes(offset);
  if (mistakes.isError) return <ErrorState error={mistakes.error} onRetry={() => void mistakes.refetch()} />;
  if (!mistakes.data) return <LoadingRegion className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</LoadingRegion>;
  const { total, resolved, entries } = mistakes.data;
  const all = total + resolved;
  if (all === 0) {
    return <EmptyState icon={<Medal />} title="No mistakes to review">Questions you get wrong or give up on will show up here with their explanations.</EmptyState>;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="danger" className="px-3 py-1 text-sm"><CircleAlert aria-hidden /> <strong>{total}</strong> to review</Badge>
          {resolved > 0 && <Badge variant="success" className="px-3 py-1 text-sm"><Check aria-hidden /> {resolved} fixed since</Badge>}
        </div>
        <Button size="sm" asChild><Link to={practiceHref({ mode: 'weak', title: 'Weak areas' })}>Practice weak areas</Link></Button>
      </div>
      <ul className="space-y-3">{entries.map((m) => <MistakeItem key={m.attempt_id} m={m} />)}</ul>
      {all > 20 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 20))}>Newer</Button>
          <span className="text-sm text-muted-foreground">{offset + 1}–{Math.min(offset + 20, all)} of {all}</span>
          <Button variant="outline" size="sm" disabled={offset + 20 >= all} onClick={() => setOffset((o) => o + 20)}>Older</Button>
        </div>
      )}
    </div>
  );
};

const TABS = ['overview', 'history', 'mistakes'] as const;
type Tab = (typeof TABS)[number];

const Progress = () => {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'overview';
  return (
    <Page>
      <PageHeader title="Progress" description="See how you're improving and what to work on next." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-1 px-2 sm:gap-1.5 sm:px-4"><BarChart3 /> Overview</TabsTrigger>
          <TabsTrigger value="history" className="gap-1 px-2 sm:gap-1.5 sm:px-4"><History /> History</TabsTrigger>
          <TabsTrigger value="mistakes" className="gap-1 px-2 sm:gap-1.5 sm:px-4"><CircleAlert /> Mistakes</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><Overview /></TabsContent>
        <TabsContent value="history"><HistoryTab /></TabsContent>
        <TabsContent value="mistakes"><MistakesTab /></TabsContent>
      </Tabs>
    </Page>
  );
};

export default Progress;
