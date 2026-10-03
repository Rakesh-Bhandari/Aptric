import type { MouseEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthDialog } from '@/context/AuthDialogContext';
import { HeroMountain } from './HeroMountain';
import { outlineOnNavy, scrollToSection } from './shared';

const EXAMS = ['TCS NQT', 'Infosys', 'AMCAT', 'CAT', 'GATE', 'Bank PO', 'SSC'];

export const Hero = () => {
  const { openAuth } = useAuthDialog();
  const learnMore = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    scrollToSection('features');
    history.replaceState(history.state, '', '#features');
  };

  return (
    <section aria-labelledby="hero-title" data-theme="dark" className="relative isolate overflow-hidden bg-gradient-hero text-chrome-foreground">
      {/* Calm background: a dot grid that fades out, and an orange glow behind the peak. Decorative. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-dots [mask-image:radial-gradient(ellipse_at_30%_20%,black,transparent_70%)]" />
      <div aria-hidden className="absolute -right-32 top-1/3 -z-10 size-[28rem] rounded-full bg-primary/10 blur-3xl lg:right-10" />

      <div className="mx-auto grid max-w-5xl items-center gap-6 px-4 pb-0 pt-24 sm:px-6 sm:pt-28 lg:grid-cols-[1.15fr_1fr] lg:gap-4 lg:pb-24 lg:pt-32">
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-chrome-muted-foreground">
            <span className="mr-0.5 uppercase tracking-wider text-chrome-accent">For</span>
            <ul aria-label="Exams covered" className="contents">
              {EXAMS.map((exam) => (
                <li key={exam} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 leading-none">{exam}</li>
              ))}
            </ul>
          </div>

          <h1
            id="hero-title"
            className="mt-6 font-display text-[clamp(2.75rem,11vw,4.75rem)] whitespace-nowrap font-extrabold leading-[0.98] tracking-[-0.035em]"
          >
            <span className="block">Practice.</span>
            <span className="block">Compete.</span>
            <span className="block text-gradient-brand pb-[0.06em]">Get placed.</span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-chrome-muted-foreground sm:text-lg">
            A daily aptitude platform for thinkers, builders and problem solvers. Short daily challenges, focused practice and
            friendly leagues, for placements, CAT, banking and more.
          </p>

          <div className="mt-8 flex flex-col gap-3 min-[420px]:flex-row">
            <Button size="lg" className="px-7" onClick={() => openAuth({ mode: 'signup', next: '/' })}>
              Get Started <ArrowRight aria-hidden />
            </Button>
            <a href="#features" onClick={learnMore} className={outlineOnNavy}>Learn More</a>
          </div>
          <button
            type="button"
            onClick={() => openAuth({ mode: 'signin', next: '/' })}
            className="mt-3 inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-chrome-muted-foreground underline decoration-white/30 underline-offset-4 transition-colors hover:text-chrome-foreground hover:decoration-current"
          >
            I already have an account
          </button>
        </div>

        {/* Desktop: the full peak. Phones: a shorter, cropped strip under the text. */}
        <HeroMountain className="hidden self-end lg:-mb-24 lg:-mr-16 lg:block lg:[mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)]" />
<div aria-hidden className="-mx-4 flex justify-center sm:-mx-6 lg:hidden">
          <HeroMountain className="max-w-[22rem] [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)] sm:max-w-md" />
        </div>
      </div>
    </section>
  );
};
