// Web Push delivery over the `web-push` library (VAPID). A subscription the
// push service reports gone (404/410) is deleted so it isn't retried.

import webpush from 'web-push';
import { config } from '../config.js';
import { query } from '../db.js';

export const pushEnabled = () => Boolean(config.push.publicKey && config.push.privateKey);

let configured = false;
function setup() {
  if (configured) return;
  webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey);
  configured = true;
}

/** Whether `endpoint` is an https URL on one of the allowed push services. */
export function allowedEndpoint(endpoint, hosts = config.push.endpointHosts) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  return hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
}

const webPushSend = (subscription, body, options) => {
  setup();
  return webpush.sendNotification(subscription, body, options);
};

/**
 * Sends one payload to one subscription ({ endpoint, p256dh, auth }).
 * Returns 'sent', 'gone' (subscription removed) or 'failed'.
 */
export async function send(sub, payload, { send: deliver = webPushSend, remove = removeSubscription } = {}) {
  try {
    await deliver(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 6 * 3600, urgency: 'normal' },
    );
    return 'sent';
  } catch (err) {
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      await remove(sub.endpoint).catch((e) => console.error('[push] remove', e.message));
      return 'gone';
    }
    console.error('[push] send', err?.statusCode ?? '', err?.message ?? err);
    return 'failed';
  }
}

export const removeSubscription = (endpoint) =>
  query('delete from private.push_subscriptions where endpoint = $1', [endpoint]);
