import { useState } from 'react';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

export const Avatar = ({ src, name, className }: { src?: string | null; name?: string | null; className?: string }) => {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn('inline-grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-navy-soft text-sm font-bold text-navy-soft-foreground ring-2 ring-card', className)}>
      {src && !failed ? (
        <img src={src} alt="" className="size-full object-cover" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
};
