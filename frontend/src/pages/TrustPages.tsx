import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta';

const CONTACT_EMAIL = 'aptricofficials@gmail.com';

const PageLayout = ({ title, description, children }: { title: string; description: string; children: React.ReactNode }) => (
  <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
    <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--accent)]">Aptric</p>
    <h1 className="text-3xl font-extrabold tracking-tight text-[var(--foreground)] sm:text-4xl">{title}</h1>
    <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--foreground)]">{description}</p>
    <div className="mt-8 space-y-7 text-sm leading-7 text-[var(--foreground)]">{children}</div>
  </article>
);

export const AboutPage: React.FC = () => {
  usePageMeta({
    title: 'About Aptric',
    description: 'Learn about Aptric, a learning and practice platform for aptitude preparation, placement screening, and technical fundamentals.',
    canonicalPath: '/about',
  });
  return (
    <PageLayout title="About Aptric" description="Aptric helps learners practise aptitude and technical fundamentals with structured questions and accessible study resources.">
      <section><h2 className="text-lg font-bold">What Aptric offers</h2><p>Aptric combines practice sessions, daily challenges, progress features, and public learning resources. The resource library is designed to explain concepts with definitions, worked examples, formulas, and practice checkpoints without requiring an account to read.</p></section>
      <section><h2 className="text-lg font-bold">Our approach to learning</h2><p>Good practice should make reasoning visible. The public guides aim to explain why a method works, when it applies, and which mistakes to avoid. Educational content can contain errors; visitors can report suspected issues from each article so the material can be reviewed and corrected.</p></section>
      <section><h2 className="text-lg font-bold">Using the platform</h2><p>Reading public resources does not require an account. Account features such as saved progress and personalized practice remain subject to the platform's sign-in requirements.</p><p><Link className="text-[var(--accent)] underline" to="/resources">Browse free resources</Link> or <Link className="text-[var(--accent)] underline" to="/free-trial">try the 10-question trial</Link>.</p></section>
      <section><h2 className="text-lg font-bold">Contact</h2><p>For questions about Aptric, email <a className="text-[var(--accent)] underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p></section>
    </PageLayout>
  );
};

export const PrivacyPage: React.FC = () => {
  usePageMeta({
    title: 'Privacy Policy',
    description: 'How Aptric handles account information, learning activity, browser storage, public resource feedback, and privacy requests.',
    canonicalPath: '/privacy',
  });
  return (
    <PageLayout title="Privacy Policy" description="This policy describes information used to operate Aptric and choices available to visitors and account holders.">
      <p><strong>Effective date:</strong> 20 October 2026. This policy should be updated when the service's data practices or third-party integrations change.</p>
      <section><h2 className="text-lg font-bold">Information we process</h2><p>If you create an account, Aptric may process the profile information you provide, such as your email address, username, and avatar, as well as learning activity such as answers, scores, streaks, and progress. Optional profile fields are processed when you choose to provide them.</p><p>Public resource feedback includes the topic, category, and message you submit. Do not include passwords, financial details, or other sensitive personal information in a correction report. Reports are retained for moderation and are not published automatically.</p></section>
      <section><h2 className="text-lg font-bold">Why information is used</h2><p>Information is used to provide account access, operate practice and progress features, protect the service against abuse, respond to support requests, and maintain and improve the platform. We do not sell personal information.</p></section>
      <section><h2 className="text-lg font-bold">Browser storage</h2><p>The application may use browser storage to remember interface preferences and support a temporary anonymous trial session. Browser storage can be cleared through your browser settings. Clearing it may reset local preferences or the trial interface, but it does not delete server-side account data.</p></section>
      <section><h2 className="text-lg font-bold">Service providers and security</h2><p>Aptric relies on hosting, database, and infrastructure providers to operate the service. Information may be processed by those providers as necessary to deliver the platform. Reasonable technical controls are used, but no internet service can guarantee absolute security.</p></section>
      <section><h2 className="text-lg font-bold">Advertising and cookies</h2><p>The current frontend source does not include third-party advertising code. If advertising or analytics providers are added, this policy must be updated to describe their data use, cookies or similar technologies, and any required consent or opt-out choices before those features are enabled.</p></section>
      <section><h2 className="text-lg font-bold">Retention and your choices</h2><p>Account information and learning history are retained as needed to provide the account features you use and meet legitimate operational requirements. You can request account deletion or ask a privacy question by emailing <a className="text-[var(--accent)] underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We may need to verify a request before acting on it.</p></section>
      <section><h2 className="text-lg font-bold">Children</h2><p>Aptric's existing terms require users to be at least 13 years old to create an account. If you believe a child has provided personal information inappropriately, contact us at <a className="text-[var(--accent)] underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p></section>
      <section><h2 className="text-lg font-bold">Changes and contact</h2><p>We may revise this policy when the service changes. Material updates will be reflected on this page. Questions or requests can be sent to <a className="text-[var(--accent)] underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p></section>
    </PageLayout>
  );
};

export const ContactPage: React.FC = () => {
  usePageMeta({
    title: 'Contact Aptric',
    description: 'Contact Aptric about account support, public learning resources, accessibility, or corrections to educational content.',
    canonicalPath: '/contact',
  });
  return (
    <PageLayout title="Contact Aptric" description="For support, questions about public resources, or requests related to your account, use the contact route below.">
      <section><h2 className="text-lg font-bold">Email</h2><p><a className="text-[var(--accent)] underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p><p>For an educational-content correction, include the article title and describe the exact formula, step, or explanation that may be incorrect. Do not include passwords or other sensitive information.</p></section>
      <section><h2 className="text-lg font-bold">Before contacting us</h2><p>For common questions about account use, please review the <Link className="text-[var(--accent)] underline" to="/terms">Terms and Conditions</Link> and <Link className="text-[var(--accent)] underline" to="/privacy">Privacy Policy</Link>.</p></section>
    </PageLayout>
  );
};
