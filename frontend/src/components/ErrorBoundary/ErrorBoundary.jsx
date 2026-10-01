import { Component } from 'react';
import StatusPanel from '../StatusPanel/StatusPanel';

// Top-level catch-all so a render error shows a recovery screen instead of a blank page.
// Uses plain links/reload rather than the router, since the router itself may be what failed.
class ErrorBoundary extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;

        return (
            <StatusPanel code="500 // UNEXPECTED_ERROR" title="Something went wrong" message="An unexpected error occurred while rendering this page.">
                <button type="button" className="status-panel-btn primary" onClick={() => window.location.reload()}>Reload</button>
                <a href="/" className="status-panel-btn">Home</a>
            </StatusPanel>
        );
    }
}

export default ErrorBoundary;
