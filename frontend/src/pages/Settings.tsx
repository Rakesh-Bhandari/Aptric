import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, LifeBuoy, ListFilter, LogOut, MessageSquare, Monitor, Moon, Palette, Settings as SettingsIcon, ShieldAlert, Sun, Target, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Input, Label, Select, Textarea } from '@/components/ui/input';
import { Page } from '@/components/ui/page';
import { usePreferences, type ThemeSetting } from '@/context/PreferencesContext';
import { useProfile, useSession } from '@/context/SessionContext';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';
import { formatRelative } from '@/lib/format';
import { DAILY_TARGETS, HANDLE_RE } from '@/lib/game';
import { keys, queryClient, useExamTags, useLevels, useTopicPreferences, useTopics } from '@/lib/queries';
import type { CatalogTopic } from '@/lib/types';
import { cn } from '@/lib/utils';

const timezones = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
})();

const Section = ({ id, title, description, icon, children }: { id?: string; title: string; description?: string; icon?: ReactNode; children: ReactNode }) => (
  <Card id={id} className="scroll-mt-20">
    <CardHeader className="flex-row items-start gap-3">
      {icon && <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground [&_svg]:size-5">{icon}</span>}
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
          'flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring [&_svg]:size-4',
          value === o.value
            ? 'bg-primary bg-gradient-primary text-primary-foreground shadow-sm'
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

type TopicChoice = 'prefer' | 'auto' | 'exclude';

const TOPIC_CHOICES: { value: TopicChoice; label: string }[] = [
  { value: 'prefer', label: 'More' },
  { value: 'auto', label: 'Auto' },
  { value: 'exclude', label: 'Skip' },
];

/** Daily challenge topics: lean towards some, skip others. The bank's topics, by section. */
const TopicsForm = () => {
  const topics = useTopics();
  const saved = useTopicPreferences();
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, TopicChoice> | null>(null);
  const [busy, setBusy] = useState(false);

  if (topics.isError || saved.isError) return <p className="text-sm text-danger">We couldn't load the topics. Try again later.</p>;
  if (!topics.data || !saved.data) return <p className="text-sm text-muted-foreground">Loading topics…</p>;

  const initial: Record<string, TopicChoice> = {};
  for (const id of saved.data.preferred_topic_ids) initial[id] = 'prefer';
  for (const id of saved.data.excluded_topic_ids) initial[id] = 'exclude';
  const choices = draft ?? initial;
  const choiceOf = (id: string): TopicChoice => choices[id] ?? 'auto';
  const set = (ids: string[], value: TopicChoice) => setDraft({ ...choices, ...Object.fromEntries(ids.map((id) => [id, value])) });

  const bySection = new Map<string, CatalogTopic[]>();
  for (const t of topics.data) bySection.set(t.section_id, [...(bySection.get(t.section_id) ?? []), t]);
  const sections = [...bySection.values()];
  const ids = (value: TopicChoice) => topics.data.filter((t) => choiceOf(t.id) === value).map((t) => t.id);
  const allSkipped = ids('exclude').length === topics.data.length;

  const save = async () => {
    setBusy(true);
    try {
      const next = await api.saveTopicPreferences({ preferred_topic_ids: ids('prefer'), excluded_topic_ids: ids('exclude') });
      queryClient.setQueryData(keys.topicPreferences, next);
      void queryClient.invalidateQueries({ queryKey: keys.today });
      setDraft(null);
      toast.success('Topics saved. They apply to your next daily challenge, or today\'s if you have not started it.');
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't save your topics."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {sections.map((list) => {
        const sectionIds = list.map((t) => t.id);
        const skipped = sectionIds.every((id) => choiceOf(id) === 'exclude');
        return (
          <fieldset key={list[0].section_id} className="space-y-2">
            <legend className="flex w-full items-center justify-between gap-3 text-sm font-semibold text-heading">
              {list[0].section}
              <Button type="button" variant="ghost" size="sm" aria-label={`${skipped ? 'Include' : 'Skip'} ${list[0].section}`} onClick={() => set(sectionIds, skipped ? 'auto' : 'exclude')}>
                {skipped ? 'Include section' : 'Skip section'}
              </Button>
            </legend>
            <ul className="divide-y rounded-lg border">
              {list.map((t: CatalogTopic) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="text-sm">{t.name}</span>
                  <div role="radiogroup" aria-label={t.name} className="inline-grid grid-flow-col gap-1 rounded-full border bg-muted p-0.5">
                    {TOPIC_CHOICES.map((c) => (
                      <label key={c.value} className={cn(
                        'flex min-h-8 cursor-pointer items-center rounded-full px-3 text-xs font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
                        choiceOf(t.id) === c.value ? 'bg-primary bg-gradient-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                      )}
                      >
                        <input type="radio" className="sr-only" name={`topic-${t.id}`} checked={choiceOf(t.id) === c.value} onChange={() => set([t.id], c.value)} />
                        {c.label}<span className="sr-only"> {c.value === 'auto' ? '(no preference)' : c.value === 'prefer' ? '(see more)' : '(never)'}</span>
                      </label>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </fieldset>
        );
      })}
      {allSkipped && <FieldHint>Every topic is skipped, so we will ignore this and pick from all of them.</FieldHint>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" loading={busy} disabled={!draft} onClick={() => void save()}>Save topics</Button>
        {draft && <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Reset</Button>}
      </div>
    </div>
  );
};

/**
 * Mini app mock in a fixed palette for the theme picker: the white header and
 * pale page of light mode, or the midnight header, page and cards of dark mode
 * with a violet glow, each with a gradient button.
 */
const ThemePreview = ({ tone }: { tone: 'light' | 'dark' }) => {
  const light = tone === 'light';
  return (
    <span aria-hidden className={cn('relative flex h-full flex-1 flex-col gap-1 overflow-hidden p-1.5', light ? 'bg-preview-light-bg' : 'bg-preview-dark-bg')}>
      {!light && <span className="absolute -right-3 -top-3 size-10 rounded-full bg-violet/40 blur-md" />}
      <span className={cn('relative flex h-2.5 items-center justify-between rounded-sm border px-1', light ? 'border-preview-light-line bg-preview-light-card' : 'border-preview-dark-line bg-preview-dark-header')}>
        <span className="h-1 w-3 rounded-full bg-primary bg-gradient-primary" />
        <span className="h-1 w-2 rounded-full bg-primary bg-gradient-primary" />
      </span>
      <span className={cn('relative flex flex-1 flex-col gap-1 rounded-sm border p-1', light ? 'border-preview-light-line bg-preview-light-card' : 'border-preview-dark-line bg-preview-dark-card')}>
        <span className={cn('h-1 w-3/4 rounded-full', light ? 'bg-preview-light-line' : 'bg-preview-dark-line')} />
        <span className={cn('h-1 w-1/2 rounded-full', light ? 'bg-preview-light-line' : 'bg-preview-dark-line')} />
        <span className="mt-auto h-1.5 w-6 rounded-full bg-primary bg-gradient-primary" />
      </span>
    </span>
  );
};

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
                {/* The icon drops on phones so the label and the radio dot fit a third of the row. */}
                <span className="flex min-w-0 items-center gap-1.5 max-sm:[&_svg]:hidden">{t.icon} {t.label}</span>
                <span aria-hidden className={cn('grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors', theme === t.value ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
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
            reduce ? 'bg-primary bg-gradient-primary' : 'bg-input',
          )}
        >
          <span className={cn('inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200', reduce ? 'translate-x-6' : 'translate-x-1')} />
        </button>
      </div>
    </div>
  );
};

/**
 * Practice only: Daily and contests always detect tab switches, so there is nothing to switch off there.
 */
const ExamConditionsForm = () => {
  const { detectTabSwitchesInPractice, setDetectTabSwitchesInPractice } = usePreferences();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const ids = { label: useId(), hint: useId() };
  const toggle = async () => {
    setBusy(true);
    try {
      await setDetectTabSwitchesInPractice(!detectTabSwitchesInPractice);
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't save that."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/40 p-4">
      <div className="min-w-0 space-y-0.5">
        <p id={ids.label} className="text-sm font-semibold text-heading">Detect tab switches in Practice</p>
        <p id={ids.hint} className="text-sm text-muted-foreground">
          Hides the question and warns you when you leave the page, like a real exam. Daily challenges and contests always detect tab switches.
        </p>
      </div>
      <button
        type="button" role="switch" aria-checked={detectTabSwitchesInPractice} aria-labelledby={ids.label} aria-describedby={ids.hint}
        disabled={busy} onClick={() => void toggle()}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 before:absolute before:-inset-2 before:content-[""] disabled:opacity-60',
          detectTabSwitchesInPractice ? 'bg-primary bg-gradient-primary' : 'bg-input',
        )}
      >
        <span className={cn('inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200', detectTabSwitchesInPractice ? 'translate-x-6' : 'translate-x-1')} />
      </button>
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

/** /settings: profile details, goals, appearance, exam conditions and account actions. */
const Settings = () => {
  const { signOut } = useSession();
  return (
    <Page className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight text-heading sm:text-3xl"><SettingsIcon className="size-6 text-muted-foreground" aria-hidden /> Settings</h1>
        <p className="text-muted-foreground">Your profile, goals and how Aptric looks.</p>
      </div>
      <Section title="Profile" description="How you appear on leaderboards and your public page." icon={<UserRound />}><ProfileForm /></Section>
      <Section title="Goals and level" description="We use these to pick your daily challenge and track your progress." icon={<Target />}><GoalsForm /></Section>
      <Section title="Daily topics" description="Choose what your daily challenge leans towards and what it leaves out. Skipped topics are never used unless nothing else is left." icon={<ListFilter />}><TopicsForm /></Section>
      <Section title="Appearance" description="Pick a theme and how much things move." icon={<Palette />}><AppearanceForm /></Section>
      <Section title="Exam conditions" description="How strictly practice mimics a real exam." icon={<ShieldAlert />}><ExamConditionsForm /></Section>
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

export default Settings;
