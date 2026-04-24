// ============================================================
// Service Worker — Steve's Logistics Dashboard
// ============================================================
// CACHE INVALIDATION: Bump CACHE_VERSION after every pipeline
// run that regenerates chart files. The activate handler will
// automatically delete all old caches on the next page load.
// ============================================================

const CACHE_VERSION = 'v3';

const STATIC_CACHE = `static-${CACHE_VERSION}`;   // shell + CDN libs
const CHART_CACHE  = `charts-${CACHE_VERSION}`;   // interactive HTML charts (lazy)
const IMAGE_CACHE  = `images-${CACHE_VERSION}`;   // PNG thumbnails (lazy)

const BASE = '/shipping-analytics-dashboard';

// Small shell pre-cached on install (~200 KB total)
const PRECACHE_URLS = [
    `${BASE}/`,
    `${BASE}/index.html`,
    `${BASE}/visualizations/dashboard_metrics.js`,
    `${BASE}/visualizations/MasonHubLogo.png`,
    `${BASE}/visualizations/RedStagLogo.png`,
    `${BASE}/visualizations/shipfusionlogo.jpg`,
];

// ── Install: pre-cache the app shell ────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// ── Activate: delete stale caches from old versions ─────────
self.addEventListener('activate', (event) => {
    const validCaches = [STATIC_CACHE, CHART_CACHE, IMAGE_CACHE];
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => !validCaches.includes(key))
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Helpers ──────────────────────────────────────────────────

// Cache-first: serve from cache, fall back to network and store result
async function cacheFirst(cacheName, request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
        const cache = await caches.open(cacheName);
        cache.put(request, response.clone());
    }
    return response;
}

// Network-first: try network, fall back to cache if offline/error
async function networkFirst(cacheName, request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw new Error(`Network failed and no cache for: ${request.url}`);
    }
}

// ── Fetch: route requests to the right strategy ──────────────
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle GET requests
    if (request.method !== 'GET') return;

    // 1. CDN resources (Plotly, Tailwind) — cache-first, treated as immutable
    if (url.hostname === 'cdn.plot.ly' || url.hostname === 'cdn.tailwindcss.com') {
        event.respondWith(cacheFirst(STATIC_CACHE, request));
        return;
    }

    // Only handle same-origin requests from here on
    if (url.origin !== self.location.origin) return;

    // 2. Interactive chart HTML files — cache-first, lazy populate
    if (url.pathname.includes('/visualizations/') && url.pathname.endsWith('.html')) {
        event.respondWith(cacheFirst(CHART_CACHE, request));
        return;
    }

    // 3. PNG / JPG thumbnail images — cache-first, lazy populate
    if (url.pathname.match(/\.(png|jpg|jpeg)$/i)) {
        event.respondWith(cacheFirst(IMAGE_CACHE, request));
        return;
    }

    // 4. dashboard_metrics.js and index.html — network-first so updates appear immediately
    if (url.pathname.endsWith('dashboard_metrics.js') ||
        url.pathname.endsWith('/') ||
        url.pathname.endsWith('index.html')) {
        event.respondWith(networkFirst(STATIC_CACHE, request));
        return;
    }
});
