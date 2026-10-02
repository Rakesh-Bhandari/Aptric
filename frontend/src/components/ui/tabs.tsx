import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = ({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    className={cn('inline-flex w-full items-center gap-1 overflow-x-auto rounded-full border bg-card p-1 shadow-sm sm:w-auto', className)}
    {...props}
  />
);

export const TabsTrigger = ({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm sm:px-4 font-semibold text-muted-foreground transition-colors duration-200 sm:flex-none',
      'hover:bg-muted hover:text-foreground [&_svg]:size-4',
      // Active: navy fill in light mode; orange fill in dark, where navy would vanish.
      'data-[state=active]:bg-navy data-[state=active]:text-navy-foreground data-[state=active]:shadow-sm',
      'dark:data-[state=active]:bg-primary dark:data-[state=active]:text-primary-foreground',
      className,
    )}
    {...props}
  />
);

export const TabsContent = ({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content className={cn('mt-4 rounded-lg focus-visible:outline-offset-4', className)} {...props} />
);
