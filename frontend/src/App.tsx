import { lazy } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, FocusLayout } from '@/components/layout/AppShell';
import { NotFound, RouteError } from '@/components/layout/ErrorBoundary';
import { ShellLoader } from '@/components/layout/PageSkeleton';
import { RequireAuth } from '@/components/layout/RouteGuards';
import { AuthDialogProvider } from '@/context/AuthDialogContext';
import { PreferencesProvider } from '@/context/PreferencesContext';
import { SessionProvider, useSession } from '@/context/SessionContext';
import { ToastProvider } from '@/context/ToastContext';
import { queryClient } from '@/lib/queries';

const Landing = lazy(() => import('@/pages/Landing'));
const Today = lazy(() => import('@/pages/Today'));
const DailySolve = lazy(() => import('@/pages/solve/DailySolve'));
const PracticeSolve = lazy(() => import('@/pages/solve/PracticeSolve'));
const SessionSummary = lazy(() => import('@/pages/SessionSummary'));
const Practice = lazy(() => import('@/pages/Practice'));
const Compete = lazy(() => import('@/pages/Compete'));
const ContestPage = lazy(() => import('@/pages/ContestPage'));
const Progress = lazy(() => import('@/pages/Progress'));
const Friends = lazy(() => import('@/pages/Friends'));
const FollowersPage = lazy(() => import('@/pages/Friends').then((m) => ({ default: () => <m.FollowListPage mode="followers" /> })));
const FollowingPage = lazy(() => import('@/pages/Friends').then((m) => ({ default: () => <m.FollowListPage mode="following" /> })));
const Profile = lazy(() => import('@/pages/Profile'));
const PublicProfile = lazy(() => import('@/pages/Profile').then((m) => ({ default: m.PublicProfile })));
const Settings = lazy(() => import('@/pages/Settings'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const PlacementRetake = lazy(() => import('@/pages/Onboarding').then((m) => ({ default: m.PlacementRetake })));
const AuthCallback = lazy(() => import('@/pages/AuthCallback'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Terms = lazy(() => import('@/pages/Terms'));
// Dev-only token preview; import.meta.env.DEV is false in builds, so the chunk is dropped.
const StyleGuide = import.meta.env.DEV ? lazy(() => import('@/pages/dev/StyleGuide')) : null;

// The admin area is for admins only: loaded on demand, kept in JS.
const AdminLayout = lazy(() => import('@/admin/AdminLayout'));
const ReviewQueue = lazy(() => import('@/admin/ReviewQueue'));
const AdminQuestions = lazy(() => import('@/admin/Questions'));
const AdminQuestionPage = lazy(() => import('@/admin/QuestionPage'));
const AdminContests = lazy(() => import('@/admin/Contests'));
const AdminContestEditor = lazy(() => import('@/admin/ContestEditor'));
const AdminContestResults = lazy(() => import('@/admin/ContestResults'));
const AdminUsers = lazy(() => import('@/admin/Users'));
const AdminUserPage = lazy(() => import('@/admin/UserPage'));
const AdminReports = lazy(() => import('@/admin/Reports'));
const AdminJobs = lazy(() => import('@/admin/Jobs'));
const AdminAuditLog = lazy(() => import('@/admin/AuditLog'));

/** Providers that need the router (navigation on auth events) or the signed-in profile (server-side preferences). */
const Root = () => (
  <SessionProvider>
    <PreferencesProvider>
      <AuthDialogProvider>
        <Outlet />
      </AuthDialogProvider>
    </PreferencesProvider>
  </SessionProvider>
);

/** "/": Today for players, the landing page for visitors. */
const Home = () => {
  const { status } = useSession();
  if (status === 'loading') return <ShellLoader />;
  if (status === 'signed_out') return <Landing />;
  return <Outlet />;
};

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        errorElement: <RouteError />,
        children: [
          {
            path: '/',
            element: <Home />,
            children: [{ element: <RequireAuth />, children: [{ index: true, element: <Today /> }] }],
          },
          { path: 'terms', element: <Terms /> },
          ...(StyleGuide ? [{ path: 'dev/styleguide', element: <StyleGuide /> }] : []),
          { path: 'auth/callback', element: <AuthCallback /> },
          { path: 'auth/reset-password', element: <ResetPassword /> },
          {
            element: <RequireAuth />,
            children: [
              { path: 'practice', element: <Practice /> },
              { path: 'compete', element: <Compete /> },
              { path: 'compete/contests/:id', element: <ContestPage /> },
              { path: 'progress', element: <Progress /> },
              { path: 'profile', element: <Profile /> },
              { path: 'settings', element: <Settings /> },
              { path: 'u/:handle', element: <PublicProfile /> },
              { path: 'u/:handle/followers', element: <FollowersPage /> },
              { path: 'u/:handle/following', element: <FollowingPage /> },
              { path: 'friends', element: <Friends /> },
              { path: 'session/summary', element: <SessionSummary /> },
              { path: 'leaderboard', element: <Navigate to="/compete?tab=leaderboards" replace /> },
              { path: 'topics', element: <Navigate to="/practice" replace /> },
              {
                path: 'admin',
                element: <AdminLayout />,
                children: [
                  { index: true, element: <Navigate to="review" replace /> },
                  { path: 'review', element: <ReviewQueue /> },
                  { path: 'questions', element: <AdminQuestions /> },
                  { path: 'questions/:id', element: <AdminQuestionPage /> },
                  { path: 'contests', element: <AdminContests /> },
                  { path: 'contests/new', element: <AdminContestEditor /> },
                  { path: 'contests/:id', element: <AdminContestEditor /> },
                  { path: 'contests/:id/results', element: <AdminContestResults /> },
                  { path: 'users', element: <AdminUsers /> },
                  { path: 'users/:id', element: <AdminUserPage /> },
                  { path: 'reports', element: <AdminReports /> },
                  { path: 'jobs', element: <AdminJobs /> },
                  { path: 'audit', element: <AdminAuditLog /> },
                ],
              },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
      {
        element: <FocusLayout />,
        errorElement: <RouteError />,
        children: [
          {
            element: <RequireAuth />,
            children: [
              { path: 'solve/daily', element: <DailySolve /> },
              { path: 'practice/session', element: <PracticeSolve /> },
            ],
          },
          {
            element: <RequireAuth allowOnboarding />,
            children: [
              { path: 'onboarding', element: <Onboarding /> },
              { path: 'onboarding/placement', element: <PlacementRetake /> },
            ],
          },
        ],
      },
    ],
  },
]);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  </QueryClientProvider>
);

export default App;
