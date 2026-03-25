export type PwaStatus = {
  supported: boolean;
  registered: boolean;
  offline: boolean;
  updateAvailable: boolean;
};

type Listener = (s: PwaStatus) => void;

const listeners = new Set<Listener>();

let status: PwaStatus = {
  supported: false,
  registered: false,
  offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  updateAvailable: false,
};

function emit() {
  for (const l of listeners) l(status);
}

export function subscribePwaStatus(listener: Listener) {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

export async function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  status = { ...status, supported: true };
  emit();

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    status = { ...status, registered: true };
    emit();

    if (reg.waiting) {
      status = { ...status, updateAvailable: true };
      emit();
    }

    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          status = { ...status, updateAvailable: true };
          emit();
        }
      });
    });
  } catch {
    status = { ...status, registered: false };
    emit();
  }

  const onOnline = () => {
    status = { ...status, offline: false };
    emit();
  };
  const onOffline = () => {
    status = { ...status, offline: true };
    emit();
  };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
}

