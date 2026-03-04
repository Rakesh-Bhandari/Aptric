import React, { useState } from 'react';
import './Help.css';
import API_BASE_URL from '../../utils/config';

// ── ICONS ────────────────────────────────────────────────────────
const Icons = {
    ChevronDown: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    ),
    Zap: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
    ),
    Trophy: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="8 21 12 21 16 21"></polyline>
            <line x1="12" y1="17" x2="12" y2="21"></line>
            <path d="M7 4H17V11A5 5 0 0 1 7 11Z"></path>
            <path d="M7 4C7 4 4 4 4 7C4 10 7 11 7 11"></path>
            <path d="M17 4C17 4 20 4 20 7C20 10 17 11 17 11"></path>
        </svg>
    ),
    User: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
        </svg>
    ),
    Lock: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
    ),
    Mail: () => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
        </svg>
    ),
    Send: () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
    ),
};

// ── FAQ DATA ─────────────────────────────────────────────────────
const FAQ_SECTIONS = [
    {
        id: 'daily',
        label: 'DAILY_CHALLENGES',
        icon: <Icons.Zap />,
        title: 'Daily Challenges',
        items: [
            {
                q: 'How do daily challenges work?',
                a: 'Every day at midnight, a fresh set of 10 questions is generated and assigned to your account based on your current difficulty level. The timer resets at 00:00 UTC. Complete them before the next cycle to maintain your streak.',
            },
            {
                q: 'What happens if I miss a day?',
                a: 'Missing a day will break your active streak counter. Your score and progress are preserved, but the streak bonus resets to 0. You can resume the streak from the next day\'s challenge set.',
            },
            {
                q: 'Can I redo a daily question?',
                a: 'Yes — navigate to Topics and find the relevant category. From there you can review any previously answered question, see the correct answer, and re-attempt it for practice (though it won\'t re-award points).',
            },
        ],
    },
    {
        id: 'scoring',
        label: 'SCORING_SYSTEM',
        icon: <Icons.Trophy />,
        title: 'Scoring & Ranking',
        items: [
            {
                q: 'How is my score calculated?',
                a: null, // rendered as table below
                table: true,
            },
            {
                q: 'What is the hint penalty?',
                a: 'Using a hint deducts 50% of the question\'s base point value from your potential reward. If you still answer correctly after using a hint, you earn the remaining 50%. Giving up awards zero points.',
            },
            {
                q: 'How does my rank level change?',
                a: 'Your rank (Beginner → Intermediate → Advanced → Expert) updates automatically based on your cumulative score and accuracy. The system re-evaluates your level after each session.',
            },
        ],
    },
    {
        id: 'account',
        label: 'ACCOUNT_SETTINGS',
        icon: <Icons.User />,
        title: 'Account & Profile',
        items: [
            {
                q: 'How do I update my profile picture?',
                a: 'Go to My Progress (accessible from the Navbar). Click on your current avatar to open the upload dialog. Supported formats are JPG, PNG, and WEBP up to 5MB.',
            },
            {
                q: 'Can I change my username?',
                a: 'Yes. From the My Progress page, click the edit icon next to your display name. Changes take effect immediately and update across the leaderboard.',
            },
        ],
    },
    {
        id: 'security',
        label: 'SECURITY_PROTOCOL',
        icon: <Icons.Lock />,
        title: 'Security & Privacy',
        items: [
            {
                q: 'How is my data stored?',
                a: 'All data is encrypted at rest and in transit. Passwords are hashed using bcrypt and are never stored in plain text. Session tokens expire after 24 hours of inactivity.',
            },
            {
                q: 'How do I reset my password?',
                a: 'On the Sign In modal, click "Forgot Password". Enter your registered email and you will receive a reset link valid for 30 minutes. Check your spam folder if it doesn\'t arrive.',
            },
        ],
    },
];

const SCORE_ROWS = [
    { difficulty: 'Easy', points: 10, badge: 'easy' },
    { difficulty: 'Medium', points: 20, badge: 'medium' },
    { difficulty: 'Hard', points: 30, badge: 'hard' },
];

const TIPS = [
    { icon: '🔥', title: 'Build Streaks', text: 'Answer daily questions consistently to stack streak bonuses.' },
    { icon: '💡', title: 'Use Hints Wisely', text: 'Hints cost half the points — only use them when truly stuck.' },
    { icon: '📊', title: 'Track Progress', text: 'Visit your profile to spot weak categories and focus your practice.' },
];

// ── ACCORDION ITEM ───────────────────────────────────────────────
const FaqItem = ({ item, isOpen, onToggle }) => (
    <div className={`faq-item ${isOpen ? 'open' : ''}`}>
        <button className="faq-question" onClick={onToggle}>
            <span className="faq-question-text">{item.q}</span>
            <span className="faq-chevron"><Icons.ChevronDown /></span>
        </button>
        <div className="faq-answer">
            <div className="faq-answer-inner">
                {item.table ? (
                    <table className="score-table">
                        <thead>
                            <tr>
                                <th>Difficulty</th>
                                <th>Base Points</th>
                                <th>With Hint</th>
                            </tr>
                        </thead>
                        <tbody>
                            {SCORE_ROWS.map(row => (
                                <tr key={row.difficulty}>
                                    <td><span className={`score-badge ${row.badge}`}>{row.difficulty}</span></td>
                                    <td>+{row.points} pts</td>
                                    <td>+{row.points / 2} pts</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p>{item.a}</p>
                )}
            </div>
        </div>
    </div>
);

// ── MAIN COMPONENT ───────────────────────────────────────────────
const Help = () => {
    // Track which item is open as "sectionId-itemIndex"
    const [openItem, setOpenItem] = useState('daily-0');

    const toggle = (key) => setOpenItem(prev => (prev === key ? null : key));

    return (
        <div className="help-container">

            {/* ── HEADER ─────────────────────────────────────── */}
            <header className="practice-header">
                <div className="header-main-title">
                    <h1 className="glitch-title">Knowledge_Base</h1>
                    <div className="subtitle-timer" style={{ color: 'var(--accent-green)' }}>
                        FAQ_PROTOCOL // V 1.0
                    </div>
                </div>
            </header>

            {/* ── QUICK TIPS ─────────────────────────────────── */}
            <div className="tips-grid">
                {TIPS.map((tip, i) => (
                    <div className="tip-card" key={i}>
                        <span className="tip-icon">{tip.icon}</span>
                        <div className="tip-title">{tip.title}</div>
                        <p className="tip-text">{tip.text}</p>
                    </div>
                ))}
            </div>

            {/* ── FAQ SECTIONS ───────────────────────────────── */}
            {FAQ_SECTIONS.map(section => (
                <div className="console-card" key={section.id} style={{ marginTop: '1.2rem' }}>
                    <span className="card-label">&gt;&gt; {section.label}</span>
                    <div className="faq-category-title">
                        <span className="title-icon">{section.icon}</span>
                        {section.title}
                    </div>
                    <div className="faq-list">
                        {section.items.map((item, idx) => {
                            const key = `${section.id}-${idx}`;
                            return (
                                <FaqItem
                                    key={key}
                                    item={item}
                                    isOpen={openItem === key}
                                    onToggle={() => toggle(key)}
                                />
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* ── CONTACT CARD ───────────────────────────────── */}
            <div className="contact-card">
                <div className="contact-icon"><Icons.Mail /></div>
                <h3 className="contact-title">Still need help?</h3>
                <p className="contact-subtitle">
                    Can't find what you're looking for? Submit a ticket via the Feedback page
                    and our team will respond within 24 hours.
                </p>
                <a href="/feedback" className="contact-btn">
                    <Icons.Send /> OPEN_FEEDBACK_CHANNEL
                </a>
            </div>

        </div>
    );
};

export default Help;