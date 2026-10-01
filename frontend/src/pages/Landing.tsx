import { BarChart3, BookOpen, Flame, Swords, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthDialog } from '@/context/AuthDialogContext';

const FEATURES = [
  { icon: Flame, title: 'A daily challenge', text: 'Ten fresh questions every day, matched to your level. Keep your streak alive.' },
  { icon: BookOpen, title: 'Practice by topic', text: 'From percentages to puzzles. Mastery stars show what you’ve nailed and what needs work.' },
  { icon: Swords, title: 'Leagues and contests', text: 'Climb a weekly league of up to 30 players, or race everyone in a live contest.' },
  { icon: BarChart3, title: 'See your progress', text: 'A skill map, your history, and every mistake with a clear explanation.' },
];

/** "/" for signed-out visitors. */
const Landing = () => {
  const { openAuth } = useAuthDialog();
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
      <section className="mx-auto max-w-2xl text-center">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary-soft-foreground">
          <Trophy className="size-4" aria-hidden /> For placements, CAT, banking and more
        </p>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Get better at aptitude, one day at a time.</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Short daily challenges, focused practice and friendly competition. Free, and it works great on your phone.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" onClick={() => openAuth({ mode: 'signup', next: '/' })}>Create a free account</Button>
          <Button size="lg" variant="outline" onClick={() => openAuth({ mode: 'signin', next: '/' })}>I already have an account</Button>
        </div>
      </section>
      <section aria-label="What you get" className="mt-16 grid gap-4 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-lg border bg-card p-5">
            <div className="mb-3 grid size-10 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground"><Icon className="size-5" aria-hidden /></div>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
};

export default Landing;
