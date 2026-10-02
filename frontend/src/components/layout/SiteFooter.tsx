import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AptricLogo } from '@/components/brand/AptricLogo';
import { cn } from '@/lib/utils';

export const TAGLINE = 'Daily aptitude practice for placements and competitive exams';

export interface FooterLink { label: string; to?: string; href?: string; onClick?: () => void }
export interface FooterColumn { title: string; links: FooterLink[] }

const linkClass =
  'inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-chrome-muted-foreground transition-colors hover:text-chrome-foreground md:min-h-0';

const FooterItem = ({ label, to, href, onClick }: FooterLink) =>
  to ? <Link to={to} className={linkClass}>{label}</Link>
    : href ? <a href={href} className={linkClass}>{label}</a>
      : <button type="button" onClick={onClick} className={linkClass}>{label}</button>;

const FooterLinks = ({ links, className }: { links: FooterLink[]; className?: string }) => (
  <ul className={cn('flex flex-wrap items-center gap-x-5', className)}>
    {links.map((link) => <li key={link.label}><FooterItem {...link} /></li>)}
  </ul>
);

/**
 * Dark Navy footer. `compact` (the signed-in app) is a single row; `full` (visitors,
 * the landing page) shows the stacked logo and tagline beside `columns` of links
 * (or the flat `links` when no columns are given). `children` adds extra content.
 */
export const SiteFooter = ({ variant = 'compact', links, columns, className, children }: {
  variant?: 'compact' | 'full'; links: FooterLink[]; columns?: FooterColumn[]; className?: string; children?: ReactNode;
}) => {
  const year = new Date().getFullYear();
  if (variant === 'compact') {
    return (
      <footer className={cn('bg-chrome-deep text-chrome-muted-foreground', className)}>
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-4 py-6 text-center sm:px-6 md:flex-row md:gap-6 md:text-left">
          <Link to="/" aria-label="Aptric home" className="inline-flex min-h-11 items-center rounded-md">
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
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="flex flex-col items-center gap-4 text-center md:items-start md:text-left">
            <Link to="/" aria-label="Aptric home" className="inline-flex min-h-11 items-center rounded-md">
              <AptricLogo stacked size="sm" variant="onDark" className="md:items-start" />
            </Link>
            <p className="max-w-xs text-sm">{TAGLINE}</p>
          </div>
          {children}
          {columns ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 md:gap-x-14">
              {columns.map((col) => (
                <nav key={col.title} aria-label={col.title}>
                  <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-chrome-accent">{col.title}</h2>
                  <ul className="mt-3 md:space-y-2">
                    {col.links.map((link) => <li key={link.label}><FooterItem {...link} /></li>)}
                  </ul>
                </nav>
              ))}
            </div>
          ) : (
            <FooterLinks links={links} className="justify-center md:justify-end" />
          )}
        </div>
        <div className="mt-8 border-t border-white/10 pt-5 text-center text-xs sm:text-left">© {year} Aptric. Built for students who practise every day.</div>
      </div>
    </footer>
  );
};
