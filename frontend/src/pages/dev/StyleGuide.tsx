import { useState } from 'react';
import { ArrowRight, Flame, Moon, Sparkles, Sun, Trophy } from 'lucide-react';
import { AptricLogo, AptricMark, AptricWordmark } from '@/components/brand';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { FieldHint, Input, Label, Select, Textarea } from '@/components/ui/input';
import { Page, PageHeader, StatTile } from '@/components/ui/page';
import { Progress, Ring } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { MasteryStars } from '@/components/ui/stars';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePreferences } from '@/context/PreferencesContext';

/*
 * Dev-only token and component preview (/dev/styleguide). Routed only when
 * import.meta.env.DEV, so production builds drop it.
 */

const TOKENS: [group: string, names: string[]][] = [
  ['Surfaces', ['background', 'card', 'muted', 'border', 'input']],
  ['Text', ['foreground', 'heading', 'card-foreground', 'muted-foreground', 'accent-text']],
  ['Blue', ['primary', 'primary-strong', 'primary-foreground', 'primary-soft', 'primary-soft-foreground', 'primary-soft-hover', 'primary-soft-hover-foreground', 'primary-wash', 'ring', 'ring-on-navy']],
  ['Violet and Light Blue', ['violet', 'violet-strong', 'violet-foreground', 'violet-soft', 'violet-soft-foreground', 'violet-text', 'sky']],
  ['Navy', ['navy', 'navy-strong', 'navy-foreground', 'navy-soft', 'navy-soft-foreground', 'navy-muted-foreground', 'brand-navy']],
  ['Header and chrome', ['header', 'header-foreground', 'header-muted-foreground', 'chrome', 'chrome-deep', 'chrome-raised', 'chrome-foreground', 'chrome-muted-foreground', 'chrome-accent']],
  ['Charts', ['chart-accent', 'muted', 'heat-1', 'heat-2', 'heat-3', 'heat-4']],
  ['Semantic warm', ['streak', 'gold']],
  ['Status', ['success', 'success-soft', 'success-soft-foreground', 'danger', 'danger-soft', 'danger-soft-foreground', 'warning', 'warning-soft', 'warning-soft-foreground', 'gold']],
  ['League', ['tier-bronze', 'tier-silver', 'tier-gold', 'tier-platinum', 'tier-diamond', 'medal-gold', 'medal-silver', 'medal-bronze', 'metal-bronze-lo', 'metal-silver-lo', 'metal-gold-lo', 'metal-platinum-lo', 'metal-diamond-lo']],
  ['Theme previews', ['preview-light-bg', 'preview-light-card', 'preview-light-line', 'preview-dark-bg', 'preview-dark-card', 'preview-dark-line']],
];

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">{title}</h2>
    {children}
  </section>
);

/*
 * The light hero's tokens, pinned so the light sample still shows in dark mode
 * (the dark sample uses data-theme="dark", which redefines the tokens below it).
 */
const LIGHT_HERO = {
  '--heading': '#0a2540',
  '--gradient-text': 'linear-gradient(90deg, #2563eb 0%, #7c3aed 100%)',
  '--gradient-hero':
    'radial-gradient(60% 55% at 85% 20%, rgb(237 233 254 / 0.95) 0%, transparent 70%), radial-gradient(50% 50% at 65% 85%, rgb(224 242 254 / 0.9) 0%, transparent 70%), linear-gradient(160deg, #f8fafc 0%, #f8fafc 40%, #eef2ff 100%)',
} as React.CSSProperties;

const GRADIENTS = ['primary', 'primary-hover', 'secondary', 'navy', 'hero'] as const;

/** A logo tile on a fixed surface colour (white, the page, navy, midnight). */
const LogoTile = ({ bg, label, dark }: { bg: string; label: string; dark?: boolean }) => (
  <div className="flex flex-col items-center gap-4 rounded-lg border p-5" style={{ background: bg }}>
    <AptricLogo size="lg" stacked variant={dark ? 'onDark' : 'onLight'} />
    <div className="flex flex-wrap items-center justify-center gap-4">
      <AptricLogo size="sm" variant={dark ? 'onDark' : 'onLight'} />
      <AptricLogo size="md" variant={dark ? 'onDark' : 'onLight'} />
      <AptricMark className="h-10" variant={dark ? 'onDark' : 'onLight'} />
    </div>
    <span className={dark ? 'font-mono text-xs text-navy-muted-foreground' : 'font-mono text-xs text-brand-navy'}>{label}</span>
  </div>
);

const Swatch = ({ name }: { name: string }) => (
  <div className="overflow-hidden rounded-md border bg-card">
    <div className="h-12 border-b" style={{ background: `var(--${name})` }} />
    <div className="px-2 py-1.5 font-mono text-[11px] leading-tight">--{name}</div>
  </div>
);

const StyleGuide = () => {
  const { resolvedTheme, setTheme } = usePreferences();
  const [progress, setProgress] = useState(64);
  const dark = resolvedTheme === 'dark';

  return (
    <Page className="max-w-6xl space-y-10">
      <PageHeader
        title="Style guide"
        description="Brand tokens and UI primitives. Dev builds only."
        actions={
          <Button variant="outline" size="sm" onClick={() => setTheme(dark ? 'light' : 'dark')}>
            {dark ? <Sun /> : <Moon />} {dark ? 'Light' : 'Dark'} theme
          </Button>
        }
      />

      <Section title="Logo">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <LogoTile bg="#ffffff" label="on white (#FFFFFF)" />
          <LogoTile bg="#f8fafc" label="on the page (#F8FAFC)" />
          <LogoTile bg="#0a2540" label="on navy (#0A2540)" dark />
          <LogoTile bg="#0a1020" label="on midnight (#0A1020)" dark />
        </div>
        <div id="logo-reference" className="grid grid-cols-2 items-center gap-4 rounded-lg border bg-white p-4">
          <figure className="flex flex-col items-center gap-2">
            <img src="/brand/aptric-logo-wordmark.jpg" alt="Original logo artwork" className="h-40 w-auto sm:h-56" />
            <figcaption className="text-xs text-brand-navy">Source JPG</figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-2">
            <AptricLogo size="lg" stacked variant="onLight" className="h-40 justify-center sm:h-56" />
            <figcaption className="text-xs text-brand-navy">AptricLogo (SVG)</figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-2">
            <img src="/brand/aptric-mark.jpg" alt="Original mark artwork" className="h-28 w-auto sm:h-44" />
            <figcaption className="text-xs text-brand-navy">Source JPG</figcaption>
          </figure>
          <figure className="flex flex-col items-center gap-2">
            <AptricMark variant="onLight" className="h-28 sm:h-44" />
            <figcaption className="text-xs text-brand-navy">AptricMark (SVG)</figcaption>
          </figure>
        </div>
        <div className="flex flex-wrap items-end gap-6 rounded-lg border bg-card p-4">
          <AptricMark className="h-6" />
          <AptricMark className="h-10" />
          <AptricMark className="h-16" title="Aptric" />
          <AptricWordmark className="text-3xl" />
          <span className="text-sm text-muted-foreground">Theme-aware (card surface): the navy leg lifts and the wordmark turns white in dark mode.</span>
        </div>
      </Section>

      <Section title="Colour tokens">
        <div className="space-y-4">
          {TOKENS.map(([group, names]) => (
            <div key={group} className="space-y-2">
              <h3 className="text-sm font-semibold text-heading">{group}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {names.map((n) => <Swatch key={n} name={n} />)}
              </div>
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {GRADIENTS.map((g) => (
              <div key={g} className="flex h-20 items-end rounded-lg border p-3" style={{ backgroundImage: `var(--gradient-${g})` }}>
                <span className="rounded-full bg-card px-2 py-0.5 font-mono text-[11px] text-foreground">--gradient-{g}</span>
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(['sm', 'md', 'lg', 'glow'] as const).map((s) => (
              <div key={s} className="grid h-20 place-items-center rounded-lg bg-card font-mono text-xs" style={{ boxShadow: `var(--shadow-${s})` }}>--shadow-{s}</div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Typography">
        <div className="space-y-3 rounded-lg border bg-card p-5">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Gradient text on the light and the midnight hero (scoped themes, so both show in either theme). */}
            <p style={LIGHT_HERO} className="rounded-lg bg-gradient-hero p-5 font-display text-5xl font-extrabold leading-[0.95] tracking-tight text-heading">
              Practice.<br />Compete.<br /><span className="text-gradient-brand">Grow.</span>
            </p>
            <p data-theme="dark" className="rounded-lg bg-gradient-hero p-5 font-display text-5xl font-extrabold leading-[0.95] tracking-tight text-heading">
              Practice.<br />Compete.<br /><span className="text-gradient-brand">Grow.</span>
            </p>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-heading">Heading 1 · 30/800</h1>
          <h2 className="text-2xl font-bold tracking-tight text-heading">Heading 2 · 24/700</h2>
          <h3 className="text-lg font-bold tracking-tight text-heading">Heading 3 · 18/700</h3>
          <p className="max-w-prose">Body · 16/400. Daily aptitude challenges, focused practice and friendly competition for placement and exam prep.</p>
          <p className="text-sm text-muted-foreground">Muted · 14/400. Secondary text and descriptions.</p>
          <p className="text-sm">Inline <a href="#top" className="font-semibold text-accent-text underline">accent link</a> uses --accent-text.</p>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="space-y-4 rounded-lg border bg-card p-5">
          {(['default', 'secondary', 'outline', 'navy', 'violet', 'ghost', 'danger', 'link'] as const).map((v) => (
            <div key={v} className="flex flex-wrap items-center gap-3">
              <span className="w-20 font-mono text-xs text-muted-foreground">{v}</span>
              <Button variant={v} size="sm">Small</Button>
              <Button variant={v}>Get Started <ArrowRight /></Button>
              <Button variant={v} size="lg">Large</Button>
              <Button variant={v} size="icon" aria-label="Sparkle"><Sparkles /></Button>
              <Button variant={v} loading>Loading</Button>
              <Button variant={v} disabled>Disabled</Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gradient-navy p-5">
          <span className="w-full text-sm font-semibold text-navy-foreground">On a navy hero</span>
          <Button size="lg">Get Started <ArrowRight /></Button>
          <Button variant="outline" size="lg" className="border-navy-foreground/80 text-navy-foreground hover:bg-white/10 dark:border-navy-foreground/80 dark:text-navy-foreground">Learn More</Button>
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Default card</CardTitle>
              <CardDescription>White, 1px border, --shadow-sm, 16px radius.</CardDescription>
            </CardHeader>
            <CardContent>Body text sits in --card-foreground.</CardContent>
            <CardFooter><Button size="sm">Action</Button></CardFooter>
          </Card>
          <Card variant="navy">
            <CardHeader>
              <CardTitle>Navy card</CardTitle>
              <CardDescription>variant="navy" for feature and hero cards.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2"><Flame className="size-5 text-sky" aria-hidden /> 12-day streak</CardContent>
            <CardFooter><Button size="sm">Continue <ArrowRight /></Button></CardFooter>
          </Card>
          <Card variant="soft">
            <CardHeader>
              <CardTitle>Soft card</CardTitle>
              <CardDescription>variant="soft": Soft Purple for highlighted sections.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-2"><Trophy className="size-5 text-violet-text" aria-hidden /> Gold league unlocked</CardContent>
            <CardFooter><Button size="sm" variant="violet">View badge</Button></CardFooter>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Streak" value="12" hint="days" icon={<Flame className="text-streak" />} />
            <StatTile label="Accuracy" value="78%" />
            <StatTile label="Level" value="7" tone="violet" icon={<Trophy />} />
            <StatTile label="XP" value="1,240" />
          </div>
        </div>
      </Section>

      <Section title="Badges, avatars, stars">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-5">
          {(['default', 'blue', 'navy', 'solid', 'violet', 'muted', 'success', 'danger', 'warning', 'outline'] as const).map((v) => (
            <Badge key={v} variant={v}>{v}</Badge>
          ))}
          <Avatar name="Asha Rao" />
          <Avatar name="Vikram" className="size-11" />
          {[0, 1, 2, 3].map((s) => <MasteryStars key={s} stars={s} />)}
        </div>
      </Section>

      <Section title="Inputs">
        <div className="grid gap-4 rounded-lg border bg-card p-5 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="sg-name">Display name</Label><Input id="sg-name" placeholder="Your name" /><FieldHint>Shown on leaderboards.</FieldHint></div>
          <div className="space-y-1.5"><Label htmlFor="sg-err">Handle</Label><Input id="sg-err" aria-invalid="true" defaultValue="bad handle" /><FieldHint error>Use letters, numbers and underscores.</FieldHint></div>
          <div className="space-y-1.5"><Label htmlFor="sg-sel">Goal</Label><Select id="sg-sel"><option>Campus placements</option><option>Bank exams</option></Select></div>
          <div className="space-y-1.5"><Label htmlFor="sg-ta">Report</Label><Textarea id="sg-ta" placeholder="What went wrong?" /></div>
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="daily">
          <TabsList>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="all">All time</TabsTrigger>
          </TabsList>
          <TabsContent value="daily" className="text-sm text-muted-foreground">Daily leaderboard content.</TabsContent>
          <TabsContent value="weekly" className="text-sm text-muted-foreground">Weekly leaderboard content.</TabsContent>
          <TabsContent value="all" className="text-sm text-muted-foreground">All-time leaderboard content.</TabsContent>
        </Tabs>
      </Section>

      <Section title="Progress">
        <div className="flex flex-wrap items-center gap-6 rounded-lg border bg-card p-5">
          <div className="min-w-56 flex-1 space-y-2">
            <Progress value={progress} label="Demo progress" />
            <Progress value={30} label="Thin" className="h-1.5" />
            <Button size="sm" variant="secondary" onClick={() => setProgress((p) => (p + 18) % 118)}>Step</Button>
          </div>
          <Ring value={3} max={5} label="3 of 5"><span className="text-sm font-bold">3/5</span></Ring>
          <Ring value={5} max={5} label="5 of 5"><span className="text-sm font-bold">5/5</span></Ring>
          <Ring value={7} max={10} size={88} label="7 of 10"><span className="text-base font-bold">70%</span></Ring>
        </div>
      </Section>

      <Section title="States and dialog">
        <div className="grid gap-4 md:grid-cols-3">
          <EmptyState icon={<Sparkles />} title="Nothing here yet" action={<Button size="sm">Start practising</Button>}>Solve a question to see it here.</EmptyState>
          <ErrorState error={new Error('Network error')} onRetry={() => undefined} />
          <div className="space-y-2 rounded-lg border bg-card p-5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Dialog>
              <DialogTrigger asChild><Button variant="navy" size="sm" className="mr-2 mt-2">Open dialog</Button></DialogTrigger>
              <DialogContent title="Report a problem" description="Tell us what looks wrong with this question.">
                <Textarea aria-label="Details" placeholder="Details" />
                <div className="mt-4 flex justify-end gap-2"><Button variant="ghost">Cancel</Button><Button>Send</Button></div>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild><Button variant="secondary" size="sm" className="mt-2">Open brand dialog</Button></DialogTrigger>
              <DialogContent variant="brand" title="Welcome back" description="Sign in to keep your streak.">
                <Input aria-label="Email" placeholder="you@college.edu" />
                <Button className="mt-4 w-full">Continue <ArrowRight /></Button>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </Section>
    </Page>
  );
};

export default StyleGuide;
