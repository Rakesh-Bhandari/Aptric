import { AptricMark } from '@/components/brand/AptricMark';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';

/** Generic page-shaped placeholder for lazy routes. */
export const PageSkeleton = () => (
  <LoadingRegion className="mx-auto w-full max-w-5xl space-y-4 px-4 py-5 sm:px-6 sm:py-8">
    <Skeleton className="h-8 w-48 rounded-full" />
    <Skeleton className="h-4 w-72 max-w-full rounded-full" />
    <div className="grid gap-4 pt-2 sm:grid-cols-2">
      <Skeleton className="h-40 rounded-lg" />
      <Skeleton className="h-40 rounded-lg" />
    </div>
    <Skeleton className="h-56 rounded-lg" />
  </LoadingRegion>
);

/** Full-area loader while the session resolves: the mark, breathing gently. */
export const ShellLoader = ({ label = 'Loading' }: { label?: string }) => (
  <LoadingRegion label={label} className="grid min-h-[60dvh] flex-1 place-items-center px-6">
    <AptricMark className="h-14 motion-safe:animate-breathe" />
  </LoadingRegion>
);
