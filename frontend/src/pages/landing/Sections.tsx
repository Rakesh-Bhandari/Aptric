import type { ReactNode } from 'react';
import {
  ArrowRight, BarChart3, BookOpen, BookText, Calculator, CalendarCheck, Cpu, Flame, Layers, Lightbulb, PieChart, Puzzle, Swords, Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthDialog } from '@/context/AuthDialogContext';
import { cn } from '@/lib/utils';
import { delay, outlineOnNavy } from './shared';

export const SectionHeading = ({ id, eyebrow, title, children, className }: {
  id: string; eyebrow: string; title: ReactNode; children?: ReactNode; className?: string;
}) => (
  <div data-reveal className={cn('mx-auto max-w-2xl text-center', className)}>
    <p className="text-sm font-bold uppercase tracking-[0.14em] text-accent-text">{eyebrow}</p>
    <h2 id={id} className="mt-2 font-display text-[clamp(1.75rem,4.5vw,2.5rem)] font-extrabold leading-tight tracking-tight text-heading">
      {title}
    </h2>
    {children && <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{children}</p>}
  </div>
);

const STATS = [
  { icon: Layers, value: '5 sections', label: 'Quant to technical' },
  { icon: CalendarCheck, value: '10 questions a day', label: 'A fresh daily set' },
  { icon: Trophy, value: 'Weekly leagues', label: 'Bronze to Diamond' },
  { icon: Lightbulb, value: 'Every answer explained', label: 'Learn from each mistake' },
];

export const StatStrip = () => (
  <section aria-label="Aptric at a glance" className="relative z-10 mx-auto -mt-6 max-w-5xl px-4 sm:-mt-10 sm:px-6">
    <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border shadow-md lg:grid-cols-4">
      {STATS.map(({ icon: Icon, value, label }, i) => (
        <li key={value} data-reveal style={delay(i)} className="flex items-start gap-3 bg-card p-4 sm:p-5">
          <Icon className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden />
          <div className="min-w-0">
            <p className="font-display text-sm font-extrabold leading-snug tracking-tight text-heading sm:text-base">{value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{label}</p>
          </div>
        </li>
      ))}
    </ul>
  </section>
);

const FEATURES = [
  { icon: Flame, title: 'Daily challenge', text: 'Ten fresh questions every day, matched to your level. Keep your streak alive.' },
  { icon: BookOpen, title: 'Practice by topic', text: 'From percentages to puzzles. Mastery stars show what you’ve nailed and what needs work.' },
  { icon: Swords, title: 'Leagues and contests', text: 'Climb a weekly league of up to 30 players, or race everyone in a live contest.' },
  { icon: BarChart3, title: 'See your progress', text: 'A skill map, your history, and every mistake with a clear explanation.' },
];

export const Features = () => (
  <section id="features" tabIndex={-1} aria-labelledby="features-title" className="scroll-mt-20 px-4 py-16 focus:outline-none sm:px-6 sm:py-24">
    <SectionHeading id="features-title" eyebrow="What you get" title="Everything you need to get exam-ready">
      Ten focused minutes a day beat a weekend of cramming. Aptric keeps you coming back.
    </SectionHeading>
    <ul className="mx-auto mt-10 grid max-w-5xl gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
      {FEATURES.map(({ icon: Icon, title, text }, i) => (
        <li
          key={title} data-reveal style={delay(i)}
          className="group rounded-lg border bg-card p-6 shadow-sm transition-[box-shadow,transform,translate] duration-200 ease-out hover:-translate-y-1 hover:shadow-md"
        >
          <div className="grid size-12 place-items-center rounded-md bg-primary-soft text-accent-text">
            <Icon className="size-6" aria-hidden />
          </div>
          <h3 className="mt-4 text-lg font-bold tracking-tight text-heading">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
        </li>
      ))}
    </ul>
  </section>
);

const STEPS = [
  { title: 'Pick your goal', text: 'Choose your exam and a daily target, then take a 10-question placement test that sets your starting level.' },
  { title: 'Solve your daily set', text: 'A new set lands every day at local midnight. Use a hint if you’re stuck and read the explanation after every answer.' },
  { title: 'Climb your league', text: 'Earn XP, keep your streak and move up each week, from Bronze all the way to Diamond.' },
];

export const HowItWorks = () => (
  <section id="how-it-works" tabIndex={-1} aria-labelledby="how-title" className="scroll-mt-20 bg-card px-4 py-16 focus:outline-none sm:px-6 sm:py-24">
    <SectionHeading id="how-title" eyebrow="How it works" title="Three steps to a daily habit" />
    <ol className="relative mx-auto mt-12 grid max-w-5xl gap-10 md:grid-cols-3 md:gap-8">
      {/* Connecting line between the numerals (desktop). */}
      <span aria-hidden className="absolute left-[16.67%] right-[16.67%] top-7 hidden h-0.5 bg-gradient-primary opacity-60 md:block" />
      {STEPS.map(({ title, text }, i) => (
        <li key={title} data-reveal style={delay(i)} className="relative flex gap-4 md:flex-col md:items-center md:text-center">
          <span
            aria-hidden
            className="grid size-14 shrink-0 place-items-center rounded-full bg-chrome font-display text-2xl font-extrabold text-chrome-accent shadow-md ring-8 ring-card"
          >
            {i + 1}
          </span>
          <div>
            <h3 className="text-lg font-bold tracking-tight text-heading"><span className="sr-only">Step {i + 1}: </span>{title}</h3>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">{text}</p>
          </div>
        </li>
      ))}
    </ol>
  </section>
);

// Topic names come from the question bank's taxonomy (supabase/migrations/*_taxonomy_seed.sql).
const SECTIONS = [
  { icon: Calculator, name: 'Quantitative Aptitude', topics: ['Arithmetic', 'Algebra', 'Time, Work & Distance', 'Geometry & Mensuration', 'Counting & Probability'] },
  { icon: Puzzle, name: 'Logical Reasoning', topics: ['Arrangements & Puzzles', 'Deductive Reasoning', 'Clocks & Calendars', 'Non-Verbal Reasoning'] },
  { icon: BookText, name: 'Verbal Ability', topics: ['Reading', 'Grammar & Usage', 'Vocabulary'] },
  { icon: PieChart, name: 'Data Interpretation', topics: ['Charts', 'Tables & Caselets', 'Mixed Graphs'] },
  { icon: Cpu, name: 'Technical Aptitude', topics: ['Output Prediction', 'OOP', 'DBMS', 'Operating Systems', 'Computer Networks'] },
];

export const SectionsShowcase = () => (
  <section id="sections" tabIndex={-1} aria-labelledby="sections-title" className="scroll-mt-20 px-4 py-16 focus:outline-none sm:px-6 sm:py-24">
    <SectionHeading id="sections-title" eyebrow="The question bank" title="Five sections, every topic that matters">
      Easy, medium and hard questions, tagged by exam, with Markdown and proper maths.
    </SectionHeading>
    <ul className="mx-auto mt-10 grid max-w-5xl gap-4 sm:mt-12 sm:grid-cols-2 lg:grid-cols-6">
      {SECTIONS.map(({ icon: Icon, name, topics }, i) => (
        <li
          key={name} data-reveal style={delay(i)}
          // Three cards on the first row and two centred-width cards on the second (lg).
          className={cn('rounded-lg border bg-card p-5 shadow-sm lg:col-span-2', i >= 3 && 'lg:col-span-3')}
        >
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-chrome text-chrome-accent">
              <Icon className="size-5" aria-hidden />
            </div>
            <h3 className="font-bold leading-tight tracking-tight text-heading">{name}</h3>
          </div>
          <ul aria-label={`${name} topics`} className="mt-4 flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <li key={t} className="rounded-full bg-navy-soft px-2.5 py-1 text-xs font-semibold text-navy-soft-foreground">{t}</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  </section>
);

export const FinalCta = () => {
  const { openAuth } = useAuthDialog();
  return (
    <section aria-labelledby="cta-title" data-theme="dark" className="relative isolate overflow-hidden bg-gradient-hero px-4 py-16 text-center text-chrome-foreground sm:px-6 sm:py-20">
      <div aria-hidden className="absolute inset-0 -z-10 bg-dots [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div aria-hidden className="absolute left-1/2 top-full -z-10 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div data-reveal className="mx-auto max-w-2xl">
        <h2 id="cta-title" className="font-display text-[clamp(2rem,6vw,3.25rem)] font-extrabold leading-[1.05] tracking-tight">
          Start your streak <span className="text-gradient-brand">today.</span>
        </h2>
        <p className="mt-4 text-base text-chrome-muted-foreground sm:text-lg">Free, and it works great on your phone.</p>
        <div className="mt-8 flex flex-col justify-center gap-3 min-[420px]:flex-row">
          <Button size="lg" className="px-7" onClick={() => openAuth({ mode: 'signup', next: '/' })}>
            Get Started <ArrowRight aria-hidden />
          </Button>
          <button type="button" className={outlineOnNavy} onClick={() => openAuth({ mode: 'signin', next: '/' })}>
            Sign in
          </button>
        </div>
      </div>
    </section>
  );
};
