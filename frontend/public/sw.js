const CACHE_NAME = 'expplan-shell-v1';

const SHELL_FILES = ['/', '/dashboard/inicio', '/manifest.webmanifest', '/logo.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SHELL_FILES);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    (async () => {
      try {
        const net = await fetch(req);
        return net;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        const fallback = await caches.match('/dashboard/inicio');
        if (fallback) return fallback;
        throw new Error('offline');
      }
    })()
  );
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data ? event.data.json() : {};
      } catch {
        payload = { title: 'Notificação', body: event.data ? event.data.text() : '' };
      }

      const title = payload.title || 'Notificação';
      const body = payload.body || payload.mensagem || '';
      const route = payload.route || payload.rota || '/dashboard/notificacoes';
      const data = { route, payload };

      await self.registration.showNotification(title, {
        body,
        data,
        icon: '/logo.svg',
        badge: '/logo.svg',
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = event.notification?.data?.route || '/dashboard/notificacoes';

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if ('focus' in c) {
          try {
            await c.focus();
          } catch {}
          try {
            await c.navigate(route);
          } catch {}
          return;
        }
      }
      await self.clients.openWindow(route);
    })()
  );
});

