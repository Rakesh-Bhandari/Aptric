import { useEffect } from 'react';
import { Link, Outlet } from 'react-router-dom';
import StatusPanel from '../StatusPanel/StatusPanel';
import { useSession } from '../../context/SessionContext';
import { useAuthModal } from '../../context/AuthModalContext';

// Layout route for signed-in-only pages. Signed-out visitors get the login
// modal and a prompt instead of a page that would fetch and fail.
const RequireAuth = () => {
    const { status, profileError, refreshProfile } = useSession();
    const { openAuth } = useAuthModal();

    useEffect(() => {
        if (status === 'signed_out') openAuth({ stay: true });
    }, [status, openAuth]);

    if (status === 'loading') return null;

    if (status === 'signed_out') {
        return (
            <StatusPanel code="401 // AUTH_REQUIRED" title="Log in to continue" message="This page is only available to signed-in users.">
                <button type="button" className="status-panel-btn primary" onClick={() => openAuth({ stay: true })}>Log in</button>
                <Link to="/" className="status-panel-btn">Home</Link>
            </StatusPanel>
        );
    }

    if (profileError) {
        return (
            <StatusPanel code="503 // PROFILE_UNAVAILABLE" title="Couldn't load your profile" message="Check your connection and try again.">
                <button type="button" className="status-panel-btn primary" onClick={refreshProfile}>Retry</button>
            </StatusPanel>
        );
    }

    return <Outlet />;
};

export default RequireAuth;
