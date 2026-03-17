import './Terms.css';

const SECTIONS = [
    {
        id: 'acceptance',
        label: 'SECTION_01 // ACCEPTANCE',
        title: 'Acceptance of Terms',
        body: `By accessing or using Aptric ("Platform", "we", "us"), you agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, you may not access the Platform. These terms apply to all visitors, users, and registered accounts.`,
    },
    {
        id: 'account',
        label: 'SECTION_02 // ACCOUNT',
        title: 'Account Registration & Responsibilities',
        items: [
            'You must be at least 13 years old to create an account.',
            'You are responsible for maintaining the confidentiality of your login credentials.',
            'You agree to provide accurate information during sign-up and keep it current.',
            'You may not share your account or allow others to use it.',
            'Aptric reserves the right to suspend or terminate accounts that violate these terms.',
        ],
    },
    {
        id: 'use',
        label: 'SECTION_03 // ACCEPTABLE USE',
        title: 'Acceptable Use Policy',
        items: [
            'Do not attempt to exploit, hack, or reverse-engineer the Platform.',
            'Do not submit offensive, abusive, or harmful content through feedback or profile fields.',
            'Do not use automated bots or scripts to interact with the Platform.',
            'Do not impersonate other users, administrators, or Aptric staff.',
            'Do not attempt to gain unauthorised access to other users\' accounts or data.',
        ],
    },
    {
        id: 'scoring',
        label: 'SECTION_04 // SCORING & CONTENT',
        title: 'Scoring, Content & Intellectual Property',
        body: `All questions, explanations, scoring algorithms, and platform design are the intellectual property of Aptric. Scores and rankings are calculated in real-time and may be adjusted if irregularities are detected. You may not reproduce, distribute, or commercially exploit any content without prior written consent.`,
    },
    {
        id: 'privacy',
        label: 'SECTION_05 // PRIVACY',
        title: 'Privacy & Data Collection',
        body: `We collect basic profile information (username, email, avatar), usage data (answers, streaks, scores), and optional fields (bio). We do not sell your data. All data is stored securely and used solely to provide and improve the Platform. Passwords are hashed with bcrypt and never stored in plain text. You may request account deletion by contacting us.`,
    },
    {
        id: 'disclaimer',
        label: 'SECTION_06 // DISCLAIMER',
        title: 'Disclaimer of Warranties',
        body: `Aptric is provided "as is" without warranties of any kind, express or implied. We do not guarantee uninterrupted service, error-free content, or fitness for a particular purpose. The Platform may be updated, modified, or taken offline at any time without notice.`,
    },
    {
        id: 'changes',
        label: 'SECTION_07 // CHANGES',
        title: 'Changes to These Terms',
        body: `We reserve the right to update these Terms at any time. Continued use of the Platform after changes are posted constitutes your acceptance of the updated terms. The "Last updated" date at the bottom of this page reflects the most recent revision. For material changes, we will notify users via the platform.`,
    },
    {
        id: 'contact',
        label: 'SECTION_08 // CONTACT',
        title: 'Contact',
        body: `If you have questions about these Terms, please reach out to us at aptricofficials@gmail.com. We will respond within 3–5 business days.`,
        isContact: true,
    },
];

const Terms = () => (
    <div className="terms-container">
        <header className="terms-hero">
            <div className="terms-badge">&gt;&gt; LEGAL_DOCUMENT</div>
            <h1 className="terms-title">Terms &amp; Conditions</h1>
            <p className="terms-subtitle">
                Please read these terms carefully before using Aptric.
            </p>
            <p className="terms-updated">Last updated: March 2025</p>
        </header>

        <div className="terms-body">
            {SECTIONS.map(sec => (
                <section key={sec.id} className="terms-section">
                    <span className="terms-section-label">{sec.label}</span>
                    <h2 className="terms-section-title">{sec.title}</h2>
                    {sec.items ? (
                        <ul className="terms-list">
                            {sec.items.map((item, i) => (
                                <li key={i}>{item}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className={`terms-text${sec.isContact ? ' contact-highlight' : ''}`}>
                            {sec.isContact ? (
                                <>
                                    If you have questions about these Terms, please reach out to us at{' '}
                                    <a href="mailto:aptricofficials@gmail.com" className="terms-email-link">
                                        aptricofficials@gmail.com
                                    </a>
                                    . We will respond within 3–5 business days.
                                </>
                            ) : sec.body}
                        </p>
                    )}
                </section>
            ))}
        </div>
    </div>
);

export default Terms;
