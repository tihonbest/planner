/* Офлайн-кэш для Индикатора сложности расписания.
   Файл должен лежать рядом с index.html в опубликованной папке сайта. */
'use strict';

const CACHE_NAME = 'planner-offline-v1';
const APP_URL = self.registration.scope;
const INDEX_URL = new URL('index.html', APP_URL).href;
const SHELL_URLS = [APP_URL, INDEX_URL];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    for (const url of SHELL_URLS) {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) await cache.put(url, response);
      } catch (error) {
        // Ошибка одного адреса не мешает установить Service Worker.
      }
    }

    try {
      const iconURL = new URL('logo.jpeg', APP_URL).href;
      const response = await fetch(iconURL, { cache: 'reload' });
      if (response.ok) await cache.put(iconURL, response);
    } catch (error) {}

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('planner-offline-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Внешние запросы, включая погоду Open-Meteo, не перехватываем.
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(APP_URL)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(request)) ||
          (await cache.match(APP_URL)) ||
          (await cache.match(INDEX_URL)) ||
          new Response('Планер ещё не сохранён для работы офлайн. Откройте сайт с интернетом хотя бы один раз.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      throw error;
    }
  })());
});
