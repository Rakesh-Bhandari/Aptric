import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:active:scale-[.98] disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** Primary CTA: orange pill, navy text (white on orange fails AA). */
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-strong',
        /** Secondary: navy pill, white text. */
        navy: 'bg-navy text-navy-foreground shadow-sm hover:bg-navy-strong',
        /** Soft orange tint for low-emphasis actions. */
        secondary: 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/70',
        /** Navy outline that fills on hover; light outline in dark mode. */
        outline:
          'border-2 border-navy bg-transparent text-navy hover:bg-navy hover:text-navy-foreground dark:border-foreground/70 dark:text-foreground dark:hover:border-foreground dark:hover:bg-foreground dark:hover:text-background',
        ghost: 'text-foreground hover:bg-muted',
        danger: 'bg-danger text-white hover:bg-danger/90 dark:text-background',
        link: 'h-auto px-0 text-accent-text underline-offset-4 hover:underline motion-safe:active:scale-100',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
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
