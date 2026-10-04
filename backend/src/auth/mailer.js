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

// Brand colours (see prompts/frontend-redesign/BRAND.md). Email clients ignore
// stylesheets and CSS variables, so everything is inline with solid fallbacks.
const BRAND = {
  navy: '#0A2540',
  blue: '#2563EB',
  violet: '#7C3AED',
  sky: '#38BDF8',
  text: '#0F172A',
  muted: '#475569',
  page: '#F8FAFC',
  border: '#E2E8F0',
  font: "'Plus Jakarta Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

function renderHtml({ heading, body, action, link, footer }) {
  const url = escapeHtml(link);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.page};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#FFFFFF;border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;font-family:${BRAND.font};">
<tr><td bgcolor="${BRAND.navy}" style="background:${BRAND.navy};padding:22px 32px;font-size:20px;font-weight:800;letter-spacing:4px;color:#FFFFFF;">APTRIC</td></tr>
<tr><td bgcolor="${BRAND.blue}" height="4" style="height:4px;line-height:4px;font-size:0;background:${BRAND.blue};background-image:linear-gradient(90deg,${BRAND.blue},${BRAND.violet});">&nbsp;</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;font-weight:800;color:${BRAND.navy};">${heading}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${BRAND.text};">${body}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${BRAND.blue}" style="border-radius:999px;background:${BRAND.blue};background-image:linear-gradient(135deg,${BRAND.blue},${BRAND.violet});">
<a href="${url}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">${action}</a>
</td></tr></table>
<p style="margin:24px 0 4px;font-size:13px;line-height:1.5;color:${BRAND.muted};">Button not working? Paste this link into your browser:</p>
<p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${url}" style="color:${BRAND.blue};">${url}</a></p>
</td></tr>
<tr><td style="padding:20px 32px;background:${BRAND.page};border-top:1px solid ${BRAND.border};font-size:13px;line-height:1.5;color:${BRAND.muted};">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderEmail(kind, link) {
  const t = TEMPLATES[kind];
  const minutes = config.emailLinkMinutes;
  const expiry = minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`;
  const footer = `This link works once and expires in ${expiry}. If you didn't request this, you can ignore this email.`;
  return {
    subject: t.subject,
    text: `${t.body}\n\n${t.action}: ${link}\n\n${footer}`,
    html: renderHtml({ ...t, link, footer }),
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
