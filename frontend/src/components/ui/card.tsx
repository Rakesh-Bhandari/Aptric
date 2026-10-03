import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * `navy`: the navy gradient with white text, for feature and hero cards.
   * `soft`: a Soft Purple fill for highlighted sections.
   */
  variant?: 'default' | 'navy' | 'soft';
}

export const Card = ({ className, variant = 'default', ...props }: CardProps) => (
  <div
    className={cn(
      'rounded-lg border shadow-sm',
      {
        default: 'bg-card text-card-foreground',
        // Headings, muted text, links and focus rings inside follow the panel, not the page theme.
        navy: 'border-transparent bg-gradient-navy text-navy-foreground [--heading:var(--navy-foreground)] [--muted-foreground:var(--navy-muted-foreground)] [--accent-text:var(--sky)] [--ring:var(--ring-on-navy)]',
        soft: 'border-transparent bg-violet-soft text-foreground shadow-none',
      }[variant],
      className,
    )}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1 p-4 sm:p-5', className)} {...props} />
);

export const CardTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn('text-lg font-bold leading-tight tracking-tight text-heading', className)} {...props} />
);

export const CardDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-sm text-muted-foreground', className)} {...props} />
);

export const CardContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-4 pt-0 sm:p-5 sm:pt-0', className)} {...props} />
);

export const CardFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center gap-2 p-4 pt-0 sm:p-5 sm:pt-0', className)} {...props} />
);
