import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 [&_svg]:size-3.5', {
  variants: {
    variant: {
      default: 'bg-primary-soft text-primary-soft-foreground',
      navy: 'bg-navy-soft text-navy-soft-foreground',
      solid: 'bg-primary text-primary-foreground',
      muted: 'bg-muted text-muted-foreground',
      success: 'bg-success-soft text-success-soft-foreground',
      danger: 'bg-danger-soft text-danger-soft-foreground',
      warning: 'bg-warning-soft text-warning-soft-foreground',
      outline: 'border text-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
);
