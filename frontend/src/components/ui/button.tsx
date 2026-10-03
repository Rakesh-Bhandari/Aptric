import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  // btn-nudge: a trailing arrow or chevron slides 2px right on hover (index.css; off under reduced motion).
  'btn-nudge inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:active:scale-[.98] disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /**
         * Primary CTA: blue → violet gradient pill, white text, soft blue glow. The solid
         * bg-primary underneath shows when the gradient is dropped (disabled, forced colours).
         */
        default:
          'bg-primary bg-gradient-primary text-primary-foreground shadow-glow hover:bg-gradient-primary-hover disabled:bg-none disabled:shadow-none',
        /** Navy pill, white text. */
        navy: 'bg-navy text-navy-foreground shadow-sm hover:bg-navy-strong',
        /** Secondary: soft blue pill with deep blue text (#2563EB on #E0E7FF fails AA, so #1D4ED8). */
        secondary: 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft-hover hover:text-primary-soft-hover-foreground',
        /** Outline: 2px blue border and text, pale blue wash on hover; lighter blue in dark mode. */
        outline:
          'border-2 border-primary bg-transparent text-primary hover:bg-primary-wash dark:border-accent-text dark:text-accent-text',
        /** Solid violet for achievement CTAs (claim a reward, view a badge). */
        violet: 'bg-violet text-violet-foreground shadow-sm hover:bg-violet-strong',
        ghost: 'text-foreground hover:bg-muted',
        danger: 'bg-danger text-status-foreground hover:bg-danger/90',
        link: 'h-auto px-0 text-accent-text underline-offset-4 hover:underline motion-safe:active:scale-100',
      },
      size: {
        /** 36px pill with a 44px hit area (the after: box) for dense rows. */
        sm: 'relative h-9 px-3 text-sm after:absolute after:-inset-y-1 after:inset-x-0',
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, type, ...props }, ref) => {
    if (asChild) {
      return <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>{children}</Slot>;
    }
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
