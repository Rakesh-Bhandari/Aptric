import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = ({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    className={cn('inline-flex w-full items-center gap-1 overflow-x-auto rounded-full bg-muted p-1 sm:w-auto', className)}
    {...props}
  />
);

export const TabsTrigger = ({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm sm:px-4 font-semibold text-muted-foreground transition-colors duration-200 sm:flex-none',
      'hover:text-foreground [&_svg]:size-4',
      // Segmented control: the active tab is a raised card-coloured pill with blue text on the muted track.
      'data-[state=active]:bg-card data-[state=active]:text-accent-text data-[state=active]:shadow-sm',
      className,
    )}
    {...props}
  />
);

export const TabsContent = ({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content className={cn('mt-4 rounded-lg focus-visible:outline-offset-4', className)} {...props} />
);
