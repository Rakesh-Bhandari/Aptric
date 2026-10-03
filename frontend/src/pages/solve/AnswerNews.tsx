import type { ReactNode } from 'react';
import { Award, Flame, Snowflake, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import type { AnswerResult } from '@/lib/types';
import { cn } from '@/lib/utils';

const Chip = ({ className, children }: { className?: string; children: ReactNode }) => (
  <li
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold motion-safe:animate-pop-in [&_svg]:size-4 [&_svg]:shrink-0',
      className,
    )}
  >
    {children}
  </li>
);

/** Celebration chips under the answer banner: XP in blue, level up in violet, the streak with its flame, badges, rating. */
export const AnswerNews = ({ result }: { result: AnswerResult | null }) => {
  const p = result?.progress;
  if (!result || !p) return null;
  const streakDone = p.set_complete && result.current_streak > 0;
  if (!p.leveled_up && !p.new_badges.length && !p.rating_change && !p.freezes_earned && !p.bonus_xp && !streakDone) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Progress news">
      {p.leveled_up && (
        <Chip className="bg-violet text-violet-foreground"><TrendingUp aria-hidden /> Level {p.level} reached!</Chip>
      )}
      {p.bonus_xp > 0 && (
        <Chip className="bg-primary bg-gradient-primary text-primary-foreground"><Sparkles aria-hidden /> +{p.bonus_xp} bonus XP</Chip>
      )}
      {streakDone && (
        <Chip className="border bg-card text-heading"><Flame className="text-streak" aria-hidden /> {result.current_streak}-day streak</Chip>
      )}
      {p.new_badges.map((b) => (
        <Chip key={`${b.slug}-${b.topic ?? ''}`} className="bg-navy-soft text-navy-soft-foreground">
          <Award className="text-gold" aria-hidden /> New badge: <span aria-hidden>{b.icon}</span> {b.name}{b.topic ? ` (${b.topic})` : ''}
        </Chip>
      ))}
      {p.freezes_earned > 0 && (
        <Chip className="bg-navy-soft text-navy-soft-foreground"><Snowflake aria-hidden /> Streak freeze earned</Chip>
      )}
      {p.rating_change && (
        <Chip className={p.rating_change.delta >= 0 ? 'bg-success-soft text-success-soft-foreground' : 'bg-danger-soft text-danger-soft-foreground'}>
          {p.rating_change.delta >= 0 ? <TrendingUp aria-hidden /> : <TrendingDown aria-hidden />}
          Rating {p.rating_change.delta >= 0 ? 'up' : 'down'} {Math.abs(p.rating_change.delta)} to {p.rating_change.after}
        </Chip>
      )}
    </ul>
  );
};
