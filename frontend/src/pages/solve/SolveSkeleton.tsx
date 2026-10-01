import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';

export const SolveSkeleton = () => (
  <LoadingRegion label="Loading question" className="mx-auto w-full max-w-2xl space-y-4 px-4 py-4 sm:px-6">
    <Skeleton className="h-10 w-full" />
    <div className="flex gap-2"><Skeleton className="h-6 w-32" /><Skeleton className="h-6 w-16" /><Skeleton className="ml-auto h-8 w-24 rounded-full" /></div>
    <Skeleton className="h-36 w-full" />
    {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
    <Skeleton className="h-12 w-full" />
  </LoadingRegion>
);
