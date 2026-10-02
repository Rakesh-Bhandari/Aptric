import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Award, Calendar, Flame, LogOut, MessageSquare, Monitor, Moon, Sparkles, Sun, Target, Trophy } from 'lucide-react';
import { NotFound } from '@/components/layout/ErrorBoundary';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Input, Label, Select, Textarea } from '@/components/ui/input';
import { Page, StatTile } from '@/components/ui/page';
import { Progress } from '@/components/ui/progress';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { usePreferences, type MotionSetting, type ThemeSetting } from '@/context/PreferencesContext';
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

const ProfileHeader = ({ p }: { p: PlayerProfile }) => {
  const into = p.xp - p.level_xp;
  const span = Math.max(1, p.next_level_xp - p.level_xp);
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <Avatar src={p.avatar_url} name={p.display_name || p.handle} className="size-20 text-2xl" />
        <div className="min-w-0 flex-1 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{displayName(p)}</h1>
          {p.handle && p.display_name && <p className="text-muted-foreground">@{p.handle}</p>}
          {p.bio && <p className="max-w-prose text-sm">{p.bio}</p>}
          <div className="flex flex-wrap justify-center gap-2 pt-1 sm:justify-start">
            <Badge>Level {p.level}</Badge>
            {p.league_tier && <Badge variant="muted"><Trophy /> {p.league_tier.name} league</Badge>}
            <Badge variant="muted"><Calendar /> Joined {formatRelative(p.joined_at)}</Badge>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm"><span>Level {p.level}</span><span className="text-muted-foreground">{p.xp.toLocaleString()} / {p.next_level_xp.toLocaleString()} XP</span></div>
        <Progress value={into} max={span} label="Progress to next level" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={<Flame className="text-streak" />} label="Streak" value={plural(p.current_streak, 'day')} hint={`Best ${p.longest_streak}`} />
        <StatTile icon={<Target />} label="Solved" value={p.solved.toLocaleString()} hint={`${formatPercent(p.correct, p.attempts)} accuracy`} />
        <StatTile icon={<Sparkles />} label="Rating" value={p.rating} hint={plural(p.rated_sets, 'rated set')} />
        <StatTile icon={<Award className="text-gold" />} label="Badges" value={p.badges.length} />
      </div>
      {p.badges.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Badges">
          {p.badges.map((b) => (
            <li key={`${b.slug}-${b.topic ?? ''}`}><Badge variant="outline" title={b.description}><span aria-hidden>{b.icon}</span> {b.name}{b.topic ? ` · ${b.topic}` : ''}</Badge></li>
          ))}
        </ul>
      )}
    </div>
  );
};

const HeaderSkeleton = () => (
  <LoadingRegion className="space-y-4">
    <div className="flex items-center gap-4"><Skeleton className="size-20 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-32" /></div></div>
    <Skeleton className="h-3 w-full" />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
  </LoadingRegion>
);

const Section = ({ id, title, description, children }: { id?: string; title: string; description?: string; children: ReactNode }) => (
  <Card id={id} className="scroll-mt-20">
    <CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
  </Card>
);

const Choice = <T extends string | number>({ name, value, options, onChange, label }: {
  name: string; value: T; label: string; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void;
}) => (
  <fieldset>
    <legend className="mb-1.5 text-sm font-medium">{label}</legend>
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={String(o.value)} className={cn(
          'flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring [&_svg]:size-4',
          value === o.value ? 'border-primary bg-primary-soft text-primary-soft-foreground' : 'bg-card hover:bg-muted',
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
        name="daily-target" label="Daily goal" value={profile.daily_target}
        options={DAILY_TARGETS.map((n) => ({ value: n, label: `${n} questions` }))}
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
        <div className="text-sm">
          <p className="font-medium">Starting level: {placedName ?? 'not set'}</p>
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

const AppearanceForm = () => {
  const { theme, setTheme, motion, setMotion } = usePreferences();
  return (
    <div className="space-y-4">
      <Choice<ThemeSetting>
        name="theme" label="Theme" value={theme} onChange={setTheme}
        options={[
          { value: 'system', label: <><Monitor aria-hidden /> Match device</> },
          { value: 'light', label: <><Sun aria-hidden /> Light</> },
          { value: 'dark', label: <><Moon aria-hidden /> Dark</> },
        ]}
      />
      <Choice<MotionSetting>
        name="motion" label="Animations" value={motion} onChange={setMotion}
        options={[{ value: 'system', label: 'Match device' }, { value: 'reduce', label: 'Reduce motion' }]}
      />
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

      <h2 id="settings" className="scroll-mt-20 pt-2 text-xl font-bold">Settings</h2>
      <Section title="Profile"><ProfileForm /></Section>
      <Section title="Goals and level" description="We use these to pick your daily challenge and track your progress."><GoalsForm /></Section>
      <Section title="Appearance"><AppearanceForm /></Section>
      <Section title="Help and account">
        <div className="flex flex-wrap gap-2">
          <FeedbackButton />
          <Button variant="outline" asChild><Link to="/terms">Terms &amp; privacy</Link></Button>
          <Button variant="ghost" onClick={() => void signOut()}><LogOut /> Sign out</Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Keyboard shortcuts while solving: <kbd className="rounded border px-1">1</kbd>–<kbd className="rounded border px-1">4</kbd> choose an answer, <kbd className="rounded border px-1">Enter</kbd> check it or go to the next question.
        </p>
      </Section>
    </Page>
  );
};

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
      {player.data ? <ProfileHeader p={player.data} /> : <HeaderSkeleton />}
      {isMe && <Button variant="outline" asChild><Link to="/profile#settings">Edit your profile</Link></Button>}
    </Page>
  );
};

export default Profile;
