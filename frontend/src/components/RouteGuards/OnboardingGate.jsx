import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../../context/SessionContext';

// Pages a signed-in user without a handle may still open.
const EXEMPT = ['/onboarding', '/auth/', '/terms', '/help', '/contact'];

// Top-level layout route: any signed-in user who hasn't picked a handle yet is
// sent to /onboarding, which returns them here afterwards.
const OnboardingGate = () => {
    const { status, needsOnboarding } = useSession();
    const { pathname, search } = useLocation();

    const exempt = EXEMPT.some((p) => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p));
    if (exempt) return <Outlet />;

    // Signed in but profile still loading: wait rather than flash the page.
    if (status === 'loading') return null;

    if (needsOnboarding) {
        const next = encodeURIComponent(`${pathname}${search}`);
        return <Navigate to={`/onboarding?next=${next}`} replace />;
    }

    return <Outlet />;
};

export default OnboardingGate;
