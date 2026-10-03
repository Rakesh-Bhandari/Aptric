import type { MouseEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthDialog } from '@/context/AuthDialogContext';
import { HeroMountain } from './HeroMountain';
import { outlinePill, scrollToSection } from './shared';

const EXAMS = ['TCS NQT', 'Infosys', 'AMCAT', 'CAT', 'GATE', 'Bank PO', 'SSC'];

/**
 * The spec's usage example: a light hero (pale page colour into a lavender and
 * blue mist) with a navy headline in light mode, midnight with blue and violet
 * glows in dark mode. It follows the page theme, so the header sits over it with
 * the page's own tokens (useHeaderOverlay(…, 'theme') in Landing).
 */
export const Hero = () => {
  const { openAuth } = useAuthDialog();
  const learnMore = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    scrollToSection('features');
    history.replaceState(history.state, '', '#features');
  };

  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-background bg-gradient-hero">
      {/* Fade the hero's foot into the page colour, under the stat strip. Decorative. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-24 bg-gradient-to-b from-transparent to-background" />

      <div className="mx-auto grid max-w-5xl items-center gap-6 px-4 pb-0 pt-24 sm:px-6 sm:pt-28 lg:grid-cols-[1.1fr_1fr] lg:gap-4 lg:pb-32 lg:pt-32">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <span className="mr-0.5 uppercase tracking-wider text-violet-text">For</span>
            <ul aria-label="Exams covered" className="contents">
              {EXAMS.map((exam) => (
                <li key={exam} className="rounded-full bg-violet-soft px-2.5 py-1 leading-none text-violet-soft-foreground">{exam}</li>
              ))}
            </ul>
          </div>

          <h1
            id="hero-title"
            className="mt-6 whitespace-nowrap font-display text-[clamp(2.75rem,11vw,5rem)] font-extrabold leading-[0.98] tracking-[-0.035em] text-heading"
          >
            <span className="block">Practice.</span>
            <span className="block">Compete.</span>
            {/* Inline, so the gradient spans the word rather than the whole line. */}
            <span className="block pb-[0.06em]"><span className="text-gradient-brand">Grow.</span></span>
          </h1>

          <p className="mt-5 max-w-xl text-lg font-semibold leading-snug text-heading sm:text-xl">
            A platform for thinkers, builders and problem solvers.
          </p>
          <p className="mt-2 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Daily aptitude challenges, focused practice and friendly leagues, for placements, CAT, banking and more.
          </p>

          <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row">
            <Button size="lg" className="px-7" onClick={() => openAuth({ mode: 'signup', next: '/' })}>
              Get Started <ArrowRight aria-hidden />
            </Button>
            <a href="#features" onClick={learnMore} className={outlinePill}>Learn More</a>
          </div>
          <button
            type="button"
            onClick={() => openAuth({ mode: 'signin', next: '/' })}
            className="mt-3 inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-muted-foreground underline decoration-current/30 underline-offset-4 transition-colors hover:text-heading hover:decoration-current"
          >
            I already have an account
          </button>
        </div>

        {/* Phones and tablets: a shorter, cropped strip under the text. */}
        <div aria-hidden className="-mx-4 flex justify-center overflow-hidden sm:-mx-6 lg:hidden">
          <HeroMountain className="max-w-[24rem] [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)] sm:max-w-md" />
        </div>
      </div>

      {/* Desktop: the full peak, anchored to the hero's foot on the right. Sized by width, so the box never shifts. */}
      <HeroMountain className="absolute bottom-10 right-[max(-4rem,calc(50%-36rem))] -z-[1] hidden w-[min(58vw,46rem)] lg:block [mask-image:linear-gradient(to_right,transparent,black_14%,black_86%,transparent)]" />
    </section>
  );
};
