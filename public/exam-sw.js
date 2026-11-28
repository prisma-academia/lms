/* eslint-disable */
/**
 * Exam service worker — keeps the CBT window loadable with no network.
 *
 * Scope: /exam/ only. Registered by the exam window; nothing else in the
 * academy is affected.
 *
 * - The exam page itself: network first, cached copy when offline, so a reload
 *   or crash mid-exam still opens the exam (answers come from IndexedDB).
 * - Next's build files (/_next/static): cache first — they are immutable.
 * - Question media (images, audio): cached when the window sends the list.
 * - /api/*: never cached. The window handles offline itself and syncs later.
 */
const VERSION = "v1";
const PAGES = `exam-pages-${VERSION}`;
const STATIC = `exam-static-${VERSION}`;
const MEDIA = `exam-media-${VERSION}`;
const KEEP = [PAGES, STATIC, MEDIA];
// In development Next's build files keep their names between edits, so they
// must come from the network first; in production they are content-hashed.
const DEV = new URL(self.location.href).searchParams.get("dev") === "1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("exam-") && !KEEP.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

const OFFLINE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Exam — offline</title><body style="font-family:system-ui;padding:2rem;max-width:40rem;margin:auto">
<h1>You are offline</h1><p>Your answers are saved on this device. Reconnect to the network and reload this page to continue the exam.</p>
<button onclick="location.reload()" style="font-size:1rem;padding:.6rem 1rem">Try again</button></body>`;

async function pageFetch(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await Promise.race([fetch(request), timeout(6000)]);
    if (response && response.ok && response.type === "basic") cache.put(request.url, response.clone());
    return response;
  } catch (e) {
    const exact = await cache.match(request.url, { ignoreSearch: false });
    if (exact) return exact;
    const loose = await cache.match(request.url, { ignoreSearch: true });
    if (loose) return loose;
    return new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, name) {
  const cache = await caches.open(name);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw e;
  }
}

async function staleWhileRevalidate(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit || network;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && url.pathname.startsWith("/api/")) return; // network only
  if (request.mode === "navigate") {
    if (sameOrigin && url.pathname.startsWith("/exam")) event.respondWith(pageFetch(request));
    return;
  }
  if (sameOrigin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(DEV ? networkFirst(request, STATIC) : cacheFirst(request, STATIC));
    return;
  }
  if (request.headers.get("RSC") === "1") return; // React Server Component payloads are not cached
  if (sameOrigin) {
    event.respondWith(DEV ? networkFirst(request, STATIC) : staleWhileRevalidate(request, STATIC));
    return;
  }
  // Cross-origin (question media on object storage): serve what was cached.
  event.respondWith(
    caches.open(MEDIA).then(async (cache) => (await cache.match(request.url)) || fetch(request))
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "precache" && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const pages = await caches.open(PAGES);
        const media = await caches.open(MEDIA);
        const stat = await caches.open(STATIC);
        let done = 0;
        for (const raw of data.urls.slice(0, 500)) {
          try {
            const u = new URL(raw, self.location.origin);
            const same = u.origin === self.location.origin;
            const target = same ? (u.pathname.startsWith("/exam") ? pages : stat) : media;
            if (await target.match(u.href)) {
              done++;
              continue;
            }
            const res = await fetch(u.href, same ? { credentials: "same-origin" } : { mode: "no-cors" });
            if (res && (res.ok || res.type === "opaque")) {
              await target.put(u.href, res);
              done++;
            }
          } catch (e) {}
        }
        const clients = await self.clients.matchAll();
        clients.forEach((c) => c.postMessage({ type: "precached", done, total: data.urls.length }));
      })()
    );
  }
  if (data.type === "clear") {
    event.waitUntil(Promise.all(KEEP.map((n) => caches.delete(n))));
  }
});
