import { CalendarCheck, Flame, GraduationCap, Lock, ScanSearch, Target, Zap, type LucideIcon } from 'lucide-react';
import type { Badge } from '@/lib/types';
import { cn } from '@/lib/utils';

type Tone = 'orange' | 'navy' | 'gold';

/**
 * Display catalogue for the badges seeded in public.badges (progression
 * migration), in their sort order. Only the look lives here: names and
 * descriptions shown for earned badges come from the API. Earned badges with
 * an unknown slug still render, with their emoji icon.
 */
const CATALOG: { slug: string; name: string; description: string; icon: LucideIcon; tone: Tone }[] = [
  { slug: 'solved-100', name: 'Centurion', description: 'Solve 100 different questions correctly.', icon: Target, tone: 'navy' },
  { slug: 'streak-7', name: 'Week Warrior', description: 'Reach a 7-day daily streak.', icon: Flame, tone: 'orange' },
  { slug: 'streak-30', name: 'Monthly Grind', description: 'Reach a 30-day daily streak.', icon: CalendarCheck, tone: 'orange' },
  { slug: 'streak-100', name: 'Unstoppable', description: 'Reach a 100-day daily streak.', icon: Zap, tone: 'gold' },
  { slug: 'topic-master', name: 'Topic Master', description: 'Answer 25+ questions correctly in one topic with 80%+ accuracy.', icon: GraduationCap, tone: 'gold' },
  { slug: 'report-accepted', name: 'Sharp Eye', description: 'Report a problem with a question that an admin accepts.', icon: ScanSearch, tone: 'navy' },
];

const TONE: Record<Tone, string> = {
  orange: 'bg-gradient-primary text-primary-foreground',
  navy: 'bg-gradient-navy text-chrome-accent',
  gold: 'bg-medal-gold text-medal-foreground',
};

interface Tile {
  key: string;
  name: string;
  sub: string | null;
  description: string;
  icon: LucideIcon | null;
  emoji: string | null;
  tone: Tone;
  earned: boolean;
}

const tiles = (badges: Badge[], showLocked: boolean): Tile[] => {
  const order = (slug: string) => {
    const i = CATALOG.findIndex((c) => c.slug === slug);
    return i < 0 ? CATALOG.length : i;
  };
  const earned: Tile[] = [...badges]
    .sort((a, b) => order(a.slug) - order(b.slug))
    .map((b) => {
      const c = CATALOG.find((x) => x.slug === b.slug);
      return {
        key: `${b.slug}-${b.topic ?? ''}`, name: b.name, sub: b.topic, description: b.description,
        icon: c?.icon ?? null, emoji: c ? null : b.icon, tone: c?.tone ?? 'navy', earned: true,
      };
    });
  if (!showLocked) return earned;
  const locked: Tile[] = CATALOG.filter((c) => !badges.some((b) => b.slug === c.slug)).map((c) => ({
    key: c.slug, name: c.name, sub: null, description: c.description, icon: c.icon, emoji: null, tone: c.tone, earned: false,
  }));
  return [...earned, ...locked];
};

/** Earned badges as brand-coloured icon tiles; locked ones (when shown) greyed out with a lock. */
export const BadgeGrid = ({ badges, showLocked = true }: { badges: Badge[]; showLocked?: boolean }) => {
  const list = tiles(badges, showLocked);
  if (list.length === 0) return <p className="text-sm text-muted-foreground">No badges yet.</p>;
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3" aria-label="Badges">
      {list.map((t) => {
        const Icon = t.icon;
        return (
          <li
            key={t.key}
            title={t.description}
            className={cn(
              'flex flex-col items-center gap-2 rounded-lg border p-2.5 text-center sm:p-3',
              t.earned ? 'bg-card shadow-sm' : 'border-dashed bg-muted/40',
            )}
          >
            <span
              className={cn(
                'relative grid size-12 place-items-center rounded-2xl text-xl shadow-sm [&_svg]:size-6',
                t.earned ? TONE[t.tone] : 'bg-muted text-muted-foreground shadow-none',
              )}
            >
              {Icon ? <Icon aria-hidden /> : <span aria-hidden>{t.emoji}</span>}
              {!t.earned && (
                <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border bg-card text-muted-foreground [&_svg]:size-3">
                  <Lock aria-hidden />
                </span>
              )}
            </span>
            <span className="min-w-0 leading-tight">
              <span className={cn('block text-xs font-bold', t.earned ? 'text-heading' : 'text-muted-foreground')}>{t.name}</span>
              <span className="block truncate text-[0.7rem] text-muted-foreground">{t.earned ? t.sub ?? 'Earned' : 'Locked'}</span>
              <span className="sr-only">: {t.description}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
};
