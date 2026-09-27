// Panda Chef offline helper. Keeps the last copy of pages, recipes and the shopping list so the
// app opens in a shop with no signal. Always tries the network first when there is one.
const VERSION = "pc-v3";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const DATA = `${VERSION}-data`;
const SLOW_MS = 3500; // weak signal: show the saved copy after this long, update in the background

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear") event.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req, STATIC));
  } else if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, PAGES));
  } else if (url.pathname === "/api/shopping-lists" || url.pathname.startsWith("/api/recipes") || url.pathname === "/api/household" || url.pathname === "/api/tags" || url.pathname === "/api/ingredients") {
    event.respondWith(networkFirst(req, DATA));
  }
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, name) {
  const cache = await caches.open(name);
  const network = fetch(req).then((res) => {
    if (res.ok && !res.redirected) cache.put(req, res.clone());
    return res;
  });
  const saved = () => cache.match(req);
  try {
    const first = await Promise.race([network, new Promise((r) => setTimeout(r, SLOW_MS, "slow"))]);
    if (first !== "slow") return first;
    return (await saved()) || (await network);
  } catch (err) {
    const hit = await saved();
    if (hit) return hit;
    throw err;
  }
}
