import { Page } from '@/components/ui/page';

const SECTIONS: { id: string; title: string; body?: string; items?: string[] }[] = [
  {
    id: 'acceptance',
    title: 'Acceptance of Terms',
    body: `By accessing or using Aptric ("Platform", "we", "us"), you agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, you may not access the Platform. These terms apply to all visitors, users, and registered accounts.`,
  },
  {
    id: 'account',
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
    title: 'Scoring, Content & Intellectual Property',
    body: `All questions, explanations, scoring algorithms, and platform design are the intellectual property of Aptric. Scores and rankings are calculated in real-time and may be adjusted if irregularities are detected. You may not reproduce, distribute, or commercially exploit any content without prior written consent.`,
  },
  {
    id: 'privacy',
    title: 'Privacy & Data Collection',
    body: `We collect basic profile information (username, email, avatar), usage data (answers, streaks, scores), and optional fields (bio). We do not sell your data. All data is stored securely and used solely to provide and improve the Platform. Passwords are hashed with bcrypt and never stored in plain text. You may request account deletion by contacting us.`,
  },
  {
    id: 'disclaimer',
    title: 'Disclaimer of Warranties',
    body: `Aptric is provided "as is" without warranties of any kind, express or implied. We do not guarantee uninterrupted service, error-free content, or fitness for a particular purpose. The Platform may be updated, modified, or taken offline at any time without notice.`,
  },
  {
    id: 'changes',
    title: 'Changes to These Terms',
    body: `We reserve the right to update these Terms at any time. Continued use of the Platform after changes are posted constitutes your acceptance of the updated terms. The "Last updated" date at the bottom of this page reflects the most recent revision. For material changes, we will notify users via the platform.`,
  },
  {
    id: 'contact',
    title: 'Contact',
    body: `If you have questions about these Terms, please reach out to us at aptricofficials@gmail.com. We will respond within 3–5 business days.`,
  },
];

const Terms = () => (
  <Page className="max-w-3xl">
    <h1 className="text-3xl font-bold tracking-tight">Terms &amp; Conditions</h1>
    <p className="mt-2 text-muted-foreground">Please read these terms carefully before using Aptric. Last updated: March 2025.</p>
    <div className="mt-8 space-y-8">
      {SECTIONS.map((sec, i) => (
        <section key={sec.id} aria-labelledby={`terms-${sec.id}`}>
          <h2 id={`terms-${sec.id}`} className="text-lg font-semibold">{i + 1}. {sec.title}</h2>
          {sec.items ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {sec.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          ) : sec.id === 'contact' ? (
            <p className="mt-2 text-muted-foreground">
              If you have questions about these Terms, please reach out to us at{' '}
              <a href="mailto:aptricofficials@gmail.com" className="font-medium text-primary underline">aptricofficials@gmail.com</a>.
              We will respond within 3–5 business days.
            </p>
          ) : (
            <p className="mt-2 text-muted-foreground">{sec.body}</p>
          )}
        </section>
      ))}
    </div>
  </Page>
);

export default Terms;
