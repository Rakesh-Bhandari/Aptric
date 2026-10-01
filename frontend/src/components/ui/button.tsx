import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-strong',
        secondary: 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/80',
        outline: 'border border-input bg-card text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        danger: 'bg-danger text-white hover:bg-danger/90 dark:text-background',
        link: 'text-primary underline-offset-4 hover:underline px-0 h-auto',
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
