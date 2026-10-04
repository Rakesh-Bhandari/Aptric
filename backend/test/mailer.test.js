import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { diagnose, sendAuthEmail, setTransport, smtpSecure } from '../src/auth/mailer.js';

const saved = { ...config.smtp };
const savedProd = config.isProd;
let logged;
const origError = console.error;

beforeEach(() => {
  Object.assign(config.smtp, { host: 'smtp.example.com', port: 465, secure: undefined, from: 'Aptric <a@example.com>' });
  logged = [];
  console.error = (...a) => logged.push(a.join(' '));
});

afterEach(() => {
  Object.assign(config.smtp, saved);
  config.isProd = savedProd;
  console.error = origError;
  setTransport(undefined);
});

test('sendAuthEmail sends through the transport', async () => {
  const sent = [];
  setTransport({ sendMail: async (m) => { sent.push(m); } });
  await sendAuthEmail('u@example.com', 'signup', 'https://x/auth/callback?token=t');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'u@example.com');
  assert.equal(sent[0].from, 'Aptric <a@example.com>');
  assert.match(sent[0].text, /token=t/);
});

test('transport failure becomes a friendly 503 and logs a specific reason without secrets', async () => {
  config.smtp.pass = 'super-secret';
  setTransport({ sendMail: async () => { throw Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 }); } });
  await assert.rejects(sendAuthEmail('u@example.com', 'signup', 'https://x/'), (err) => {
    assert.equal(err.status, 503);
    assert.equal(err.code, 'email_unavailable');
    assert.doesNotMatch(err.message, /EAUTH|Invalid login|secret/);
    return true;
  });
  assert.match(logged[0], /EAUTH/);
  assert.match(logged[0], /SMTP_PASS/);
  assert.doesNotMatch(logged[0], /super-secret/);
});

test('missing SMTP_HOST in production is a 503; in development it only logs', async () => {
  config.smtp.host = undefined;
  config.isProd = true;
  await assert.rejects(sendAuthEmail('u@example.com', 'signup', 'https://x/'), { code: 'email_unavailable' });
  assert.match(logged[0], /SMTP_HOST is not set/);
  config.isProd = false;
  const info = console.info;
  console.info = () => {};
  try {
    await sendAuthEmail('u@example.com', 'signup', 'https://x/');
  } finally {
    console.info = info;
  }
});

test('secure follows the port unless SMTP_SECURE overrides it', () => {
  assert.equal(smtpSecure(), true);
  config.smtp.port = 587;
  assert.equal(smtpSecure(), false);
  config.smtp.secure = true;
  assert.equal(smtpSecure(), true);
});

test('diagnose names the likely fix', () => {
  assert.match(diagnose({ code: 'ETIMEDOUT' }), /SMTP_PORT/);
  assert.match(diagnose({ code: 'EENVELOPE' }), /SMTP_FROM/);
});
