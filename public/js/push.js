// Abonnement de cet appareil aux notifications push.
import { get, post } from './api.js';

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;

function keyToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const sameKey = (a, b) => a && b && a.byteLength === b.byteLength && new Uint8Array(a).every((v, i) => v === b[i]);

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('Ce navigateur ne gère pas les notifications.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications refusées. Autorise-les dans les réglages du navigateur.');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await get('/push/key');
  const serverKey = keyToBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // Abonnement créé avec une autre clé serveur : on le renouvelle.
  if (sub && !sameKey(sub.options?.applicationServerKey, serverKey)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });
  await post('/push/subscribe', { subscription: sub.toJSON() });
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => null);
  await sub.unsubscribe();
}

/** Au démarrage : si cet appareil est abonné, on rattache l'abonnement au compte connecté. */
export async function syncPush() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return;
    const sub = await currentSubscription();
    if (sub) await post('/push/subscribe', { subscription: sub.toJSON() });
  } catch { /* silencieux : ce n'est qu'une resynchronisation */ }
}
