import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';

/** Generic page-shaped placeholder for lazy routes. */
export const PageSkeleton = () => (
  <LoadingRegion className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-4 w-72 max-w-full" />
    <div className="grid gap-4 pt-2 sm:grid-cols-2">
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
    <Skeleton className="h-56" />
  </LoadingRegion>
);
