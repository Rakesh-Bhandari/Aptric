export const Logo = ({ withText = true }: { withText?: boolean }) => (
  <span className="flex items-center gap-2">
    <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground" aria-hidden>
      A
    </span>
    {withText && <span className="text-lg tracking-tight">Aptric</span>}
  </span>
);
