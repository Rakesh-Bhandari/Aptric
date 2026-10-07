import { useEffect, useId, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FieldHint, Input, Label } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/states';
import { useUserSearch } from '@/lib/queries';
import { UserListSkeleton, UserRow } from './UserRow';

/** Debounced value, so a search runs when typing pauses. */
const useDebounced = (value: string, ms = 300) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

/** Find people by the start of their @handle. Names and emails are never searched. */
export const UserSearchDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const [text, setText] = useState('');
  const term = useDebounced(text.trim().replace(/^@/, '').toLowerCase());
  const valid = /^[a-z0-9_]{2,24}$/.test(term);
  const search = useUserSearch(valid ? term : '');
  const inputId = useId();
  const items = search.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setText(''); }}>
      <DialogContent title="Find people" description="Search by the start of their @handle.">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={inputId}>Handle</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id={inputId} type="search" value={text} onChange={(e) => setText(e.target.value)} maxLength={25}
                autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="@asha" className="pl-9"
              />
            </div>
          </div>
          <div aria-live="polite" className="min-h-48">
            {!valid && <FieldHint>{text.trim().length < 2 ? 'Type at least 2 characters.' : 'Handles use letters, numbers and underscores.'}</FieldHint>}
            {valid && search.isError && <ErrorState error={search.error} onRetry={() => void search.refetch()} />}
            {valid && search.isPending && !search.isError && <UserListSkeleton rows={3} />}
            {valid && search.data && items.length === 0 && <FieldHint>No one found for “{term}”.</FieldHint>}
            {valid && items.length > 0 && (
              <ul aria-label="Search results" className="-mx-3 max-h-80 divide-y overflow-y-auto sm:-mx-4">
                {items.map((u) => <UserRow key={u.handle} user={u} />)}
              </ul>
            )}
            {valid && search.hasNextPage && (
              <div className="pt-2 text-center">
                <Button variant="ghost" size="sm" loading={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>Show more</Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
