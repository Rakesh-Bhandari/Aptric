import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const LABELS = ['Not mastered yet', 'Getting there', 'Good', 'Mastered'];

/** 0–3 mastery stars (private.mastery_stars). Filled stars are violet (achievement). */
export const MasteryStars = ({ stars, className }: { stars: number; className?: string }) => (
  <span className={cn('inline-flex items-center gap-0.5', className)} role="img" aria-label={`Mastery: ${stars} of 3 stars (${LABELS[stars] ?? ''})`}>
    {[0, 1, 2].map((i) => (
      <Star
        key={i}
        aria-hidden
        className={cn('size-4', i < stars ? 'fill-violet-text text-violet-text' : 'fill-transparent text-muted-foreground/50')}
      />
    ))}
  </span>
);
