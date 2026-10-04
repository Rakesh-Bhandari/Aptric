// Auth emails over Google SMTP (smtp.gmail.com with an app password).
// Without SMTP settings, development builds log the link instead of sending.

import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { HttpError } from '../http.js';

let transport;

export const smtpSecure = () => config.smtp.secure ?? config.smtp.port === 465;

const getTransport = () => {
  transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: smtpSecure(),
    requireTLS: !smtpSecure(),
    connectionTimeout: config.smtp.timeoutMs,
    greetingTimeout: config.smtp.timeoutMs,
    socketTimeout: config.smtp.timeoutMs * 2,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transport;
};

/** Tests inject a fake transport ({ sendMail }); pass undefined to reset. */
export const setTransport = (t) => { transport = t; };

/** A server-log hint for the usual reasons a send fails. Never goes to clients. */
export function diagnose(err) {
  const code = err?.code;
  if (code === 'EAUTH' || err?.responseCode === 535) {
    return 'authentication failed: check SMTP_USER and SMTP_PASS (Gmail needs a 16-character app password, not the account password)';
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNECTION' || code === 'ESOCKET' || code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    return `cannot reach ${config.smtp.host}:${config.smtp.port} (secure=${smtpSecure()}): check SMTP_HOST, SMTP_PORT and SMTP_SECURE (465 needs secure=true, 587 needs secure=false)`;
  }
  if (code === 'EENVELOPE' || err?.responseCode === 550 || err?.responseCode === 553) {
    return 'sender or recipient rejected: SMTP_FROM must be SMTP_USER or an address verified with the provider';
  }
  return 'unclassified SMTP error';
}

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

const unavailable = () =>
  new HttpError(503, 'email_unavailable', "We couldn't send the email. Please try again in a minute.");

export async function sendAuthEmail(to, kind, link) {
  const message = renderEmail(kind, link);
  if (!config.smtp.host) {
    if (config.isProd) {
      console.error('[mail] SMTP_HOST is not set (and SMTP_USER is empty), so auth emails cannot be sent. Set SMTP_* in the Vercel project, see backend/.env.example');
      throw new HttpError(503, 'email_unavailable', "We can't send emails right now. Please try again later.");
    }
    console.info(`[mail] (SMTP not configured) ${kind} for ${to}: ${link}`);
    return;
  }
  try {
    await getTransport().sendMail({ from: config.smtp.from, to, ...message });
  } catch (err) {
    // Drop the cached transport so the next attempt opens a fresh connection.
    transport = undefined;
    console.error(
      `[mail] send failed (${kind}): ${err?.code ?? 'no code'} ${err?.responseCode ?? ''} ${err?.command ?? ''} ${err?.message}; ${diagnose(err)}`,
    );
    throw unavailable();
  }
}
