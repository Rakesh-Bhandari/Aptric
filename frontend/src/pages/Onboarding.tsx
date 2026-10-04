import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, Building2, Check, ClipboardCheck, Clock, Cpu, GraduationCap, Landmark, Lightbulb, Sparkles, Target, TrendingUp, X,
  type LucideIcon,
} from 'lucide-react';
import { AptricMark } from '@/components/brand';
import { Logo } from '@/components/layout/Logo';
import { SessionHeader } from '@/components/solve/SessionHeader';
import { SolveScreen } from '@/components/solve/SolveScreen';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FieldHint, Input, Label } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useProfile, useSession } from '@/context/SessionContext';
import { useToast } from '@/context/ToastContext';
import * as api from '@/lib/api';
import { errorCode, friendlyError } from '@/lib/errors';
import { DAILY_TARGETS, DIFFICULTY_LABEL, HANDLE_RE } from '@/lib/game';
import type { Difficulty } from '@/lib/types';
import { invalidateProgress, keys, queryClient, useExamTags } from '@/lib/queries';
import { safeNext } from '@/lib/auth';
import { SETTINGS_PATH } from '@/lib/routes';
import type { PlacementAnswer, PlacementResult, PlacementStart } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SolveSkeleton } from './solve/SolveSkeleton';
import { fromCard } from './solve/news';

const suggestHandle = (source: string | null | undefined) => {
  const cleaned = (source ?? '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 24);
  return cleaned.length >= 3 ? cleaned : '';
};

/** One onboarding step: logo, step indicator, title, and the content in a white card (or bare, for steps with their own panel). */
const StepFrame = ({ step, total, title, description, bare, children }: {
  step: number; total: number; title: string; description?: string; bare?: boolean; children: React.ReactNode;
}) => (
  <div className="min-h-dvh bg-background">
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Logo />
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Step {step} of {total}</span>
      </div>
      <Progress value={step} max={total} label="Setup progress" className="mb-8 h-1.5" valueText={`Step ${step} of ${total}`} />
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-heading sm:text-4xl">{title}</h1>
      {description && <p className="mt-2 text-muted-foreground sm:text-lg">{description}</p>}
      <div className="mt-6 flex-1">
        {bare ? children : <Card className="shadow-md"><CardContent className="pt-5 sm:p-7">{children}</CardContent></Card>}
      </div>
    </div>
  </div>
);

// Step 1: username ----------------------------------------------------------------
const HandleStep = ({ onDone }: { onDone: () => void }) => {
  const { user, setProfile } = useSession();
  const profile = useProfile();
  const [handle, setHandle] = useState(() => suggestHandle(profile.display_name ?? user?.email?.split('@')[0]));
  const [name, setName] = useState(() => profile.display_name ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const ids = { handle: useId(), name: useId() };
  const value = handle.trim().toLowerCase();
  const looksValid = HANDLE_RE.test(value);
  const formatBad = !!value && !looksValid;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!looksValid) { setError('Use 3–24 lowercase letters, numbers or underscores.'); return; }
    setBusy(true);
    setError('');
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setProfile(await api.updateProfile({
        handle: value, display_name: name.trim() || null, ...(profile.timezone === 'UTC' && tz ? { timezone: tz } : {}),
      }));
      onDone();
    } catch (err) {
      if (errorCode(err) === '23505') setError('That username is taken. Try another.');
      else if (errorCode(err) === '23514') setError("That username isn't allowed. Try another.");
      else toast.error(friendlyError(err, "We couldn't save that. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="space-y-1.5">
        <Label htmlFor={ids.name}>Your name <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id={ids.name} autoComplete="name" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={ids.handle}>Username</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-muted-foreground" aria-hidden>@</span>
          <Input
            id={ids.handle} required maxLength={24} autoComplete="username" autoCapitalize="none" spellCheck={false}
            className={cn('pl-8 pr-10', looksValid && !error && 'border-success', formatBad && 'border-danger')}
            value={handle} aria-invalid={!!error} aria-describedby={`${ids.handle}-hint`}
            onChange={(e) => { setHandle(e.target.value.toLowerCase()); setError(''); }}
          />
          {(error || value) && (
            <span className={cn('pointer-events-none absolute right-3 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full',
              error || formatBad ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')} aria-hidden
            >
              {error || formatBad ? <X className="size-3.5" /> : <Check className="size-3.5" />}
            </span>
          )}
        </div>
        <FieldHint id={`${ids.handle}-hint`} error={!!error} className={cn(!error && looksValid && 'text-success', formatBad && 'text-danger')} aria-live="polite">
          {error || (looksValid
            ? `@${value} looks good. We'll check it's free when you continue.`
            : value ? '3–24 lowercase letters, numbers or underscores.' : 'Shown on leaderboards. 3–24 lowercase letters, numbers or _.')}
        </FieldHint>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={busy}>Continue <ArrowRight /></Button>
    </form>
  );
};

// Step 2: goal + daily target -------------------------------------------------
/** Icon and one-line hint for each exam tag (slugs from the taxonomy seed); unknown tags fall back to a cap. */
const GOAL_META: Record<string, { icon: LucideIcon; hint: string }> = {
  '': { icon: Sparkles, hint: 'Quant, reasoning and verbal' },
  'tcs-nqt': { icon: Building2, hint: 'TCS campus hiring test' },
  infosys: { icon: Building2, hint: 'Infosys hiring test' },
  amcat: { icon: ClipboardCheck, hint: 'Employability assessment' },
  cat: { icon: GraduationCap, hint: 'MBA entrance' },
  gate: { icon: Cpu, hint: 'Engineering PG entrance' },
  'bank-po': { icon: Landmark, hint: 'Banking officer exams' },
  ssc: { icon: BadgeCheck, hint: 'Government job exams' },
};

const GoalStep = ({ onDone }: { onDone: () => void }) => {
  const profile = useProfile();
  const { setProfile } = useSession();
  const exams = useExamTags();
  const toast = useToast();
  const [goal, setGoal] = useState<string>(profile.exam_goal ?? '');
  const [target, setTarget] = useState(profile.daily_target || 10);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      setProfile(await api.updateProfile({ exam_goal: goal || null, daily_target: target }));
      onDone();
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't save that. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const goals = [{ slug: '', name: 'General aptitude' }, ...(exams.data ?? [])];
  const targetLabel = (n: number) => (n <= 5 ? 'Casual' : n <= 10 ? 'Regular' : n <= 20 ? 'Serious' : 'Intense');

  return (
    <form className="space-y-7" onSubmit={submit}>
      <fieldset>
        <legend className="mb-3 flex items-center gap-2 font-semibold"><GraduationCap className="size-5 text-accent-text" aria-hidden /> What are you preparing for?</legend>
        {exams.isPending ? (
          <LoadingRegion className="grid gap-2 sm:grid-cols-2">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[4.25rem]" />)}</LoadingRegion>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {goals.map((g) => {
              const active = goal === g.slug;
              const meta = GOAL_META[g.slug] ?? { icon: GraduationCap, hint: 'Exam preparation' };
              const Icon = meta.icon;
              return (
                <label
                  key={g.slug || 'general'}
                  className={cn(
                    'relative flex min-h-[4.25rem] cursor-pointer items-center gap-3 rounded-lg border-2 px-3 py-2.5 transition-[border-color,background-color] duration-150 ease-out has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                    active ? 'border-primary bg-primary-soft dark:border-accent-text' : 'border-border bg-card hover:border-primary/50 hover:bg-primary-wash',
                  )}
                >
                  <input type="radio" name="goal" className="sr-only" checked={active} onChange={() => setGoal(g.slug)} />
                  <span className={cn('grid size-10 shrink-0 place-items-center rounded-full',
                    active ? 'bg-primary bg-gradient-primary text-primary-foreground' : 'bg-navy-soft text-navy-soft-foreground')} aria-hidden
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 pr-6">
                    <span className="block font-bold leading-tight text-heading">{g.name}</span>
                    <span className="block text-xs text-muted-foreground">{meta.hint}</span>
                  </span>
                  {active && (
                    <span className="absolute right-2.5 top-2.5 grid size-5 place-items-center rounded-full bg-primary bg-gradient-primary text-primary-foreground shadow-glow motion-safe:animate-pop-in" aria-hidden>
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend className="mb-1 flex items-center gap-2 font-semibold"><Target className="size-5 text-accent-text" aria-hidden /> How many questions a day?</legend>
        <p className="mb-3 text-sm text-muted-foreground">Start small. You can change this any time in Settings.</p>
        <div className="grid grid-cols-4 gap-1 rounded-full bg-muted p-1">
          {DAILY_TARGETS.map((n) => (
            <label
              key={n}
              className={cn(
                'flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-full px-1 text-center leading-tight transition-[background-color,color,box-shadow] duration-150 ease-out has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                target === n ? 'bg-primary bg-gradient-primary text-primary-foreground shadow-glow' : 'text-foreground hover:bg-card',
              )}
            >
              <input type="radio" name="target" className="sr-only" checked={target === n} onChange={() => setTarget(n)} />
              <span className="text-base font-extrabold tabular-nums">{n}</span>
              <span className="text-[11px] font-semibold">{targetLabel(n)}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-center text-sm text-muted-foreground" aria-live="polite">
          {targetLabel(target)}: {target} questions, about {Math.round(target * 1.2)} minutes a day.
        </p>
      </fieldset>
      <Button type="submit" size="lg" className="w-full" loading={busy}>Continue <ArrowRight /></Button>
    </form>
  );
};

// Step 3: placement -----------------------------------------------------------
const PlacementIntro = ({ onStart, onSkip, retake }: { onStart: () => void; onSkip?: () => void; retake?: boolean }) => (
  <Card variant="navy" className="relative overflow-hidden shadow-lg">
    <span className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-violet/35 blur-3xl" aria-hidden />
    <AptricMark variant="onDark" className="pointer-events-none absolute -bottom-12 -right-10 h-60 opacity-[0.12]" />
    <div className="relative space-y-6 p-5 sm:p-7">
      <ul className="grid grid-cols-3 gap-2 text-center" aria-label="About the test">
        {[
          { icon: ClipboardCheck, big: '10', small: 'questions' },
          { icon: Clock, big: '~10', small: 'minutes' },
          { icon: TrendingUp, big: 'Sets', small: 'your level' },
        ].map(({ icon: Icon, big, small }) => (
          <li key={small} className="flex flex-col items-center gap-1 rounded-md bg-navy-foreground/[0.08] px-2 py-3">
            <Icon className="size-5 text-sky" aria-hidden />
            <span className="text-xl font-extrabold leading-none">{big}</span>
            <span className="text-xs text-muted-foreground">{small}</span>
          </li>
        ))}
      </ul>
      <ul className="space-y-3 text-sm">
        {[
          { icon: ClipboardCheck, text: 'From easy to hard, across all sections.' },
          { icon: Clock, text: 'Take your time; there is no time limit.' },
          { icon: Lightbulb, text: "No hints and no XP. If you don't know, just skip." },
          { icon: Target, text: "Your score sets your daily challenge level. You can retake it after a week." },
        ].map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-3"><Icon className="mt-0.5 size-4 shrink-0 text-sky" aria-hidden /><span>{text}</span></li>
        ))}
      </ul>
      <div className="flex flex-col items-center gap-3">
        <Button size="lg" className="w-full" onClick={onStart}>{retake ? 'Start the test' : 'Start placement test'} <ArrowRight /></Button>
        {onSkip && (
          <button
            type="button" onClick={onSkip}
            className="min-h-11 rounded-full px-3 text-sm font-semibold text-sky underline-offset-4 hover:underline"
          >
            Skip for now and start at Beginner
          </button>
        )}
      </div>
    </div>
  </Card>
);

const answersKey = (testId: string) => `aptric.placement.${testId}`;

const PlacementRunner = ({ onExit, onFinished }: { onExit: () => void; onFinished: (r: PlacementResult) => void }) => {
  const [test, setTest] = useState<PlacementStart | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [answers, setAnswers] = useState<PlacementAnswer[]>([]);
  const [finishing, setFinishing] = useState(false);
  const started = useRef(false);

  const start = async () => {
    setError(null);
    try {
      const t = await api.startPlacement();
      // Resume answers saved on this device for the same test.
      let saved: PlacementAnswer[] = [];
      try { saved = JSON.parse(sessionStorage.getItem(answersKey(t.test_id)) ?? '[]') as PlacementAnswer[]; } catch { /* none */ }
      setAnswers(saved.filter((a) => t.questions.some((q) => q.id === a.question_id)));
      setTest(t);
    } catch (err) {
      setError(err);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
  }, []);

  const finish = async (all: PlacementAnswer[]) => {
    if (!test) return;
    setFinishing(true);
    try {
      const result = await api.finishPlacement(test.test_id, all);
      try { sessionStorage.removeItem(answersKey(test.test_id)); } catch { /* ignore */ }
      onFinished(result);
    } catch (err) {
      setError(err);
      setFinishing(false);
    }
  };

  const record = (a: PlacementAnswer) => {
    const next = [...answers.filter((x) => x.question_id !== a.question_id), a];
    setAnswers(next);
    try { sessionStorage.setItem(answersKey(test!.test_id), JSON.stringify(next)); } catch { /* ignore */ }
    if (next.length >= test!.questions.length) void finish(next);
  };

  if (error) {
    const cooldown = errorCode(error) === '55000';
    const empty = errorCode(error) === 'P0002';
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState
          error={error}
          title={cooldown ? 'You took the test recently' : empty ? "The placement test isn't available yet" : "We couldn't load the test"}
          onRetry={cooldown || empty ? undefined : () => void (test ? finish(answers) : start())}
        />
        <Button variant="ghost" className="mt-3 w-full" onClick={onExit}>Go back</Button>
      </div>
    );
  }
  if (!test || finishing) return <SolveSkeleton />;

  const remaining = test.questions.filter((q) => !answers.some((a) => a.question_id === q.id));
  const question = remaining[0];
  if (!question) return <SolveSkeleton />;
  const index = test.questions.length - remaining.length;

  return (
    <>
      <SessionHeader title="Placement test" index={index} total={test.questions.length} onExit={onExit} exitLabel="Save and exit the placement test" />
      <SolveScreen
        key={question.id}
        question={fromCard(question)}
        kind="placement"
        onSubmit={async (optionId, timeMs) => {
          record({ question_id: question.id, option_id: optionId, time_ms: timeMs });
          return null;
        }}
        onSkip={(timeMs) => record({ question_id: question.id, option_id: null, time_ms: timeMs })}
        onNext={() => undefined}
        nextLabel="Next"
      />
    </>
  );
};

// Blue, violet and light-blue confetti: fixed positions so the burst looks the same on every render.
const CONFETTI_COLORS = ['bg-primary', 'bg-violet', 'bg-sky', 'bg-gradient-primary', 'bg-violet-text'];
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37 + 7) % 100,
  delay: ((i * 7) % 10) / 20,
  dur: 1.4 + ((i * 13) % 9) / 10,
  drift: ((i * 29) % 80) - 40,
  spin: 360 + ((i * 53) % 4) * 120,
  shape: ['size-2 rounded-[2px]', 'size-2 rounded-full', 'h-3 w-1.5 rounded-[2px]'][i % 3],
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

const Confetti = () => (
  <div className="confetti pointer-events-none absolute inset-x-0 -top-4 h-72 overflow-hidden" aria-hidden>
    {CONFETTI.map((c, i) => (
      <span
        key={i}
        className={cn('confetti-piece absolute top-0', c.shape, c.color)}
        style={{
          left: `${c.left}%`, '--delay': `${c.delay}s`, '--dur': `${c.dur}s`, '--drift': `${c.drift}px`, '--spin': `${c.spin}deg`,
        } as React.CSSProperties}
      />
    ))}
  </div>
);

const PlacementResultView = ({ result, onDone, doneLabel }: { result: PlacementResult; onDone: () => void; doneLabel: string }) => {
  const byDifficulty = (['easy', 'medium', 'hard'] as Difficulty[])
    .map((d) => {
      const rows = result.results.filter((r) => r.difficulty === d);
      return { d, total: rows.length, correct: rows.filter((r) => r.is_correct).length };
    })
    .filter((x) => x.total > 0);
  return (
    <div className="relative space-y-5">
      <Confetti />
      <div className="relative flex flex-col items-center gap-3 pt-2 text-center">
        <div className="grid size-28 place-items-center rounded-full bg-violet text-violet-foreground shadow-lg ring-8 ring-violet-soft motion-safe:animate-pop-in">
          <span className="leading-none">
            <span className="block text-[11px] font-bold uppercase tracking-[0.16em]">Level</span>
            <span className="block text-5xl font-extrabold tabular-nums">{result.profile_level ?? result.level.level}</span>
          </span>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Your starting level</p>
          <p className="font-display text-3xl font-extrabold tracking-tight text-violet-text">{result.level.name}</p>
          <p className="text-sm text-muted-foreground">You got <span className="font-bold text-foreground">{result.correct} of {result.total}</span> right.</p>
        </div>
      </div>
      <Card className="relative shadow-md">
        <CardContent className="space-y-4 pt-5 sm:p-6">
          <h2 className="font-bold tracking-tight text-heading">How you did</h2>
          <ul className="space-y-3">
            {byDifficulty.map(({ d, total, correct }) => (
              <li key={d} className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">{DIFFICULTY_LABEL[d]}</span>
                  <span className="tabular-nums text-muted-foreground">{correct} / {total}</span>
                </div>
                <Progress value={correct} max={total} label={`${DIFFICULTY_LABEL[d]} questions`} valueText={`${correct} of ${total} correct`} className="h-2.5" />
              </li>
            ))}
          </ul>
          <ol className="flex flex-wrap gap-1.5" aria-label="Placement answers">
            {result.results.map((r, i) => (
              <li key={r.question_id} className={cn('grid size-8 place-items-center rounded-full text-xs',
                r.is_correct ? 'bg-success-soft text-success-soft-foreground' : 'bg-muted text-muted-foreground')}
              >
                {r.is_correct ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
                <span className="sr-only">Question {i + 1} ({DIFFICULTY_LABEL[r.difficulty]}): {r.is_correct ? 'correct' : r.selected_option_id ? 'wrong' : 'skipped'}</span>
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted-foreground">
            Questions you missed are waiting in <Link to="/progress?tab=mistakes" className="font-semibold text-accent-text underline">Mistakes</Link> with full explanations.
          </p>
        </CardContent>
      </Card>
      <Button size="lg" className="w-full" onClick={onDone}>{doneLabel} <ArrowRight /></Button>
    </div>
  );
};

type Step = 'handle' | 'goals' | 'intro' | 'test' | 'result';

/** /onboarding: first-run setup. */
const Onboarding = () => {
  const profile = useProfile();
  const { setProfile, refreshProfile } = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const next = safeNext(params.get('next'), '/');
  const [step, setStep] = useState<Step>(() => (profile.handle ? 'goals' : 'handle'));
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [total] = useState(() => (profile.handle ? 3 : 4));
  const n = { handle: 1, goals: total - 2, intro: total - 1, test: total, result: total }[step];

  // Already set up (e.g. a second tab finished onboarding).
  if (profile.handle && profile.onboarded_at && step !== 'result' && step !== 'test') return <Navigate to={next} replace />;

  const skip = async () => {
    try {
      setProfile(await api.updateProfile({ onboarded_at: new Date().toISOString() }));
      toast.info('You can take the placement test any time from Settings.');
      navigate(next, { replace: true });
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  if (step === 'test') {
    return (
      <div className="flex min-h-dvh flex-col">
        <PlacementRunner
          onExit={() => setStep('intro')}
          onFinished={(r) => {
            setResult(r);
            setStep('result');
            void refreshProfile();
            void invalidateProgress();
          }}
        />
      </div>
    );
  }

  return (
    <StepFrame
      step={n} total={total} bare={step === 'intro' || step === 'result'}
      title={{ handle: 'Welcome to Aptric!', goals: 'Set your goal', intro: 'Find your level', result: 'All set!', test: '' }[step]}
      description={{
        handle: 'First, pick the name other players will see.',
        goals: "We'll tailor your practice and track your daily progress.",
        intro: 'A quick placement test makes sure your daily challenge is not too easy and not too hard.',
        result: 'Your daily challenges will start at this level and grow with you.',
        test: '',
      }[step]}
    >
      {step === 'handle' && <HandleStep onDone={() => setStep('goals')} />}
      {step === 'goals' && <GoalStep onDone={() => setStep('intro')} />}
      {step === 'intro' && <PlacementIntro onStart={() => setStep('test')} onSkip={() => void skip()} />}
      {step === 'result' && result && <PlacementResultView result={result} onDone={() => navigate(next, { replace: true })} doneLabel="Go to today's challenge" />}
    </StepFrame>
  );
};

/** /onboarding/placement: take or retake the placement test from Settings. */
export const PlacementRetake = () => {
  const navigate = useNavigate();
  const profile = useProfile();
  const { refreshProfile } = useSession();
  const [step, setStep] = useState<'intro' | 'test' | 'result'>('intro');
  const [result, setResult] = useState<PlacementResult | null>(null);

  if (step === 'test') {
    return (
      <div className="flex min-h-dvh flex-col">
        <PlacementRunner
          onExit={() => setStep('intro')}
          onFinished={(r) => {
            setResult(r);
            setStep('result');
            void refreshProfile();
            void invalidateProgress();
            void queryClient.invalidateQueries({ queryKey: keys.lastPlacement(profile.id) });
          }}
        />
      </div>
    );
  }
  return (
    <StepFrame step={step === 'intro' ? 1 : 2} total={2} bare title={step === 'intro' ? 'Placement test' : 'Your new level'}
      description={step === 'intro' ? 'Retake the test to update your daily challenge level.' : undefined}
    >
      {step === 'intro' && (
        <>
          <PlacementIntro onStart={() => setStep('test')} retake />
          <Button variant="ghost" className="mt-2 w-full" onClick={() => navigate(SETTINGS_PATH)}>Cancel</Button>
        </>
      )}
      {step === 'result' && result && <PlacementResultView result={result} onDone={() => navigate(SETTINGS_PATH)} doneLabel="Back to settings" />}
    </StepFrame>
  );
};

export default Onboarding;
