// Web Push in this browser: registers /sw.js and (un)subscribes with the API.
// The API sends the notifications; see backend/src/push.

import * as api from './api';

/** Whether this browser can receive web push at all (iOS only in an installed web app). */
export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** The VAPID key as the bytes `pushManager.subscribe` wants. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const registration = () => navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready);

/** This browser's current subscription, or null. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  return (await registration()).pushManager.getSubscription();
}

export type EnableResult = 'enabled' | 'denied';

/** Asks permission, subscribes this browser and registers it with the API. */
export async function enablePush(publicKey: string): Promise<EnableResult> {
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const reg = await registration();
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  await api.subscribePush(sub.toJSON() as api.PushSubscriptionJSON);
  return 'enabled';
}

/** Unsubscribes this browser and tells the API (best effort on the server side). */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.unsubscribePush(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}
