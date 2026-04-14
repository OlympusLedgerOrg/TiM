import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

declare let self: ServiceWorkerGlobalScope;

// SyncEvent type for Background Sync API
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
  readonly lastChance: boolean;
}

// ─── Precache Vite-built assets ───────────────────────────────────────────────
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ─── API Caching Strategy ─────────────────────────────────────────────────────

// Andon board (public, read-only) — NetworkFirst with 30s cache
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/andon'),
  new NetworkFirst({
    cacheName: 'andon-api',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 5 * 60 }),
    ],
  }),
);

// Equipment and station data — NetworkFirst so offline mode works
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/api/v1/equipment') ||
    url.pathname.startsWith('/api/v1/station') ||
    url.pathname.startsWith('/api/v1/plant-areas'),
  new NetworkFirst({
    cacheName: 'api-data',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 }),
    ],
  }),
);

// ─── Background Sync for offline consume/produce actions ──────────────────────
const bgSyncPlugin = new BackgroundSyncPlugin('offline-actions-queue', {
  maxRetentionTime: 24 * 60, // Retry for 24 hours
});

// POST requests to station (consume/produce) — queue when offline
registerRoute(
  ({ url, request }) =>
    (url.pathname.startsWith('/api/v1/station/consume') ||
     url.pathname.startsWith('/api/v1/station/produce') ||
     url.pathname.startsWith('/api/v1/equipment')) &&
    request.method === 'POST',
  new NetworkFirst({
    cacheName: 'api-mutations',
    plugins: [bgSyncPlugin],
  }),
  'POST',
);

// Also queue PUT requests (equipment status, close downtime)
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/v1/equipment') && request.method === 'PUT',
  new NetworkFirst({
    cacheName: 'api-mutations',
    plugins: [bgSyncPlugin],
  }),
  'PUT',
);

// ─── Static Asset Caching ─────────────────────────────────────────────────────

// Google Fonts / CDN fonts
registerRoute(
  ({ url }) =>
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 }),
    ],
  }),
);

// Images and icons
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
);

// ─── Offline Fallback ─────────────────────────────────────────────────────────

// Fallback for navigation requests — serve the app shell
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'pages',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// ─── Background Sync — wire offlineQueue to SW sync event ─────────────────────

self.addEventListener('sync', ((event: SyncEvent) => {
  if (event.tag === 'offline-queue-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'FLUSH_OFFLINE_QUEUE' });
        });
      }),
    );
  }
}) as EventListener);

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── SW Lifecycle ─────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
