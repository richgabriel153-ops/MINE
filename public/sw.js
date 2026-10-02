/* InCeipt service worker: makes the app open and work without internet.
 *
 * - Pages: network first (so updates arrive), falling back to the saved copy when offline
 *   or when the network is very slow.
 * - /_next/static files never change once built, so they're served from the cache.
 * - All app pages and their files are saved in the background, so every page works offline
 *   even if it hasn't been opened yet.
 * - /api is never cached.
 */
const VERSION = "v7";
const PAGE_CACHE = `pages-${VERSION}`;
const ASSET_CACHE = `assets-${VERSION}`;
const PAGES = [
  "/", "/home", "/create", "/view", "/history", "/profile", "/settings", "/pro",
  "/more", "/account", "/quotes", "/expenses", "/profit", "/tax", "/assistant", "/terms", "/privacy", "/refunds",
];
const EXTRA = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icon.svg"];
const SLOW_NETWORK_MS = 4000;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(warm());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGE_CACHE, ASSET_CACHE]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// The app asks for a refresh of saved pages after each visit while online.
self.addEventListener("message", (event) => {
  if (event.data === "warm") event.waitUntil(warm());
});

async function warm() {
  const pages = await caches.open(PAGE_CACHE);
  const assets = await caches.open(ASSET_CACHE);
  const assetUrls = new Set(EXTRA);
  await Promise.all(
    PAGES.map(async (path) => {
      try {
        const res = await fetch(path, { cache: "no-cache", credentials: "same-origin" });
        if (!res.ok) return;
        await pages.put(path, res.clone());
        const html = await res.text();
        for (const match of html.matchAll(/\/_next\/static\/[^"'\s\\)<>]+/g)) assetUrls.add(match[0]);
      } catch {
        // offline: keep whatever we saved before
      }
    }),
  );
  await Promise.all(
    [...assetUrls].map(async (url) => {
      try {
        if (url.startsWith("/_next/static/") && (await assets.match(url))) return;
        const res = await fetch(url);
        if (res.ok) await assets.put(url, res);
      } catch {
        // ignore
      }
    }),
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // In-app navigation data. When offline this fails and Next.js loads the page normally,
  // which is then served from the saved pages below.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(page(event, url));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit ?? Response.error());
  return hit ?? network;
}

/** Pages are saved by path only: /view?id=123 uses the saved /view page. */
async function page(event, url) {
  const cache = await caches.open(PAGE_CACHE);
  const key = PAGES.includes(url.pathname) ? url.pathname : null;
  const network = fetch(event.request).then((res) => {
    if (res.ok && key) cache.put(key, res.clone());
    return res;
  });
  event.waitUntil(network.catch(() => undefined));

  const saved = key ? await cache.match(key) : undefined;
  if (!saved) {
    try {
      return await network;
    } catch {
      return (await cache.match("/home")) ?? Response.error();
    }
  }
  // Use the network if it answers quickly; otherwise show the saved page.
  const timeout = new Promise((resolve) => setTimeout(() => resolve(saved), SLOW_NETWORK_MS));
  try {
    return await Promise.race([network, timeout]);
  } catch {
    return saved;
  }
}
