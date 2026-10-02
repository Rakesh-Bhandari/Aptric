import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';

/** Mirrors the solve layout: session bar, meta row, stem card, four options and the action bar. */
export const SolveSkeleton = () => (
  <LoadingRegion label="Loading question" className="flex flex-1 flex-col">
    <div className="border-b bg-card shadow-sm">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-3 sm:px-5">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="flex flex-1 gap-[3px]">
          {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-2 flex-1 rounded-full" />)}
        </div>
        <Skeleton className="h-4 w-10" />
        <Skeleton className="h-8 w-16 rounded-full" />
      </div>
    </div>
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pt-4 sm:gap-5 sm:px-6 sm:pt-6">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-4 w-full max-w-48 sm:w-48" />
        <Skeleton className="h-6 w-14 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="space-y-3 rounded-lg border bg-card p-5 shadow-sm sm:p-7">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <div className="grid gap-2.5 sm:gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex min-h-14 items-center gap-3 rounded-lg border-2 bg-card px-3 py-2.5 sm:px-4">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <Skeleton className="h-4" style={{ width: `${[45, 60, 35, 52][i]}%` }} />
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 -mx-4 mt-auto flex gap-2 border-t bg-card px-4 pb-safe pt-3 shadow-top sm:bottom-4 sm:mx-0 sm:mb-8 sm:rounded-full sm:border sm:p-2">
        <Skeleton className="h-12 w-20 rounded-full" />
        <Skeleton className="h-12 flex-1 rounded-full sm:ml-auto sm:w-48 sm:flex-none" />
      </div>
    </div>
  </LoadingRegion>
);
