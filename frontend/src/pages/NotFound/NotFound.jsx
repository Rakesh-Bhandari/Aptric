import { Link, useLocation } from 'react-router-dom';
import StatusPanel from '../../components/StatusPanel/StatusPanel';

const NotFound = () => {
    const { pathname } = useLocation();
    return (
        <StatusPanel code="404 // NOT_FOUND" title="Page not found" message={`Nothing lives at ${pathname}.`}>
            <Link to="/" className="status-panel-btn primary">Home</Link>
            <Link to="/topics" className="status-panel-btn">Browse topics</Link>
        </StatusPanel>
    );
};

export default NotFound;
