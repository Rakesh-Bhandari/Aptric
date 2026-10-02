import { CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
    body: `We reserve the right to update these Terms at any time. Continued use of the Platform after changes are posted constitutes your acceptance of the updated terms. The "Last updated" date at the top of this page reflects the most recent revision. For material changes, we will notify users via the platform.`,
  },
  {
    id: 'contact',
    title: 'Contact',
    body: `If you have questions about these Terms, please reach out to us at aptricofficials@gmail.com. We will respond within 3–5 business days.`,
  },
];

const LAST_UPDATED = 'March 2025';

/** Long-form legal page: a readable column, numbered sections with orange anchors, and a contents list on wide screens. */
const Terms = () => (
  <div className="bg-background">
    <header className="border-b bg-card">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <Badge variant="default" className="gap-1.5">
          <CalendarClock aria-hidden /> Last updated {LAST_UPDATED}
        </Badge>
        <h1 className="mt-4 font-display text-[clamp(2rem,5vw,2.75rem)] font-extrabold leading-tight tracking-tight text-heading">
          Terms &amp; Conditions
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Please read these terms carefully before using Aptric. They cover your account, fair use, your data and how we can change these terms.
        </p>
      </div>
    </header>

    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-24">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">On this page</p>
          <ol className="mt-3 space-y-1 border-l-2 border-border">
            {SECTIONS.map((sec, i) => (
              <li key={sec.id}>
                <a
                  href={`#${sec.id}`}
                  className="-ml-0.5 block border-l-2 border-transparent py-1.5 pl-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-heading"
                >
                  <span className="tabular-nums text-accent-text">{i + 1}.</span> {sec.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      <article className="max-w-[68ch] space-y-10">
        {SECTIONS.map((sec, i) => (
          <section key={sec.id} id={sec.id} aria-labelledby={`terms-${sec.id}`} className="group scroll-mt-24">
            <h2 id={`terms-${sec.id}`} className="flex items-baseline gap-3 font-display text-xl font-extrabold tracking-tight text-heading sm:text-2xl">
              <span className="grid size-8 shrink-0 self-center place-items-center rounded-full bg-primary-soft text-sm font-bold tabular-nums text-accent-text">
                {i + 1}<span className="sr-only">.</span>
              </span>
              <span>
                {sec.title}
                <a
                  href={`#${sec.id}`}
                  className="ml-1 inline-block min-w-6 rounded-sm px-1 text-center text-accent-text no-underline opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-60"
                >
                  #<span className="sr-only">Link to this section</span>
                </a>
              </span>
            </h2>
            <div className="mt-3 pl-11 text-base leading-7 text-foreground">
              {sec.items ? (
                <ul className="list-disc space-y-2 pl-5 marker:text-accent-text">
                  {sec.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : sec.id === 'contact' ? (
                <p>
                  If you have questions about these Terms, please reach out to us at{' '}
                  <a href="mailto:aptricofficials@gmail.com" className="font-semibold text-accent-text underline underline-offset-4">aptricofficials@gmail.com</a>.
                  We will respond within 3–5 business days.
                </p>
              ) : (
                <p>{sec.body}</p>
              )}
            </div>
          </section>
        ))}
      </article>
    </div>
  </div>
);

export default Terms;
