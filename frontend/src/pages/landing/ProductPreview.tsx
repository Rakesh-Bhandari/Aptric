import { Check, Clock, Flame, Keyboard, Lightbulb, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { SectionHeading } from './Sections';

const POINTS = [
  { icon: ListChecks, text: 'One question at a time, with a timer that keeps you honest.' },
  { icon: Keyboard, text: 'Keyboard shortcuts: press 1 to 4 to pick, Enter to check.' },
  { icon: Lightbulb, text: 'Stuck? Take a hint, or give up and see the answer.' },
  { icon: Check, text: 'A clear explanation after every question.' },
];

const OPTIONS = ['No change', '4% decrease', '4% increase', '2% decrease'];
const SELECTED = 1;

/** A static mock of the solve screen, built from the real UI primitives. Purely illustrative. */
const QuestionMock = () => (
  <Card className="relative overflow-hidden p-5 shadow-lg sm:p-6">
    <div className="flex items-center justify-between gap-3 text-sm font-semibold">
      <span className="text-muted-foreground">Question 4 of 10</span>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1 tabular-nums text-heading"><Clock className="size-4 text-muted-foreground" />01:24</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-primary-soft-foreground">
          <Flame className="size-4 fill-streak text-streak" />12
        </span>
      </div>
    </div>
    <Progress value={4} max={10} label="Daily set progress" className="mt-3 h-1.5" />
    <div className="mt-5 flex flex-wrap gap-1.5">
      <Badge variant="navy">Quantitative Aptitude</Badge>
      <Badge variant="muted">Medium</Badge>
    </div>
    <p className="mt-3 font-semibold leading-relaxed text-heading">
      A shirt’s price is raised by 20% and then cut by 20%. What is the net change in its price?
    </p>
    <div className="mt-4 space-y-2.5">
      {OPTIONS.map((opt, i) => {
        const selected = i === SELECTED;
        return (
          <div
            key={opt}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-md border-2 px-3 text-sm font-medium',
              selected ? 'border-primary bg-primary-soft text-heading' : 'border-border bg-card text-foreground',
            )}
          >
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {i + 1}
            </span>
            {opt}
          </div>
        );
      })}
    </div>
    <div className="mt-5 flex h-12 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground shadow-sm">Check answer</div>
  </Card>
);

export const ProductPreview = () => (
  <section id="preview" tabIndex={-1} aria-labelledby="preview-title" className="scroll-mt-20 bg-card px-4 py-16 focus:outline-none sm:px-6 sm:py-24">
    <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div>
        <SectionHeading id="preview-title" eyebrow="Built for focus" title="Practice that feels like the real test" className="mx-0 text-left" />
        <ul className="mt-6 space-y-3.5">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} data-reveal className="flex items-start gap-3 text-foreground">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft text-accent-text"><Icon className="size-4" aria-hidden /></span>
              <span className="pt-1">{text}</span>
            </li>
          ))}
        </ul>
      </div>
      <figure data-reveal className="relative mx-auto w-full max-w-md">
        {/* Soft glow behind the card. Decorative. */}
        <div aria-hidden className="absolute -inset-6 -z-0 rounded-[2rem] bg-gradient-primary opacity-15 blur-2xl" />
        <div aria-hidden className="relative [&_svg]:shrink-0" inert>
          <QuestionMock />
        </div>
        <figcaption className="sr-only">
          Preview of a daily question: a percentages problem with four options, the second one selected, a timer at 1 minute 24 seconds and a 12-day streak.
        </figcaption>
      </figure>
    </div>
  </section>
);
