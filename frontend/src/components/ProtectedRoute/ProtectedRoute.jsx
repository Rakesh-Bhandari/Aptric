import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import StatusPanel from '../StatusPanel/StatusPanel';

// Renders children only for logged-in users. Otherwise opens the login modal
// (via onRequireAuth) and shows a prompt instead of letting the page fetch and fail.
const ProtectedRoute = ({ isAuthenticated, onRequireAuth, children }) => {
    useEffect(() => {
        if (!isAuthenticated) onRequireAuth();
    }, [isAuthenticated, onRequireAuth]);

    if (isAuthenticated) return children;

    return (
        <StatusPanel code="401 // AUTH_REQUIRED" title="Log in to continue" message="This page is only available to signed-in users.">
            <button type="button" className="status-panel-btn primary" onClick={onRequireAuth}>Log in</button>
            <Link to="/" className="status-panel-btn">Home</Link>
        </StatusPanel>
    );
};

export default ProtectedRoute;
