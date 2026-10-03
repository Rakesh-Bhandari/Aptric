import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { ArrowRight, BarChart3, BookOpen, Home, LogOut, Settings, Shield, Swords, User, X } from 'lucide-react';
import { AptricLogo } from '@/components/brand/AptricLogo';
import { AptricMark } from '@/components/brand/AptricMark';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuthDialog } from '@/context/AuthDialogContext';
import { useSession } from '@/context/SessionContext';
import { displayName } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from './ErrorBoundary';
import { HeaderOverlayContext, type HeaderOverlayTone } from './headerOverlay';
import { PageSkeleton } from './PageSkeleton';
import { SiteFooter, type FooterColumn, type FooterLink } from './SiteFooter';

const NAV = [
  { to: '/', label: 'Today', icon: Home, end: true },
  { to: '/practice', label: 'Practice', icon: BookOpen },
  { to: '/compete', label: 'Compete', icon: Swords },
  { to: '/progress', label: 'Progress', icon: BarChart3 },
  { to: '/profile', label: 'Profile', icon: User },
];

// Visitors' header links: anchors into the landing page (Landing scrolls to the hash).
const VISITOR_NAV = [
  { to: '/#features', label: 'Features' },
  { to: '/#how-it-works', label: 'How it works' },
  { to: '/#sections', label: 'Sections' },
];

export const SkipLink = () => (
  <a
    href="#main"
    className="sr-only z-[70] rounded-full bg-primary px-4 py-2 font-semibold text-primary-foreground shadow-md focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
  >
    Skip to content
  </a>
);

const UserMenu = () => {
  const { profile, isAdmin, signOut } = useSession();
  if (!profile) return null;
  const name = profile.display_name || profile.handle;
  const item =
    'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-card-foreground outline-none transition-colors data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary-soft-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground data-[highlighted]:[&_svg]:text-current';
  return (
    <Dropdown.Root>
      <Dropdown.Trigger
        className="rounded-full p-1 ring-2 ring-transparent transition-shadow hover:ring-primary/40 data-[state=open]:ring-primary dark:hover:ring-accent-text/50 dark:data-[state=open]:ring-accent-text"
        aria-label="Account menu"
      >
        <Avatar src={profile.avatar_url} name={name} className="ring-header" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end" sideOffset={10}
          className="z-50 min-w-64 overflow-hidden rounded-2xl border bg-card p-1.5 text-card-foreground shadow-lg motion-safe:animate-fade-in"
        >
          <div className="flex items-center gap-3 rounded-xl bg-violet-soft/60 px-2.5 py-2.5 dark:bg-violet-soft/40">
            <Avatar src={profile.avatar_url} name={name} className="size-10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-heading">{displayName(profile)}</p>
              {profile.handle && <p className="truncate text-xs text-muted-foreground">@{profile.handle}</p>}
            </div>
          </div>
          <Dropdown.Separator className="my-1 h-px bg-border" />
          <Dropdown.Item asChild className={item}><Link to="/profile"><User /> Profile</Link></Dropdown.Item>
          <Dropdown.Item asChild className={item}><Link to="/profile#settings"><Settings /> Settings</Link></Dropdown.Item>
          {isAdmin && <Dropdown.Item asChild className={item}><Link to="/admin"><Shield /> Admin</Link></Dropdown.Item>}
          <Dropdown.Separator className="my-1 h-px bg-border" />
          <Dropdown.Item className={item} onSelect={() => void signOut()}><LogOut /> Sign out</Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
};

/** True once the window has scrolled past a few pixels. */
const useScrolled = () => {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return scrolled;
};

const headerLink =
  'relative flex h-10 items-center rounded-full px-3.5 text-sm font-semibold transition-colors hover:bg-muted';

/** Header + content + footer + (on phones, signed in) a bottom tab bar. */
export const AppShell = () => {
  const { status } = useSession();
  const { openAuth } = useAuthDialog();
  const { pathname } = useLocation();
  const signedIn = status === 'signed_in';
  // A page with its own hero (the landing page) opts in through useHeaderOverlay().
  const [overlay, setOverlay] = useState<HeaderOverlayTone | null>(null);
  const scrolled = useScrolled();
  const transparent = overlay !== null && !scrolled;

  const footerLinks: FooterLink[] = signedIn
    ? [{ label: 'Practice', to: '/practice' }, { label: 'Compete', to: '/compete' }, { label: 'Terms & privacy', to: '/terms' }]
    : [
      { label: 'Sign in', onClick: () => openAuth({ mode: 'signin', next: '/' }) },
      { label: 'Create account', onClick: () => openAuth({ mode: 'signup', next: '/' }) },
      { label: 'Terms & privacy', to: '/terms' },
    ];
  // Visitors get the rich footer: anchors into the landing page, account actions, legal.
  const footerColumns: FooterColumn[] | undefined = signedIn ? undefined : [
    { title: 'Explore', links: VISITOR_NAV },
    { title: 'Account', links: footerLinks.slice(0, 2) },
    { title: 'Company', links: [{ label: 'Terms & privacy', to: '/terms' }, { label: 'Contact us', href: 'mailto:aptricofficials@gmail.com' }] },
  ];

  return (
    <HeaderOverlayContext.Provider value={setOverlay}>
      <div className={cn('flex min-h-dvh flex-col', signedIn && 'pb-tabbar md:pb-0')}>
        <SkipLink />
        <header
          // Over a hero that is dark in both themes, the transparent header takes the dark tokens.
          data-theme={transparent && overlay === 'dark' ? 'dark' : undefined}
          className={cn(
            'sticky top-0 z-40 border-b text-header-foreground transition-[background-color,border-color,box-shadow] duration-200 ease-out',
            transparent
              ? 'border-transparent bg-transparent'
              : 'border-border bg-header supports-[backdrop-filter]:bg-header/90 supports-[backdrop-filter]:backdrop-blur-md',
            !transparent && scrolled && 'shadow-sm',
          )}
        >
          <div className="mx-auto flex h-16 max-w-5xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
            <Link to="/" className="flex min-h-11 shrink-0 items-center rounded-md" aria-label="Aptric home">
              <AptricLogo size="sm" className="sm:hidden" />
              <AptricLogo className="hidden sm:inline-flex" />
            </Link>
            {signedIn && (
              <nav aria-label="Main" className="ml-4 hidden h-full items-center gap-1 md:flex">
                {NAV.slice(0, 4).map(({ to, label, end }) => (
                  <NavLink
                    key={to} to={to} end={end}
                    className={({ isActive }) => cn(
                      headerLink,
                      'text-header-muted-foreground hover:text-header-foreground',
                      // Active: blue label and a 2px primary-gradient underline on the header's bottom edge.
                      'after:absolute after:inset-x-3.5 after:-bottom-3 after:h-0.5 after:rounded-full after:bg-gradient-primary after:opacity-0 after:transition-opacity',
                      isActive && 'text-primary after:opacity-100 hover:text-primary dark:text-accent-text dark:hover:text-accent-text',
                    )}
                  >
                    {label}
                  </NavLink>
                ))}
              </nav>
            )}
            {status === 'signed_out' && (
              <nav aria-label="Explore" className="ml-6 hidden items-center gap-1 md:flex">
                {VISITOR_NAV.map(({ to, label }) => (
                  <Link key={to} to={to} className={cn(headerLink, 'text-header-foreground hover:text-primary dark:hover:text-accent-text')}>
                    {label}
                  </Link>
                ))}
              </nav>
            )}
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              {signedIn && <UserMenu />}
              {status === 'signed_out' && (
                <>
                  <Button
                    variant="ghost" size="sm"
                    className="h-11 px-2.5 text-header-foreground sm:px-4"
                    onClick={() => openAuth({ mode: 'signin', next: '/' })}
                  >
                    Sign in
                  </Button>
                  <Button size="sm" className="h-11 px-3.5 sm:px-5" onClick={() => openAuth({ mode: 'signup', next: '/' })}>
                    Get Started <ArrowRight aria-hidden />
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>

        {status !== 'loading' && <SiteFooter variant={signedIn ? 'compact' : 'full'} links={footerLinks} columns={footerColumns} />}

        {signedIn && (
          <nav
            aria-label="Main"
            className="fixed inset-x-0 bottom-0 z-40 border-t bg-header pb-safe shadow-top supports-[backdrop-filter]:bg-header/90 supports-[backdrop-filter]:backdrop-blur-md md:hidden"
          >
            <ul className="mx-auto grid max-w-md grid-cols-5">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to} end={end}
                    className={({ isActive }) => cn(
                      'relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted-foreground transition-colors',
                      isActive && 'text-primary dark:text-accent-text',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          aria-hidden
                          className={cn(
                            'absolute top-0 h-[3px] w-8 rounded-b-full bg-gradient-primary transition-opacity',
                            isActive ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <Icon className="size-[22px]" strokeWidth={isActive ? 2.4 : 2} aria-hidden />
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </HeaderOverlayContext.Provider>
  );
};

/**
 * Minimal top bar for focus screens: the mark only, an optional title/progress
 * slot, and a close button. Pages pass their own close handler so exits keep
 * their save/confirm behaviour.
 */
export const FocusBar = ({ onClose, closeLabel = 'Close', children }: {
  onClose?: () => void; closeLabel?: string; children?: ReactNode;
}) => (
  <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
    <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4 sm:px-6">
      <Link to="/" className="flex min-h-11 items-center rounded-md" aria-label="Aptric home">
        <AptricMark className="h-7" />
      </Link>
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && (
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={closeLabel} className="-mr-2 text-muted-foreground hover:text-foreground">
          <X className="size-5" />
        </Button>
      )}
    </div>
  </header>
);

/**
 * Distraction-free layout for solving and onboarding: off-white page, no header,
 * footer or tab bar. The screens inside render their own top bar (FocusBar, or
 * SessionHeader in the solve flow) because only they know what "exit" means.
 */
export const FocusLayout = () => {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SkipLink />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
};
