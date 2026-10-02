// Auth emails over SMTP (any provider: Resend, SES, Postmark, Gmail, ...).
// Without SMTP settings, development builds log the link instead of sending.

import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { HttpError } from '../http.js';

let transport;

const getTransport = () => {
  transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transport;
};

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TEMPLATES = {
  signup: {
    subject: 'Confirm your Aptric account',
    heading: 'Confirm your email',
    body: 'Confirm this address to activate your Aptric account.',
    action: 'Confirm email',
  },
  magiclink: {
    subject: 'Your Aptric sign-in link',
    heading: 'Your sign-in link',
    body: 'Use this link to sign in to Aptric.',
    action: 'Sign in',
  },
  recovery: {
    subject: 'Reset your Aptric password',
    heading: 'Reset your password',
    body: 'Use this link to choose a new Aptric password.',
    action: 'Reset password',
  },
};

export function renderEmail(kind, link) {
  const t = TEMPLATES[kind];
  const minutes = config.emailLinkMinutes;
  const expiry = minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`;
  const footer = `This link works once and expires in ${expiry}. If you didn't request this, you can ignore this email.`;
  return {
    subject: t.subject,
    text: `${t.body}\n\n${t.action}: ${link}\n\n${footer}`,
    html: `<h2>${t.heading}</h2>\n<p>${t.body}</p>\n<p><a href="${escapeHtml(link)}">${t.action}</a></p>\n<p>${footer}</p>`,
  };
}

export async function sendAuthEmail(to, kind, link) {
  const message = renderEmail(kind, link);
  if (!config.smtp.host) {
    if (config.isProd) {
      console.error('[mail] SMTP_HOST is not set, so auth emails cannot be sent');
      throw new HttpError(503, 'email_unavailable', "We can't send emails right now. Please try again later.");
    }
    console.info(`[mail] (SMTP not configured) ${kind} for ${to}: ${link}`);
    return;
  }
  try {
    await getTransport().sendMail({ from: config.smtp.from, to, ...message });
  } catch (err) {
    console.error('[mail] send failed', err.message);
    throw new HttpError(503, 'email_unavailable', "We couldn't send the email. Please try again in a minute.");
  }
}
