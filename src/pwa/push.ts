import { api } from '../api';
import type { ApiResponse } from '../lib/api-types';

/** Shown only when FEATURE_PUSH_NOTIFICATIONS is on. Without VAPID keys the server answers 409 feature_not_configured. */
const KEY_URL = '/api/v1/notifications/push/public-key';
const SUBSCRIBE_URL = '/api/v1/notifications/push/subscribe';
const UNSUBSCRIBE_URL = '/api/v1/notifications/push/unsubscribe';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '='));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Asks permission, subscribes this browser and tells the server. The server holds only the endpoint. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site in your browser settings.');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api.get<ApiResponse<'/api/v1/notifications/push/public-key'>>(KEY_URL);
  const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const { endpoint, keys } = subscription.toJSON();
  await api.post(SUBSCRIBE_URL, { endpoint, keys });
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api.post(UNSUBSCRIBE_URL, { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
