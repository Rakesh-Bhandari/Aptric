import './StatusPanel.css';

// Centered card used for full-page states: login required, 404, crash fallback.
const StatusPanel = ({ code, title, message, children }) => (
    <div className="status-panel" role="alert">
        <span className="status-panel-code">{code}</span>
        <h1>{title}</h1>
        <p>{message}</p>
        <div className="status-panel-actions">{children}</div>
    </div>
);

export default StatusPanel;
