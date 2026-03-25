export type PushSubscriptionKeys = { p256dh: string; auth: string };

export type PushSubscriptionPayload = {
  endpoint: string;
  keys: PushSubscriptionKeys;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function getBrowserPushSubscription(): Promise<PushSubscriptionPayload | null> {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator)) return null;
  if (!('PushManager' in window)) return null;

  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;

  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

export async function subscribeBrowserPush(): Promise<PushSubscriptionPayload> {
  if (typeof window === 'undefined') throw new Error('Sem browser');
  if (!('serviceWorker' in navigator)) throw new Error('Service Worker não suportado');
  if (!('PushManager' in window)) throw new Error('Push não suportado');

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
  if (!publicKey) throw new Error('VAPID public key não configurada');

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Assinatura inválida');
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

export async function unsubscribeBrowserPush() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await sub.unsubscribe();
}

