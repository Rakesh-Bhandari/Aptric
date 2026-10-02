import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { BarChart3, BookOpen, Home, LogOut, Settings, Shield, Swords, User } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuthDialog } from '@/context/AuthDialogContext';
import { useSession } from '@/context/SessionContext';
import { displayName } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from './ErrorBoundary';
import { PageSkeleton } from './PageSkeleton';
import { Logo } from './Logo';

const NAV = [
  { to: '/', label: 'Today', icon: Home, end: true },
  { to: '/practice', label: 'Practice', icon: BookOpen },
  { to: '/compete', label: 'Compete', icon: Swords },
  { to: '/progress', label: 'Progress', icon: BarChart3 },
  { to: '/profile', label: 'Profile', icon: User },
];

export const SkipLink = () => (
  <a
    href="#main"
    className="sr-only z-[70] rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
  >
    Skip to content
  </a>
);

const UserMenu = () => {
  const { profile, isAdmin, signOut } = useSession();
  if (!profile) return null;
  const item = 'flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm outline-none data-[highlighted]:bg-muted [&_svg]:size-4';
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="rounded-full" aria-label="Account menu">
        <Avatar src={profile.avatar_url} name={profile.display_name || profile.handle} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={8} className="z-50 min-w-52 rounded-lg border bg-card p-1 text-card-foreground shadow-lg">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-semibold">{displayName(profile)}</p>
            {profile.handle && <p className="truncate text-xs text-muted-foreground">@{profile.handle}</p>}
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

/** Header + content + (on phones) a bottom tab bar. */
export const AppShell = () => {
  const { status } = useSession();
  const { openAuth } = useAuthDialog();
  const { pathname } = useLocation();
  const signedIn = status === 'signed_in';

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 rounded-md font-bold" aria-label="Aptric home">
            <Logo />
          </Link>
          {signedIn && (
            <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
              {NAV.slice(0, 4).map(({ to, label, end }) => (
                <NavLink
                  key={to} to={to} end={end}
                  className={({ isActive }) => cn(
                    'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                    isActive && 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft hover:text-primary-soft-foreground',
                  )}
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            {signedIn && <UserMenu />}
            {status === 'signed_out' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => openAuth({ mode: 'signin', next: '/' })}>Sign in</Button>
                <Button size="sm" onClick={() => openAuth({ mode: 'signup', next: '/' })}>Get started</Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className={cn('flex-1 focus:outline-none', signedIn && 'pb-20 md:pb-0')}>
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      {signedIn ? (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-safe md:hidden">
          <ul className="mx-auto grid max-w-md grid-cols-5">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to} end={end}
                  className={({ isActive }) => cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground',
                    isActive && 'text-accent-text',
                  )}
                >
                  {({ isActive }) => (
                    <>
                      <span className={cn('grid h-7 w-12 place-items-center rounded-full', isActive && 'bg-primary-soft text-primary-soft-foreground')}>
                        <Icon className="size-5" aria-hidden />
                      </span>
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <footer className="border-t py-6 text-center text-sm text-muted-foreground">
          <Link to="/terms" className="hover:underline">Terms &amp; privacy</Link>
        </footer>
      )}
    </div>
  );
};

/** Distraction-free layout for solving: no tab bar. */
export const FocusLayout = () => {
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-dvh flex-col">
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
