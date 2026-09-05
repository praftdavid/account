const CACHE_NAME = 'praft-shell-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/portal.html', '/portal-manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Supabase 등 외부 API 호출은 항상 최신 데이터가 필요하므로 그대로 통과시키고,
// 같은 출처의 정적 파일(앱 셸)만 network-first + 캐시 폴백으로 오프라인에서도 마지막 화면이 뜨게 한다.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
