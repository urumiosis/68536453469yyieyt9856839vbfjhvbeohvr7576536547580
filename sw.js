// Retire the former third-party service worker on this authentication origin.
// A service worker must never proxy certificate, session or private-code traffic.
self.addEventListener('install', event => {
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.registration.unregister();
  })());
});
