import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BookOpen, CalendarCheck, CalendarClock, ChevronRight, Clock, Crown, Flame, Gem, ListChecks, Medal, Shield, Snowflake,
  Target, Trophy, type LucideIcon,
} from 'lucide-react';
import { AptricMark } from '@/components/brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

/** Time until the next daily set, which arrives at local midnight: "5h 12m". */
const useNextSetCountdown = () => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const ms = midnight.getTime() - now;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
};

/** Small uppercase label at the top of each dashboard card. */
const CardLabel = ({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) => (
  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
    <Icon className="size-3.5" aria-hidden /> {children}
  </p>
);

const DashCard = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <Card className={cn('h-full', className)}>
    <CardContent className="flex h-full flex-col gap-3 pt-4 sm:pt-5">{children}</CardContent>
  </Card>
);

// Daily challenge (hero) -------------------------------------------------------
const DailyCard = () => {
  const today = useTodaySet();
  const countdown = useNextSetCountdown();
  if (today.isError) return <ErrorState error={today.error} onRetry={() => void today.refetch()} title="We couldn't load today's challenge" />;
  if (!today.data) {
    return (
      <LoadingRegion label="Loading today's challenge">
        {/* Close to the loaded card height so the cards below do not jump. */}
        <Skeleton className="h-80 rounded-lg sm:h-72" />
      </LoadingRegion>
    );
  }
  const set = today.data;
  const watermark = (
    <AptricMark variant="onDark" className="pointer-events-none absolute -bottom-10 -right-8 h-56 opacity-[0.09] sm:h-72" />
  );
  const nextSet = (
    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Clock className="size-4" aria-hidden /> Next set in <span className="font-semibold tabular-nums text-navy-foreground">{countdown}</span>
    </p>
  );

  if (!set.daily_set_id || set.questions.length === 0) {
    return (
      <Card variant="navy" className="relative overflow-hidden shadow-md">
        {watermark}
        <div className="relative flex flex-col gap-4 p-5 sm:p-7">
          <span className="grid size-11 place-items-center rounded-full bg-navy-foreground/10 text-orange-light"><CalendarClock className="size-5" aria-hidden /></span>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-extrabold tracking-tight">Today's challenge is on its way</h2>
            <p className="max-w-md text-muted-foreground">A fresh set of questions arrives every day at midnight. Meanwhile, practice keeps your skills sharp.</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button asChild size="lg"><Link to="/practice"><BookOpen /> Go to Practice</Link></Button>
            {nextSet}
          </div>
        </div>
      </Card>
    );
  }

  const total = set.questions.length;
  const answered = set.questions.filter((q) => q.attempt).length;
  const correct = set.questions.filter((q) => q.attempt?.is_correct).length;
  const wrong = answered - correct;
  const done = answered === total;
  const mix = (['easy', 'medium', 'hard'] as Difficulty[])
    .map((d) => ({ d, n: set.questions.filter((q) => q.difficulty === d).length }))
    .filter((x) => x.n > 0);
  const minutes = Math.max(1, Math.round(set.questions.reduce((s, q) => s + q.est_seconds, 0) / 60));

  return (
    <Card variant="navy" className="relative overflow-hidden shadow-md">
      {watermark}
      <div className="relative flex flex-col gap-5 p-5 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-light">Daily challenge · {formatDay(set.set_date)}</p>
          {done && <Badge variant="success"><CalendarCheck /> Done</Badge>}
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{set.title || `${set.track?.name ?? 'Today'}'s set`}</h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><ListChecks className="size-4" aria-hidden /> {plural(total, 'question')}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1"><Clock className="size-4" aria-hidden /> About {minutes} min</span>
            {mix.length > 0 && <span aria-hidden>·</span>}
            <span>{mix.map(({ d, n }) => `${n} ${DIFFICULTY_LABEL[d].toLowerCase()}`).join(', ')}</span>
          </p>
        </div>

        <div className="space-y-2">
          <div
            role="progressbar" aria-label="Daily challenge progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered}
            aria-valuetext={`${answered} of ${total} answered, ${correct} correct`}
            className="flex gap-1.5"
          >
            {set.questions.map((q) => (
              <span
                key={q.id}
                className={cn('h-2 flex-1 rounded-full transition-colors duration-200',
                  !q.attempt ? 'bg-navy-foreground/15' : q.attempt.is_correct ? 'bg-primary bg-gradient-orange' : 'bg-on-navy-danger')}
              />
            ))}
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-hidden>
            <span className="font-semibold">{done ? `You got ${correct} of ${total} right` : `${answered} of ${total} answered`}</span>
            {answered > 0 && <span className="text-on-navy-success">{correct} correct</span>}
            {wrong > 0 && <span className="text-on-navy-danger">{wrong} wrong</span>}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {done ? (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to={`/session/summary?daily=${set.daily_set_id}`}>See results <ArrowRight /></Link>
            </Button>
          ) : (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/solve/daily">{answered > 0 ? 'Continue' : "Start today's challenge"} <ArrowRight /></Link>
            </Button>
          )}
          {nextSet}
        </div>
      </div>
    </Card>
  );
};

// Streak ----------------------------------------------------------------------
const StreakCard = () => {
  const player = usePlayer(null);
  const today = useTodaySet();
  const activity = useActivity(7);
  if (!player.data) return <Skeleton className="h-48 rounded-lg" />;
  const p = player.data;
  const playedToday = today.data?.questions.some((q) => q.attempt) ?? false;
  const days = activity.data?.days ?? [];
  return (
    <DashCard>
      <CardLabel icon={Flame}>Streak</CardLabel>
      <div className="flex items-center gap-3">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-full',
          p.current_streak > 0 ? 'bg-primary bg-gradient-orange text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground')}
        >
          <Flame className="size-6" aria-hidden />
        </span>
        <div>
          <p className="text-3xl font-extrabold leading-none tracking-tight text-heading tabular-nums">
            {p.current_streak.toLocaleString()} <span className="text-base font-bold">{p.current_streak === 1 ? 'day' : 'days'}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Best {plural(p.longest_streak, 'day')}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {playedToday ? "You're on track today. Nice!" : p.current_streak > 0 ? 'Answer a daily question to keep it going.' : 'Answer a daily question to start one.'}
      </p>
      {days.length > 0 && (
        <ol className="mt-auto flex justify-between gap-1" aria-label="Last 7 days">
          {days.map((d, i) => {
            const isToday = i === days.length - 1;
            const active = d.attempted > 0 || (isToday && playedToday);
            return (
              <li key={d.date} className="flex flex-col items-center gap-1">
                <span
                  className={cn('size-6 rounded-full',
                    active ? 'bg-primary bg-gradient-orange' : 'border-2 border-input',
                    isToday && !active && 'border-primary motion-safe:animate-pulse-ring',
                    isToday && 'ring-2 ring-primary/30 ring-offset-2 ring-offset-card')}
                  aria-hidden
                />
                <span className={cn('text-[11px] font-semibold', isToday ? 'text-heading' : 'text-muted-foreground')} aria-hidden>
                  {formatDay(d.date, { weekday: 'narrow' })}
                </span>
                <span className="sr-only">{formatDay(d.date)}{isToday ? ' (today)' : ''}: {active ? 'practised' : 'missed'}</span>
              </li>
            );
          })}
        </ol>
      )}
      {p.streak_freezes != null && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Snowflake className="size-3.5" aria-hidden /> {plural(p.streak_freezes, 'streak freeze')} saved
        </p>
      )}
    </DashCard>
  );
};

// Daily target ----------------------------------------------------------------
const TargetCard = () => {
  const activity = useActivity(7);
  if (!activity.data) return <Skeleton className="h-48 rounded-lg" />;
  const { today_count, daily_target } = activity.data;
  const left = daily_target - today_count;
  const met = left <= 0;
  const cheer = met ? 'Goal reached. Brilliant work!'
    : today_count === 0 ? 'A few questions is all it takes.'
      : left <= Math.ceil(daily_target / 3) ? `Almost there: ${left} to go.`
        : `Good start. ${left} more to hit your goal.`;
  return (
    <DashCard>
      <CardLabel icon={Target}>Daily goal</CardLabel>
      <div className="flex flex-1 items-center gap-4">
        <Ring value={today_count} max={daily_target} size={96} label={`${today_count} of ${daily_target} questions today`}>
          <span className="leading-tight">
            <span className="block text-xl font-extrabold tabular-nums text-heading">{today_count}<span className="text-sm font-bold text-muted-foreground"> / {daily_target}</span></span>
            <span className="block text-[11px] text-muted-foreground">questions</span>
          </span>
        </Ring>
        <div className="min-w-0 space-y-1">
          <p className="font-bold text-heading">{cheer}</p>
          <p className="text-xs text-muted-foreground">Your goal is {plural(daily_target, 'question')} a day.</p>
        </div>
      </div>
    </DashCard>
  );
};

// Level -----------------------------------------------------------------------
const LevelCard = () => {
  const player = usePlayer(null);
  if (!player.data) return <Skeleton className="h-48 rounded-lg" />;
  const p = player.data;
  const into = p.xp - p.level_xp;
  const span = Math.max(1, p.next_level_xp - p.level_xp);
  return (
    <DashCard>
      <CardLabel icon={Crown}>Level</CardLabel>
      <div className="flex items-center gap-3">
        <span className="grid h-12 min-w-12 place-items-center rounded-xl bg-navy px-2 text-xl font-extrabold tabular-nums text-navy-foreground shadow-sm">
          <span><span className="sr-only">Level </span>{p.level}</span>
        </span>
        <div>
          <p className="font-bold text-heading">Level {p.level}</p>
          <p className="text-xs text-muted-foreground">{p.xp.toLocaleString()} XP total · rating {p.rating}</p>
        </div>
      </div>
      <div className="mt-auto space-y-1.5">
        <Progress value={into} max={span} label="Progress to next level" valueText={`${into} of ${span} XP to level ${p.level + 1}`} className="h-2.5" />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{(p.next_level_xp - p.xp).toLocaleString()} XP</span> to level {p.level + 1}
        </p>
      </div>
    </DashCard>
  );
};

// League ----------------------------------------------------------------------
const TIER_STYLE: Record<string, { icon: LucideIcon; text: string; soft: string }> = {
  bronze: { icon: Medal, text: 'text-tier-bronze', soft: 'bg-tier-bronze/12' },
  silver: { icon: Medal, text: 'text-tier-silver', soft: 'bg-tier-silver/15' },
  gold: { icon: Trophy, text: 'text-tier-gold', soft: 'bg-tier-gold/12' },
  platinum: { icon: Crown, text: 'text-tier-platinum', soft: 'bg-tier-platinum/12' },
  diamond: { icon: Gem, text: 'text-tier-diamond', soft: 'bg-tier-diamond/12' },
};

const LeagueCard = () => {
  const league = useMyLeague();
  if (league.isError) return <ErrorState error={league.error} onRetry={() => void league.refetch()} title="We couldn't load your league" className="h-full" />;
  if (!league.data) return <Skeleton className="h-48 rounded-lg" />;
  const l = league.data;
  const me = l.members.find((m) => m.is_me);
  const zone = me ? leagueZone(l, me.rank) : null;
  const tier = TIER_STYLE[l.tier.slug] ?? TIER_STYLE.gold;
  const TierIcon = tier.icon;
  return (
    <DashCard>
      <div className="flex items-center justify-between gap-2">
        <CardLabel icon={Shield}>League</CardLabel>
        <span className="text-xs text-muted-foreground">Ends {formatRelative(l.week_ends_at)}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-full', tier.soft, tier.text)}><TierIcon className="size-6" aria-hidden /></span>
        <div className="min-w-0">
          <p className={cn('font-extrabold tracking-tight', tier.text)}>{l.tier.name} league</p>
          {me ? (
            <p className="text-sm text-muted-foreground">
              <span className="text-2xl font-extrabold tabular-nums text-heading">#{me.rank}</span> of {l.members.length} · {me.xp.toLocaleString()} XP
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not placed yet this week</p>
          )}
        </div>
      </div>
      {me ? (
        <p className={cn('rounded-md px-3 py-2 text-sm font-medium',
          zone === 'promote' ? 'bg-success-soft text-success-soft-foreground'
            : zone === 'demote' ? 'bg-danger-soft text-danger-soft-foreground' : 'bg-muted text-muted-foreground')}
        >
          {zone === 'promote' ? "You're in the promotion zone. Keep it up!"
            : zone === 'demote' ? "You're in the demotion zone. Earn XP to climb out."
              : l.promote_zone > 0 ? `Reach the top ${l.promote_zone} to move up a league.` : 'Hold your place to stay in the top league.'}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Earn XP this week to join a league and compete with up to 30 players.</p>
      )}
      <Button variant="link" size="sm" asChild className="mt-auto self-start">
        <Link to="/compete">See standings <ChevronRight /></Link>
      </Button>
    </DashCard>
  );
};

const TodayHeader = () => {
  const profile = useProfile();
  const today = useTodaySet();
  const player = usePlayer(null);
  const name = profile.display_name ? profile.display_name.split(' ')[0] : profile.handle;
  const meta = [
    new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
    today.data?.track?.name,
    player.data ? `Level ${player.data.level}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <div className="space-y-1">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">
        {greeting()}{name ? `, ${name}` : ''}
      </h1>
      <p className="text-sm text-muted-foreground sm:text-base">{meta}</p>
    </div>
  );
};

const Today = () => (
  <Page className="space-y-4 sm:space-y-5">
    <TodayHeader />
    <DailyCard />
    <div className="grid gap-4 sm:grid-cols-2">
      <StreakCard />
      <TargetCard />
      <LevelCard />
      <LeagueCard />
    </div>
    <Card>
      <CardContent className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-center sm:justify-between sm:pt-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground"><BookOpen className="size-5" aria-hidden /></span>
          <div>
            <h2 className="font-bold tracking-tight text-heading">Keep practising</h2>
            <p className="text-sm text-muted-foreground">Short sessions of 10 questions. Half XP, no pressure.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="navy"><Link to={practiceHref({ mode: 'weak', title: 'Weak areas' })}>Practice my weak areas</Link></Button>
          <Button asChild variant="outline"><Link to="/practice">Choose a topic</Link></Button>
        </div>
      </CardContent>
    </Card>
  </Page>
);

export default Today;
