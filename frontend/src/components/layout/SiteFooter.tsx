import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AptricLogo } from '@/components/brand/AptricLogo';
import { cn } from '@/lib/utils';

export const TAGLINE = 'Daily aptitude practice for placements and competitive exams';

export interface FooterLink { label: string; to?: string; onClick?: () => void }

const linkClass =
  'inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-chrome-muted-foreground transition-colors hover:text-chrome-foreground md:min-h-0';

const FooterLinks = ({ links, className }: { links: FooterLink[]; className?: string }) => (
  <ul className={cn('flex flex-wrap items-center gap-x-5', className)}>
    {links.map(({ label, to, onClick }) => (
      <li key={label}>
        {to ? (
          <Link to={to} className={linkClass}>{label}</Link>
        ) : (
          <button type="button" onClick={onClick} className={linkClass}>{label}</button>
        )}
      </li>
    ))}
  </ul>
);

/**
 * Dark Navy footer. `compact` (the signed-in app) is a single row; `full` (visitors,
 * the landing page) stacks the logo over the tagline. `children` lets the landing
 * page add extra columns later.
 */
export const SiteFooter = ({ variant = 'compact', links, className, children }: {
  variant?: 'compact' | 'full'; links: FooterLink[]; className?: string; children?: ReactNode;
}) => {
  const year = new Date().getFullYear();
  if (variant === 'compact') {
    return (
      <footer className={cn('bg-chrome-deep text-chrome-muted-foreground', className)}>
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-6 text-center sm:px-6 md:flex-row md:gap-6 md:text-left">
          <Link to="/" aria-label="Aptric home" className="rounded-md">
            <AptricLogo size="sm" variant="onDark" />
          </Link>
          <p className="text-sm md:flex-1">{TAGLINE}</p>
          <FooterLinks links={links} className="justify-center" />
          <p className="text-xs">© {year} Aptric</p>
        </div>
      </footer>
    );
  }
  return (
    <footer className={cn('bg-chrome-deep text-chrome-muted-foreground', className)}>
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
          <div className="flex flex-col items-center gap-3 sm:items-start">
            <Link to="/" aria-label="Aptric home" className="rounded-md">
              <AptricLogo size="md" variant="onDark" />
            </Link>
            <p className="max-w-xs text-sm">{TAGLINE}</p>
          </div>
          {children}
          <FooterLinks links={links} className="justify-center sm:justify-end" />
        </div>
        <div className="mt-8 border-t border-white/10 pt-5 text-center text-xs sm:text-left">© {year} Aptric. Built for students who practise every day.</div>
      </div>
    </footer>
  );
};
