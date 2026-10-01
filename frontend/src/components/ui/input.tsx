import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const field =
  'w-full rounded-md border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-60 aria-[invalid=true]:border-danger sm:text-sm';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(field, 'h-11', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(field, 'min-h-24 py-2', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(field, 'h-11 pr-8', className)} {...props} />
));
Select.displayName = 'Select';

export const Label = ({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn('text-sm font-medium', className)} {...props} />
);

export const FieldHint = ({ className, error, ...props }: React.HTMLAttributes<HTMLParagraphElement> & { error?: boolean }) => (
  <p className={cn('text-sm', error ? 'text-danger' : 'text-muted-foreground', className)} role={error ? 'alert' : undefined} {...props} />
);
