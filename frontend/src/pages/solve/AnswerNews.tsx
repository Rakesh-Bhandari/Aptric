import { Award, Flame, TrendingUp } from 'lucide-react';
import type { AnswerResult } from '@/lib/types';

/** Inline celebration shown in the result card when an answer levels you up or earns a badge. */
export const AnswerNews = ({ result }: { result: AnswerResult | null }) => {
  const p = result?.progress;
  if (!p || (!p.leveled_up && !p.new_badges.length && !p.rating_change && !p.freezes_earned)) return null;
  return (
    <ul className="mt-3 space-y-1.5 text-sm">
      {p.leveled_up && (
        <li className="flex items-center gap-2 font-semibold"><TrendingUp className="size-4 text-primary" aria-hidden /> You reached level {p.level}!</li>
      )}
      {p.new_badges.map((b) => (
        <li key={`${b.slug}-${b.topic ?? ''}`} className="flex items-center gap-2">
          <Award className="size-4 text-gold" aria-hidden /> New badge: <span aria-hidden>{b.icon}</span> <strong>{b.name}</strong>{b.topic ? ` (${b.topic})` : ''}
        </li>
      ))}
      {p.freezes_earned > 0 && (
        <li className="flex items-center gap-2"><Flame className="size-4 text-streak" aria-hidden /> You earned a streak freeze.</li>
      )}
      {p.rating_change && (
        <li className="flex items-center gap-2">
          Rating {p.rating_change.delta >= 0 ? 'up' : 'down'} {Math.abs(p.rating_change.delta)} to <strong>{p.rating_change.after}</strong>
        </li>
      )}
    </ul>
  );
};
