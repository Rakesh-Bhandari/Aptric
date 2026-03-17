import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => (
    <footer className="site-footer">
        <span className="footer-copy">© {new Date().getFullYear()} Aptric</span>
        <nav className="footer-links">
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
            <Link to="/help">Help</Link>
            <Link to="/feedback">Feedback</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/terms">Terms</Link>
        </nav>
    </footer>
);

export default Footer;
