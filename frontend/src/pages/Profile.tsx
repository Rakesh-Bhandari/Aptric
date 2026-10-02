import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Check, Flame, LifeBuoy, LogOut, MessageSquare, Monitor, Moon, Palette, Settings, Share2, Sparkles, Sun, Target, Trophy, UserRound } from 'lucide-react';
import { AptricLogo } from '@/components/brand';
import { TierEmblem } from '@/components/compete/TierEmblem';
import { BadgeGrid } from '@/components/profile/BadgeGrid';
import { NotFound } from '@/components/layout/ErrorBoundary';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Input, Label, Select, Textarea } from '@/components/ui/input';
import { Page, StatTile } from '@/components/ui/page';
import { Progress } from '@/components/ui/progress';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { usePreferences, type ThemeSetting } from '@/context/PreferencesContext';
import { useProfile, useSession } from '@/context/SessionContext';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';
import { displayName, formatPercent, formatRelative, plural } from '@/lib/format';
import { DAILY_TARGETS, HANDLE_RE } from '@/lib/game';
import { keys, queryClient, useExamTags, useLevels, usePlayer } from '@/lib/queries';
import type { PlayerProfile } from '@/lib/types';
import { cn } from '@/lib/utils';


const timezones = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
})();

const Chip = ({ className, children }: { className?: string; children: ReactNode }) => (
  <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold [&_svg]:size-3.5', className)}>{children}</span>
);

const ProfileHeader = ({ p, action }: { p: PlayerProfile; action?: ReactNode }) => {
  const into = p.xp - p.level_xp;
  const span = Math.max(1, p.next_level_xp - p.level_xp);
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="relative h-28 overflow-hidden bg-gradient-navy sm:h-36 dark:border-b dark:border-white/10 dark:bg-gradient-hero">
          <span aria-hidden className="absolute inset-0 bg-dots" />
          <span aria-hidden className="absolute -right-16 -top-20 size-64 rounded-full bg-primary/30 blur-3xl" />
          <span aria-hidden className="absolute -bottom-24 left-1/4 size-48 rounded-full bg-orange-light/10 blur-3xl" />
        </div>
        <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
          <div className="-mt-12 flex flex-col items-center gap-3 text-center sm:-mt-14 sm:flex-row sm:items-end sm:gap-5 sm:text-left">
            <Avatar src={p.avatar_url} name={p.display_name || p.handle} className="size-24 text-3xl shadow-md ring-4 ring-white sm:size-28 dark:ring-card" />
            <div className="min-w-0 flex-1 sm:pb-1">
              <h1 className="truncate font-display text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">{displayName(p)}</h1>
              {p.handle && p.display_name && <p className="font-medium text-muted-foreground">@{p.handle}</p>}
            </div>
            {action && <div className="sm:pb-1">{action}</div>}
          </div>
          {p.bio && <p className="mx-auto mt-3 max-w-prose text-center text-sm sm:mx-0 sm:text-left">{p.bio}</p>}
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Chip className="bg-primary-soft text-primary-soft-foreground"><Sparkles aria-hidden /> Level {p.level}</Chip>
            {p.league_tier && (
              <Chip className="bg-navy-soft text-navy-soft-foreground">
                <TierEmblem slug={p.league_tier.slug} tier={p.league_tier.tier} className="h-4 drop-shadow-none" /> {p.league_tier.name} league
              </Chip>
            )}
            <Chip className="bg-warning-soft text-warning-soft-foreground"><Flame aria-hidden className="text-streak" /> {p.current_streak}-day streak</Chip>
            <Chip className="bg-muted text-muted-foreground"><Calendar aria-hidden /> Joined {formatRelative(p.joined_at)}</Chip>
          </div>
          <div className="mt-5 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="font-semibold text-heading">Level {p.level}</span>
              <span className="tabular-nums text-muted-foreground">{p.xp.toLocaleString()} / {p.next_level_xp.toLocaleString()} XP</span>
            </div>
            <Progress value={into} max={span} label="Progress to next level" className="h-2.5" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={<Target className="text-accent-text" />} label="Solved" value={p.solved.toLocaleString()} hint={plural(p.attempts, 'attempt')} />
        <StatTile icon={<Check className="text-success" />} label="Accuracy" value={formatPercent(p.correct, p.attempts)} hint={`${p.correct.toLocaleString()} correct`} />
        <StatTile icon={<Flame className="text-streak" />} label="Best streak" value={plural(p.longest_streak, 'day')} hint={`Now ${p.current_streak}`} />
        <StatTile icon={<Trophy className="text-tier-gold" />} label="Rating" value={p.rating} hint={plural(p.rated_sets, 'rated set')} />
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2">
          <CardTitle>Badges</CardTitle>
          <span className="text-sm text-muted-foreground">{plural(p.badges.length, 'badge')} earned</span>
        </CardHeader>
        <CardContent><BadgeGrid badges={p.badges} /></CardContent>
      </Card>
    </div>
  );
};

/** Navy share card on your own profile: level and streak, shared with the system sheet or copied. */
const ShareCard = ({ p }: { p: PlayerProfile }) => {
  const toast = useToast();
  const share = async () => {
    const url = p.handle ? `${window.location.origin}/u/${p.handle}` : window.location.origin;
    const text = `I'm level ${p.level} on Aptric with a ${plural(p.current_streak, 'day')} streak 🔥 Practise aptitude with me:`;
    try {
      if (navigator.share) await navigator.share({ text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast.success('Link copied. Paste it anywhere to share.');
      }
    } catch {
      /* share sheet dismissed */
    }
  };
  return (
    <Card variant="navy" className="relative overflow-hidden shadow-md">
      <span aria-hidden className="absolute inset-0 bg-dots" />
      <span aria-hidden className="absolute -bottom-20 -right-10 size-56 rounded-full bg-primary/30 blur-3xl" />
      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-3">
          <AptricLogo variant="onDark" size="sm" />
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-muted-foreground">Level</p>
              <p className="font-display text-4xl font-extrabold leading-none tabular-nums">{p.level}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-navy-muted-foreground">Streak</p>
              <p className="flex items-center gap-1 font-display text-4xl font-extrabold leading-none tabular-nums">
                <Flame className="size-7 text-chrome-accent" aria-hidden />{p.current_streak}
                <span className="text-base font-semibold text-navy-muted-foreground">{p.current_streak === 1 ? 'day' : 'days'}</span>
              </p>
            </div>
          </div>
        </div>
        <Button
          variant="outline" onClick={() => void share()}
          className="shrink-0 self-start border-white/70 text-navy-foreground hover:bg-white hover:text-brand-navy sm:self-center"
        >
          <Share2 /> Share
        </Button>
      </div>
    </Card>
  );
};

const HeaderSkeleton = () => (
  <LoadingRegion className="space-y-4">
    <div className="overflow-hidden rounded-lg border bg-card">
      <Skeleton className="h-28 rounded-none sm:h-36" />
      <div className="flex flex-col items-center gap-3 px-6 pb-6 sm:flex-row">
        <Skeleton className="-mt-12 size-24 rounded-full ring-4 ring-card" />
        <div className="w-full flex-1 space-y-2"><Skeleton className="mx-auto h-7 w-48 sm:mx-0" /><Skeleton className="mx-auto h-4 w-32 sm:mx-0" /></div>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
  </LoadingRegion>
);

const Section = ({ id, title, description, icon, children }: { id?: string; title: string; description?: string; icon?: ReactNode; children: ReactNode }) => (
  <Card id={id} className="scroll-mt-20">
    <CardHeader className="flex-row items-start gap-3">
      {icon && <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-navy-soft text-navy-soft-foreground [&_svg]:size-5">{icon}</span>}
      <div className="space-y-1">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </div>
    </CardHeader>
    <CardContent className="space-y-5">{children}</CardContent>
  </Card>
);

/** Pill segmented control (radio group). */
const Choice = <T extends string | number>({ name, value, options, onChange, label, hint }: {
  name: string; value: T; label: string; hint?: string; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void;
}) => (
  <fieldset>
    <legend className="mb-2 text-sm font-semibold text-heading">{label}{hint && <span className="font-normal text-muted-foreground"> · {hint}</span>}</legend>
    <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-full border bg-muted p-1 sm:inline-grid">
      {options.map((o) => (
        <label key={String(o.value)} className={cn(
          'flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring [&_svg]:size-4',
          value === o.value
            ? 'bg-navy text-navy-foreground shadow-sm dark:bg-primary dark:text-primary-foreground'
            : 'text-muted-foreground hover:bg-card hover:text-foreground',
        )}
        >
          <input type="radio" className="sr-only" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  </fieldset>
);

const ProfileForm = () => {
  const profile = useProfile();
  const { setProfile } = useSession();
  const toast = useToast();
  const [handle, setHandle] = useState(profile.handle ?? '');
  const [name, setName] = useState(profile.display_name ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = { handle: useId(), name: useId(), bio: useId() };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const h = handle.trim().toLowerCase();
    if (!HANDLE_RE.test(h)) { setError('Use 3–24 lowercase letters, numbers or underscores.'); return; }
    setBusy(true);
    setError('');
    try {
      setProfile(await api.updateProfile({ handle: h, display_name: name.trim() || null, bio: bio.trim() || null }));
      void queryClient.invalidateQueries({ queryKey: keys.player(null) });
      toast.success('Profile saved.');
    } catch (err) {
      if (errorCode(err) === '23505') setError('That username is taken. Try another.');
      else toast.error(friendlyError(err, "We couldn't save your profile."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={save}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={ids.name}>Name</Label>
          <Input id={ids.name} maxLength={64} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.handle}>Username</Label>
          <Input id={ids.handle} maxLength={24} value={handle} aria-invalid={!!error} aria-describedby={`${ids.handle}-hint`}
            onChange={(e) => { setHandle(e.target.value.toLowerCase()); setError(''); }} autoComplete="username" />
          <FieldHint id={`${ids.handle}-hint`} error={!!error}>{error || 'Shown on leaderboards.'}</FieldHint>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={ids.bio}>About you <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Textarea id={ids.bio} maxLength={280} value={bio} onChange={(e) => setBio(e.target.value)} className="min-h-20" />
      </div>
      <Button type="submit" loading={busy}>Save profile</Button>
    </form>
  );
};

const GoalsForm = () => {
  const profile = useProfile();
  const { setProfile } = useSession();
  const toast = useToast();
  const exams = useExamTags();
  const levels = useLevels();
  const last = useQuery({ queryKey: keys.lastPlacement(profile.id), queryFn: api.getLastPlacement });
  const ids = { goal: useId(), tz: useId() };

  const patch = async (p: api.ProfilePatch, message = 'Saved.') => {
    try {
      setProfile(await api.updateProfile(p));
      toast.success(message);
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't save that."));
    }
  };

  const placedName = levels.data?.find((l) => l.level === profile.placement_level)?.name;
  const retakeAt = last.data?.completed_at ? new Date(new Date(last.data.completed_at).getTime() + 7 * 86_400_000) : null;
  const canRetake = !retakeAt || retakeAt.getTime() <= Date.now();
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor={ids.goal}>Preparing for</Label>
        <Select id={ids.goal} value={profile.exam_goal ?? ''} onChange={(e) => void patch({ exam_goal: e.target.value || null }, 'Goal updated.')}>
          <option value="">General aptitude practice</option>
          {exams.data?.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </Select>
      </div>
      <Choice
        name="daily-target" label="Daily goal" hint="questions a day" value={profile.daily_target}
        options={DAILY_TARGETS.map((n) => ({ value: n, label: <span className="tabular-nums">{n}<span className="sr-only"> questions</span></span> }))}
        onChange={(n) => void patch({ daily_target: n }, `Daily goal set to ${n} questions.`)}
      />
      <div className="space-y-1.5">
        <Label htmlFor={ids.tz}>Time zone</Label>
        <Select id={ids.tz} value={profile.timezone} onChange={(e) => void patch({ timezone: e.target.value }, 'Time zone updated.')}>
          {!timezones.includes(profile.timezone) && <option value={profile.timezone}>{profile.timezone}</option>}
          {timezones.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
        </Select>
        <FieldHint>
          Your day (and streak) resets at midnight here.
          {browserTz && browserTz !== profile.timezone && (
            <> This device is set to {browserTz}. <button type="button" className="font-medium text-accent-text underline" onClick={() => void patch({ timezone: browserTz }, 'Time zone updated.')}>Use it</button></>
          )}
        </FieldHint>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4">
        <div className="text-sm">
          <p className="font-semibold text-heading">Starting level: {placedName ?? 'not set'}</p>
          <p className="text-muted-foreground">
            {placedName ? 'From your placement test. Daily challenges never go below this level.' : 'Take a 10-question test so daily challenges match your level.'}
          </p>
        </div>
        {canRetake
          ? <Button variant="outline" size="sm" asChild><Link to="/onboarding/placement">{placedName ? 'Retake test' : 'Take the test'}</Link></Button>
          : <span className="text-sm text-muted-foreground">You can retake it {formatRelative(retakeAt!.toISOString())}</span>}
      </div>
    </div>
  );
};

/** Mini app mock in a fixed palette for the theme picker. */
const ThemePreview = ({ tone }: { tone: 'light' | 'dark' }) => (
  <span aria-hidden className={cn('flex h-full flex-1 flex-col gap-1 p-1.5', tone === 'light' ? 'bg-preview-light-bg' : 'bg-preview-dark-bg')}>
    <span className="h-2 rounded-sm bg-brand-navy" />
    <span className={cn('flex flex-1 flex-col gap-1 rounded-sm border p-1', tone === 'light' ? 'border-preview-light-line bg-preview-light-card' : 'border-preview-dark-line bg-preview-dark-card')}>
      <span className={cn('h-1 w-3/4 rounded-full', tone === 'light' ? 'bg-preview-light-line' : 'bg-preview-dark-line')} />
      <span className={cn('h-1 w-1/2 rounded-full', tone === 'light' ? 'bg-preview-light-line' : 'bg-preview-dark-line')} />
      <span className="mt-auto h-1.5 w-6 rounded-full bg-primary" />
    </span>
  </span>
);

const THEMES: { value: ThemeSetting; label: string; icon: ReactNode; previews: ('light' | 'dark')[] }[] = [
  { value: 'light', label: 'Light', icon: <Sun aria-hidden />, previews: ['light'] },
  { value: 'dark', label: 'Dark', icon: <Moon aria-hidden />, previews: ['dark'] },
  { value: 'system', label: 'Device', icon: <Monitor aria-hidden />, previews: ['light', 'dark'] },
];

const AppearanceForm = () => {
  const { theme, setTheme, motion, setMotion } = usePreferences();
  const ids = { motion: useId(), motionHint: useId() };
  const reduce = motion === 'reduce';
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-heading">Theme</legend>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {THEMES.map((t) => (
            <label key={t.value} className={cn(
              'group cursor-pointer rounded-lg border-2 bg-card p-1.5 transition-[border-color,box-shadow] duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
              theme === t.value ? 'border-primary shadow-sm' : 'border-border hover:border-muted-foreground/40',
            )}
            >
              <input type="radio" className="sr-only" name="theme" checked={theme === t.value} onChange={() => setTheme(t.value)} />
              <span className="flex h-16 overflow-hidden rounded-md border sm:h-20">
                {t.previews.map((tone) => <ThemePreview key={tone} tone={tone} />)}
              </span>
              <span className="flex items-center justify-between gap-1 px-1 pb-0.5 pt-2 text-sm font-semibold text-heading [&_svg]:size-4">
                <span className="flex items-center gap-1.5">{t.icon} {t.label}</span>
                <span aria-hidden className={cn('grid size-5 place-items-center rounded-full border-2 transition-colors', theme === t.value ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
                  {theme === t.value && <Check className="size-3!" strokeWidth={3} />}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/40 p-4">
        <div className="min-w-0 space-y-0.5">
          <p id={ids.motion} className="text-sm font-semibold text-heading">Reduce motion</p>
          <p id={ids.motionHint} className="text-sm text-muted-foreground">Turns off animations like confetti and pulsing dots. Off follows your device.</p>
        </div>
        <button
          type="button" role="switch" aria-checked={reduce} aria-labelledby={ids.motion} aria-describedby={ids.motionHint}
          onClick={() => setMotion(reduce ? 'system' : 'reduce')}
          className={cn(
            'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 before:absolute before:-inset-2 before:content-[""]',
            reduce ? 'bg-primary' : 'bg-input',
          )}
        >
          <span className={cn('inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200', reduce ? 'translate-x-6' : 'translate-x-1')} />
        </button>
      </div>
    </div>
  );
};

const FeedbackButton = () => {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<api.FeedbackCategory>('general');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { pathname } = useLocation();
  const ids = { cat: useId(), msg: useId() };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    try {
      await api.sendFeedback(category, message.trim(), pathname);
      toast.success('Thanks for the feedback!');
      setMessage('');
      setOpen(false);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}><MessageSquare /> Send feedback</Button>
      <DialogContent title="Send feedback" description="Ideas, bugs, anything. We read every message.">
        <form className="space-y-4" onSubmit={send}>
          <div className="space-y-1.5">
            <Label htmlFor={ids.cat}>Type</Label>
            <Select id={ids.cat} value={category} onChange={(e) => setCategory(e.target.value as api.FeedbackCategory)}>
              <option value="general">General</option>
              <option value="bug">Something's broken</option>
              <option value="feature">Feature idea</option>
              <option value="content">Question content</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.msg}>Message</Label>
            <Textarea id={ids.msg} required maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!message.trim()}>Send</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

/** /profile: your profile plus settings. */
const Profile = () => {
  const player = usePlayer(null);
  const { signOut } = useSession();
  const { hash } = useLocation();

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash, player.data]);

  return (
    <Page className="max-w-3xl space-y-6">
      {player.isError ? <ErrorState error={player.error} onRetry={() => void player.refetch()} />
        : player.data ? <ProfileHeader p={player.data} /> : <HeaderSkeleton />}
      {player.data && <ShareCard p={player.data} />}

      <div id="settings" className="scroll-mt-20 space-y-1 pt-4">
        <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight text-heading"><Settings className="size-6 text-muted-foreground" aria-hidden /> Settings</h2>
        <p className="text-muted-foreground">Your profile, goals and how Aptric looks.</p>
      </div>
      <Section title="Profile" description="How you appear on leaderboards and your public page." icon={<UserRound />}><ProfileForm /></Section>
      <Section title="Goals and level" description="We use these to pick your daily challenge and track your progress." icon={<Target />}><GoalsForm /></Section>
      <Section title="Appearance" description="Pick a theme and how much things move." icon={<Palette />}><AppearanceForm /></Section>
      <Section title="Help and account" description="Tell us what you think, or sign out." icon={<LifeBuoy />}>
        <div className="flex flex-wrap gap-2">
          <FeedbackButton />
          <Button variant="outline" asChild><Link to="/terms">Terms &amp; privacy</Link></Button>
          <Button variant="ghost" onClick={() => void signOut()}><LogOut /> Sign out</Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Keyboard shortcuts while solving: <Kbd>1</Kbd>–<Kbd>4</Kbd> choose an answer, <Kbd>Enter</Kbd> check it or go to the next question.
        </p>
      </Section>
    </Page>
  );
};

const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded-md border border-b-2 bg-card px-1.5 py-0.5 font-mono text-xs font-semibold text-heading">{children}</kbd>
);

/** /u/:handle: someone's public profile. */
export const PublicProfile = () => {
  const { handle = '' } = useParams();
  const player = usePlayer(handle.toLowerCase());
  const isMe = useMemo(() => player.data?.is_me, [player.data]);
  if (player.isError) {
    if (errorCode(player.error) === 'P0002') return <NotFound title="Player not found" message={`There's no player called @${handle}.`} />;
    return <Page><ErrorState error={player.error} onRetry={() => void player.refetch()} /></Page>;
  }
  return (
    <Page className="max-w-3xl space-y-4">
      {player.data
        ? <ProfileHeader p={player.data} action={isMe && <Button variant="outline" size="sm" asChild><Link to="/profile#settings">Edit your profile</Link></Button>} />
        : <HeaderSkeleton />}
    </Page>
  );
};

export default Profile;
