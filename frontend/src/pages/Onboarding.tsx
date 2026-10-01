import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, ClipboardCheck, Clock, GraduationCap, Lightbulb, Target, X } from 'lucide-react';
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
import { invalidateProgress, keys, queryClient, useExamTags } from '@/lib/queries';
import { safeNext } from '@/lib/supabase';
import type { PlacementAnswer, PlacementResult, PlacementStart } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SolveSkeleton } from './solve/SolveSkeleton';
import { fromCard } from './solve/news';

const suggestHandle = (source: string | null | undefined) => {
  const cleaned = (source ?? '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 24);
  return cleaned.length >= 3 ? cleaned : '';
};

const StepFrame = ({ step, total, title, description, children }: {
  step: number; total: number; title: string; description?: string; children: React.ReactNode;
}) => (
  <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-6 sm:py-10">
    <div className="mb-6 flex items-center justify-between">
      <Logo />
      <span className="text-sm text-muted-foreground">Step {step} of {total}</span>
    </div>
    <Progress value={step} max={total} label="Setup progress" className="mb-8" valueText={`Step ${step} of ${total}`} />
    <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
    {description && <p className="mt-2 text-muted-foreground">{description}</p>}
    <div className="mt-6 flex-1">{children}</div>
  </div>
);

// Step 1: username ----------------------------------------------------------------
const HandleStep = ({ onDone }: { onDone: () => void }) => {
  const { user, setProfile } = useSession();
  const profile = useProfile();
  const [handle, setHandle] = useState(() => suggestHandle(user?.user_metadata?.user_name ?? user?.user_metadata?.full_name ?? user?.email?.split('@')[0]));
  const [name, setName] = useState(() => profile.display_name ?? user?.user_metadata?.full_name ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const ids = { handle: useId(), name: useId() };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = handle.trim().toLowerCase();
    if (!HANDLE_RE.test(value)) { setError('Use 3–24 lowercase letters, numbers or underscores.'); return; }
    setBusy(true);
    setError('');
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setProfile(await api.updateProfile(profile.id, {
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
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden>@</span>
          <Input
            id={ids.handle} required maxLength={24} autoComplete="username" autoCapitalize="none" spellCheck={false} className="pl-7"
            value={handle} aria-invalid={!!error} aria-describedby={`${ids.handle}-hint`}
            onChange={(e) => { setHandle(e.target.value.toLowerCase()); setError(''); }}
          />
        </div>
        <FieldHint id={`${ids.handle}-hint`} error={!!error}>{error || 'Shown on leaderboards. 3–24 lowercase letters, numbers or _.'}</FieldHint>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={busy}>Continue <ArrowRight /></Button>
    </form>
  );
};

// Step 2: goal + daily target -------------------------------------------------
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
      setProfile(await api.updateProfile(profile.id, { exam_goal: goal || null, daily_target: target }));
      onDone();
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't save that. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const goals = [{ slug: '', name: 'General aptitude' }, ...(exams.data ?? [])];
  const card = (active: boolean) => cn(
    'flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border-2 bg-card px-3 py-2 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
    active ? 'border-primary bg-primary-soft text-primary-soft-foreground' : 'hover:border-primary/50',
  );

  return (
    <form className="space-y-7" onSubmit={submit}>
      <fieldset>
        <legend className="mb-3 flex items-center gap-2 font-semibold"><GraduationCap className="size-5 text-primary" aria-hidden /> What are you preparing for?</legend>
        {exams.isPending ? (
          <LoadingRegion className="grid grid-cols-2 gap-2">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12" />)}</LoadingRegion>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {goals.map((g) => (
              <label key={g.slug || 'general'} className={card(goal === g.slug)}>
                <input type="radio" name="goal" className="sr-only" checked={goal === g.slug} onChange={() => setGoal(g.slug)} />
                {goal === g.slug && <Check className="size-4 shrink-0" aria-hidden />}
                {g.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend className="mb-1 flex items-center gap-2 font-semibold"><Target className="size-5 text-primary" aria-hidden /> How many questions a day?</legend>
        <p className="mb-3 text-sm text-muted-foreground">Start small. You can change this any time in Settings.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DAILY_TARGETS.map((n) => (
            <label key={n} className={cn(card(target === n), 'flex-col justify-center gap-0 text-center')}>
              <input type="radio" name="target" className="sr-only" checked={target === n} onChange={() => setTarget(n)} />
              <span className="text-lg font-bold">{n}</span>
              <span className="text-xs font-normal">{n <= 5 ? 'Casual' : n <= 10 ? 'Regular' : n <= 20 ? 'Serious' : 'Intense'} · ~{Math.round(n * 1.2)} min</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" size="lg" className="w-full" loading={busy}>Continue <ArrowRight /></Button>
    </form>
  );
};

// Step 3: placement -----------------------------------------------------------
const PlacementIntro = ({ onStart, onSkip, retake }: { onStart: () => void; onSkip?: () => void; retake?: boolean }) => (
  <div className="space-y-6">
    <ul className="space-y-3">
      {[
        { icon: ClipboardCheck, text: '10 questions, from easy to hard, across all sections.' },
        { icon: Clock, text: 'About 10 minutes. Take your time; there is no time limit.' },
        { icon: Lightbulb, text: "No hints and no XP. If you don't know, just skip." },
        { icon: Target, text: "We'll set your daily challenge level from your score. You can retake it after a week." },
      ].map(({ icon: Icon, text }) => (
        <li key={text} className="flex gap-3"><Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden /><span>{text}</span></li>
      ))}
    </ul>
    <div className="space-y-2">
      <Button size="lg" className="w-full" onClick={onStart}>{retake ? 'Start the test' : 'Start placement test'} <ArrowRight /></Button>
      {onSkip && <Button size="lg" variant="ghost" className="w-full" onClick={onSkip}>Skip for now and start at Beginner</Button>}
    </div>
  </div>
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

const PlacementResultView = ({ result, onDone, doneLabel }: { result: PlacementResult; onDone: () => void; doneLabel: string }) => (
  <div className="space-y-6">
    <Card className="border-primary/40 bg-primary-soft text-primary-soft-foreground">
      <CardContent className="space-y-1 pt-5 text-center">
        <p className="text-sm font-medium">Your starting level</p>
        <p className="text-4xl font-black">{result.level.name}</p>
        <p className="text-sm">You got {result.correct} of {result.total} right.</p>
      </CardContent>
    </Card>
    <div>
      <h2 className="mb-2 font-semibold">How you did</h2>
      <ol className="grid grid-cols-5 gap-2" aria-label="Placement answers">
        {result.results.map((r, i) => (
          <li key={r.question_id} className={cn('flex flex-col items-center gap-0.5 rounded-md border p-2 text-xs',
            r.is_correct ? 'border-success/50 bg-success-soft text-success-soft-foreground' : 'bg-card text-muted-foreground')}
          >
            {r.is_correct ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
            <span>{DIFFICULTY_LABEL[r.difficulty]}</span>
            <span className="sr-only">Question {i + 1}: {r.is_correct ? 'correct' : r.selected_option_id ? 'wrong' : 'skipped'}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-muted-foreground">
        Questions you missed are waiting in <Link to="/progress?tab=mistakes" className="font-medium text-primary underline">Mistakes</Link> with full explanations.
      </p>
    </div>
    <Button size="lg" className="w-full" onClick={onDone}>{doneLabel} <ArrowRight /></Button>
  </div>
);

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
      setProfile(await api.updateProfile(profile.id, { onboarded_at: new Date().toISOString() }));
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
      step={n} total={total}
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
    <StepFrame step={step === 'intro' ? 1 : 2} total={2} title={step === 'intro' ? 'Placement test' : 'Your new level'}
      description={step === 'intro' ? 'Retake the test to update your daily challenge level.' : undefined}
    >
      {step === 'intro' && (
        <>
          <PlacementIntro onStart={() => setStep('test')} retake />
          <Button variant="ghost" className="mt-2 w-full" onClick={() => navigate('/profile#settings')}>Cancel</Button>
        </>
      )}
      {step === 'result' && result && <PlacementResultView result={result} onDone={() => navigate('/profile#settings')} doneLabel="Back to settings" />}
    </StepFrame>
  );
};

export default Onboarding;
