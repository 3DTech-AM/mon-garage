
const CACHE_NAME = 'mon-garage-v2';

// Base URL derived from the service worker location
const BASE_URL = new URL('./', self.location.href);

const assetUrl = (path = '') =>
  new URL(path, BASE_URL).href;

const STATIC_ASSETS = [
  assetUrl(),
  assetUrl('manifest.json'),
  assetUrl('icons/icon-192.png'),
  assetUrl('icons/icon-512.png'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of STATIC_ASSETS) {
        try {
          await cache.add(url);
        } catch (error) {
          console.warn('Cache asset unavailable:', url);
        }
      }
    })
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();

      await Promise.all(
        names
          .filter((name) =>
            name.startsWith('mon-garage-') &&
            name !== CACHE_NAME
          )
          .map((name) => caches.delete(name))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(BASE_URL.href)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(async () => {
          return (
            await caches.match(event.request) ||
            await caches.match(assetUrl()) ||
            Response.error()
          );
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;

      const response = await fetch(event.request);

      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }

      return response;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'Mon Garage',
    body: 'Nouvelle notification',
  };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: assetUrl('icons/icon-192.png'),
    badge: assetUrl('icons/icon-192.png'),
    tag: data.tag || 'mon-garage-notification',
    data: {
      vehicleId: data.vehicleId,
      url: assetUrl(),
    },
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'Mon Garage',
      options
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const vehicleId = event.notification.data?.vehicleId;
  const targetUrl = assetUrl();

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of clients) {
        if (client.url.startsWith(BASE_URL.href)) {
          await client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            vehicleId,
          });
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Re-subscription is handled when the app is reopened.
});
