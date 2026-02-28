/*
 * Gnoke Library — service-worker.js
 * Copyright (C) 2026 Edmund Sparrow — GNU GPL v3
 */

const CACHE = 'gnoke-library-v2.01';

const ASSETS = [
  '/',
  'index.html',
  'styles/style.css',
  'scripts/db-core.js',
  'scripts/db-library.js',
  'scripts/app.js',
  'scripts/notification.js',
  'manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
