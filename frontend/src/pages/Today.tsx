import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarCheck, CalendarClock, ChevronRight, Flame, Shield, Snowflake, Sparkles, Target, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page } from '@/components/ui/page';
import { Progress, Ring } from '@/components/ui/progress';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useProfile } from '@/context/SessionContext';
import { formatDay, formatRelative, plural } from '@/lib/format';
import { DIFFICULTY_LABEL, leagueZone } from '@/lib/game';
import { useActivity, useMyLeague, usePlayer, useTodaySet } from '@/lib/queries';
import type { Difficulty } from '@/lib/types';
import { cn } from '@/lib/utils';
import { practiceHref } from '@/lib/routes';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const DailyCard = () => {
  const today = useTodaySet();
  if (today.isError) return <ErrorState error={today.error} onRetry={() => void today.refetch()} title="We couldn't load today's challenge" />;
  if (!today.data) {
    return (
      <LoadingRegion label="Loading today's challenge">
        <Skeleton className="h-52 rounded-lg" />
      </LoadingRegion>
    );
  }
  const set = today.data;
  if (!set.daily_set_id || set.questions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarClock className="size-5 text-accent-text" aria-hidden /> Today's challenge is on its way</CardTitle>
          <CardDescription>A fresh set of questions arrives every day at midnight. Meanwhile, practice keeps your skills sharp.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary"><Link to="/practice"><BookOpen /> Go to Practice</Link></Button>
        </CardContent>
      </Card>
    );
  }

  const total = set.questions.length;
  const answered = set.questions.filter((q) => q.attempt).length;
  const correct = set.questions.filter((q) => q.attempt?.is_correct).length;
  const done = answered === total;
  const mix = (['easy', 'medium', 'hard'] as Difficulty[])
    .map((d) => ({ d, n: set.questions.filter((q) => q.difficulty === d).length }))
    .filter((x) => x.n > 0);
  const minutes = Math.max(1, Math.round(set.questions.reduce((s, q) => s + q.est_seconds, 0) / 60));

  return (
    <Card className="overflow-hidden border-primary/30">
      <div className="bg-primary-soft px-4 py-4 text-primary-soft-foreground sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Daily challenge · {formatDay(set.set_date)}</p>
            <h2 className="mt-0.5 text-xl font-bold">{set.title || `${set.track?.name ?? 'Today'}'s set`}</h2>
          </div>
          {done ? <Badge variant="success"><CalendarCheck /> Done</Badge> : <Badge variant="outline" className="bg-card">{plural(total, 'question')}</Badge>}
        </div>
      </div>
      <CardContent className="space-y-4 pt-4 sm:pt-5">
        <div className="flex flex-wrap gap-2 text-sm">
          {mix.map(({ d, n }) => <Badge key={d} variant="muted">{n} {DIFFICULTY_LABEL[d].toLowerCase()}</Badge>)}
          <span className="text-muted-foreground">About {minutes} min</span>
        </div>
        {answered > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span>{done ? `You got ${correct} of ${total} right` : `${answered} of ${total} answered`}</span>
              <span className="text-muted-foreground">{correct} correct</span>
            </div>
            <Progress value={answered} max={total} label="Daily challenge progress" valueText={`${answered} of ${total} answered`} />
          </div>
        )}
        {done ? (
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link to={`/session/summary?daily=${set.daily_set_id}`}>See my results <ArrowRight /></Link>
          </Button>
        ) : (
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link to="/solve/daily">{answered > 0 ? 'Continue challenge' : 'Start challenge'} <ArrowRight /></Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

const StreakCard = () => {
  const player = usePlayer(null);
  const today = useTodaySet();
  if (!player.data) return <Skeleton className="h-36 rounded-lg" />;
  const p = player.data;
  const playedToday = today.data?.questions.some((q) => q.attempt) ?? false;
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-2 pt-4 sm:pt-5">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Flame className={cn('size-5', p.current_streak > 0 ? 'fill-streak/20 text-streak' : 'text-muted-foreground')} aria-hidden /> Streak
        </div>
        <p className="text-3xl font-bold tabular-nums">{plural(p.current_streak, 'day')}</p>
        <p className="text-sm text-muted-foreground">
          {playedToday ? "You're on track today. Nice!" : p.current_streak > 0 ? 'Answer a daily question to keep it going.' : 'Answer a daily question to start one.'}
        </p>
        {p.streak_freezes != null && (
          <p className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Snowflake className="size-3.5" aria-hidden /> {plural(p.streak_freezes, 'streak freeze')} saved · best {plural(p.longest_streak, 'day')}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const TargetCard = () => {
  const activity = useActivity(7);
  if (!activity.data) return <Skeleton className="h-36 rounded-lg" />;
  const { today_count, daily_target, days } = activity.data;
  const met = today_count >= daily_target;
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-2 pt-4 sm:pt-5">
        <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Target className="size-4" aria-hidden /> Daily goal</p>
        <div className="flex items-center gap-3">
          <Ring value={today_count} max={daily_target} size={56} label={`${today_count} of ${daily_target} questions today`}>
            <span className="font-bold tabular-nums">{today_count}</span>
          </Ring>
          <div className="min-w-0">
            <p className="font-semibold">{met ? 'Goal reached!' : `${daily_target - today_count} to go`}</p>
            <p className="text-xs text-muted-foreground">{daily_target} questions a day</p>
          </div>
        </div>
        <div className="mt-auto">
          <ol className="flex flex-wrap gap-1 pt-1" aria-label="Last 7 days">
            {days.map((d) => (
              <li
                key={d.date}
                title={`${formatDay(d.date)}: ${plural(d.attempted, 'question')}`}
                className={cn('size-3 rounded-sm', d.attempted >= daily_target ? 'bg-success' : d.attempted > 0 ? 'bg-primary/50' : 'bg-muted')}
              >
                <span className="sr-only">{formatDay(d.date)}: {plural(d.attempted, 'question')}</span>
              </li>
            ))}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};

const LevelCard = () => {
  const player = usePlayer(null);
  if (!player.data) return <Skeleton className="h-36 rounded-lg" />;
  const p = player.data;
  const into = p.xp - p.level_xp;
  const span = Math.max(1, p.next_level_xp - p.level_xp);
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-2 pt-4 sm:pt-5">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Sparkles className="size-4" aria-hidden /> Level</div>
        <p className="text-3xl font-bold tabular-nums">{p.level}</p>
        <Progress value={into} max={span} label="Progress to next level" valueText={`${into} of ${span} XP to level ${p.level + 1}`} />
        <p className="text-xs text-muted-foreground">{(p.next_level_xp - p.xp).toLocaleString()} XP to level {p.level + 1} · rating {p.rating}</p>
      </CardContent>
    </Card>
  );
};


const LeagueCard = () => {
  const league = useMyLeague();
  if (league.isError) return <ErrorState error={league.error} onRetry={() => void league.refetch()} title="We couldn't load your league" />;
  if (!league.data) return <Skeleton className="h-40 rounded-lg" />;
  const l = league.data;
  const me = l.members.find((m) => m.is_me);
  const zone = me ? leagueZone(l, me.rank) : null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><Trophy className="size-5 text-gold" aria-hidden /> {l.tier.name} league</CardTitle>
          <span className="text-xs text-muted-foreground">Ends {formatRelative(l.week_ends_at)}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {me ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums">#{me.rank}</span>
              <span className="text-muted-foreground">of {l.members.length} · {me.xp.toLocaleString()} XP this week</span>
            </div>
            <p className={cn('flex items-center gap-1.5 text-sm font-medium',
              zone === 'promote' && 'text-success', zone === 'demote' && 'text-danger')}
            >
              <Shield className="size-4" aria-hidden />
              {zone === 'promote' ? "You're in the promotion zone. Keep it up!"
                : zone === 'demote' ? "You're in the demotion zone. Earn XP to climb out."
                  : l.promote_zone > 0 ? `Reach the top ${l.promote_zone} to move up a league.` : 'Hold your place to stay in the top league.'}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Earn XP this week to join a league and compete with up to 30 players.</p>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link to="/compete">See standings <ChevronRight /></Link>
        </Button>
      </CardContent>
    </Card>
  );
};

const Today = () => {
  const profile = useProfile();
  return (
    <Page className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {greeting()}{profile.display_name ? `, ${profile.display_name.split(' ')[0]}` : profile.handle ? `, ${profile.handle}` : ''}
        </h1>
        <p className="text-muted-foreground">Here's your day at a glance.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <DailyCard />
          <div className="grid gap-4 sm:grid-cols-3">
            <StreakCard />
            <TargetCard />
            <LevelCard />
          </div>
        </div>
        <div className="space-y-4">
          <LeagueCard />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2"><BookOpen className="size-5 text-accent-text" aria-hidden /> Keep practising</CardTitle>
              <CardDescription>Short sessions of 10 questions. Half XP, no pressure.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button asChild variant="secondary"><Link to={practiceHref({ mode: 'weak', title: 'Weak areas' })}>Practice my weak areas</Link></Button>
              <Button asChild variant="outline"><Link to="/practice">Choose a topic</Link></Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
};

export default Today;
