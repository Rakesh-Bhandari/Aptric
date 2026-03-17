import { useState } from 'react';
import { Link } from 'react-router-dom';
import './Contact.css';

const TOPICS = [
    { id: 'bug', label: 'Bug Report', icon: '🐛' },
    { id: 'account', label: 'Account Issue', icon: '👤' },
    { id: 'question', label: 'Content / Question Error', icon: '❓' },
    { id: 'feature', label: 'Feature Request', icon: '💡' },
    { id: 'legal', label: 'Legal / Privacy', icon: '⚖️' },
    { id: 'other', label: 'Other', icon: '✉️' },
];

const CHANNELS = [
    {
        icon: '📧',
        label: 'Email',
        value: 'aptricofficials@gmail.com',
        href: 'mailto:aptricofficials@gmail.com',
        desc: 'Primary support channel — response within 24–48 hours',
    },
    {
        icon: '💬',
        label: 'Feedback Portal',
        value: '/feedback',
        href: '/feedback',
        desc: 'Use our in-app feedback form for quick reports',
        isInternal: true,
    },
];

const Contact = () => {
    const [topic, setTopic] = useState('');
    const [copied, setCopied] = useState(false);

    const copyEmail = () => {
        navigator.clipboard.writeText('aptricofficials@gmail.com');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="contact-container">
            {/* Header */}
            <header className="contact-hero">
                <div className="contact-badge">&gt;&gt; SUPPORT_CHANNEL</div>
                <h1 className="contact-title">Contact Us</h1>
                <p className="contact-subtitle">
                    We're here to help. Choose the right channel below or drop us a message directly.
                </p>
            </header>

            {/* Channel Cards */}
            <section className="contact-channels">
                {CHANNELS.map(ch => (
                    <div key={ch.label} className="channel-card">
                        <span className="channel-icon">{ch.icon}</span>
                        <div className="channel-info">
                            <span className="channel-label">{ch.label}</span>
                            <p className="channel-desc">{ch.desc}</p>
                            {ch.isInternal ? (
                                <Link to={ch.href} className="channel-link">{ch.value}</Link>
                            ) : (
                                <a href={ch.href} className="channel-link">{ch.value}</a>
                            )}
                        </div>
                    </div>
                ))}
            </section>

            {/* Email copy block */}
            <div className="email-copy-block">
                <span className="email-copy-label">&gt;&gt; DIRECT_CONTACT</span>
                <div className="email-copy-row">
                    <span className="email-address">aptricofficials@gmail.com</span>
                    <button className="copy-btn" onClick={copyEmail}>
                        {copied ? '✓ COPIED' : 'COPY'}
                    </button>
                </div>
                <a href="mailto:aptricofficials@gmail.com" className="email-open-btn">
                    Open in Mail Client
                </a>
            </div>

            {/* Topic guide */}
            <section className="topic-guide">
                <div className="topic-guide-label">&gt;&gt; CHOOSE_YOUR_TOPIC</div>
                <p className="topic-guide-hint">
                    Mention your topic below when emailing us for a faster response.
                </p>
                <div className="topic-grid">
                    {TOPICS.map(t => (
                        <button
                            key={t.id}
                            className={`topic-pill${topic === t.id ? ' active' : ''}`}
                            onClick={() => setTopic(prev => prev === t.id ? '' : t.id)}
                        >
                            <span>{t.icon}</span> {t.label}
                        </button>
                    ))}
                </div>
                {topic && (
                    <div className="topic-email-hint">
                        <span className="hint-label">SUGGESTED SUBJECT LINE</span>
                        <code className="hint-code">
                            [Aptric] {TOPICS.find(t => t.id === topic)?.label} — &lt;brief description&gt;
                        </code>
                    </div>
                )}
            </section>

            {/* Footer note */}
            <p className="contact-note">
                For legal enquiries, please refer to our{' '}
                <Link to="/terms" className="contact-link">Terms &amp; Conditions</Link>.
                Response time is typically 1–3 business days.
            </p>
        </div>
    );
};

export default Contact;
