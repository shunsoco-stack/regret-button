/* Offline support for this single, harmless screen. No push or background sync. */
const CACHE_PREFIX = "regret-button-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const HOME_URL = new URL("/", self.location.origin).href;
const APP_ASSETS = new Set([
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
]);

function assetUrl(value) {
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || url.username || url.password) return null;
    const isNextStatic =
      url.pathname.startsWith("/_next/static/") &&
      /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|webp|avif|svg|ico)$/i.test(url.pathname);
    if (!isNextStatic && !APP_ASSETS.has(url.pathname)) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function canCache(response) {
  return (
    response.ok &&
    response.type !== "opaque" &&
    !response.redirected &&
    !/\bno-store\b/i.test(response.headers.get("cache-control") || "")
  );
}

function isHtml(response) {
  return (response.headers.get("content-type") || "").includes("text/html");
}

async function cached(request) {
  try {
    return await (await caches.open(CACHE_NAME)).match(request);
  } catch {
    return undefined;
  }
}

async function remember(request, response) {
  if (!canCache(response)) return;
  try {
    await (await caches.open(CACHE_NAME)).put(request, response.clone());
  } catch {
    // Private browsing, disabled storage, or quota pressure must not break the app.
  }
}

async function cacheAsset(value) {
  const url = assetUrl(value);
  if (!url) return;
  const existing = await cached(url.href);
  if (existing) return existing;
  const response = await fetch(url.href, { credentials: "same-origin" });
  if (canCache(response) && !isHtml(response)) {
    await remember(url.href, response);
    if (url.pathname.endsWith(".css")) {
      const css = await response.clone().text();
      const references = [...css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)];
      const dependencies = references
        .map((match) => assetUrl(new URL(match[1], url.href).href))
        .filter((dependency) => dependency && !dependency.pathname.endsWith(".css"));
      await Promise.allSettled(dependencies.slice(0, 80).map((dependency) => cacheAsset(dependency.href)));
    }
  }
  return response;
}

async function warmShell(response) {
  if (!canCache(response) || !isHtml(response)) return;
  const html = await response.text();
  const references = [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)];
  const urls = references
    .map((match) => assetUrl(match[1].replaceAll("&amp;", "&")))
    .filter(Boolean)
    .map((url) => url.href);
  await Promise.allSettled([...new Set(urls)].slice(0, 80).map(cacheAsset));
}

async function installShell() {
  const response = await fetch(HOME_URL, { cache: "reload", credentials: "same-origin" });
  if (!canCache(response) || !isHtml(response)) throw new Error("App shell unavailable");
  await remember(HOME_URL, response);
  await warmShell(response.clone());
  await Promise.allSettled([...APP_ASSETS].map(cacheAsset));
  await self.skipWaiting();
}

async function navigation(request) {
  try {
    const response = await fetch(request);
    if (canCache(response) && isHtml(response)) {
      await remember(HOME_URL, response);
      return response;
    }
    if (!response.ok) return (await cached(HOME_URL)) || response;
    return response;
  } catch {
    return (
      (await cached(HOME_URL)) ||
      new Response("オフラインです。初回はオンラインで開いてから、もう一度お試しください。", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function immutableAsset(request) {
  const existing = await cached(request);
  if (existing) return existing;
  try {
    return (await cacheAsset(request.url)) || Response.error();
  } catch {
    return Response.error();
  }
}

async function refreshableAsset(request) {
  try {
    const response = await fetch(request);
    if (canCache(response) && !isHtml(response)) await remember(request, response);
    if (!response.ok) return (await cached(request)) || response;
    return response;
  } catch {
    return (await cached(request)) || Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(installShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys().catch(() => []);
      await Promise.allSettled(
        names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Only real home navigations are pages. Never cache RSC, APIs, or analytics.
  if (request.mode === "navigate" && url.pathname === "/" && request.headers.get("RSC") !== "1") {
    const response = navigation(request);
    event.respondWith(response);
    event.waitUntil(response.then((result) => warmShell(result.clone())).catch(() => {}));
    return;
  }
  if (!assetUrl(request.url)) return;
  event.respondWith(url.pathname.startsWith("/_next/static/") ? immutableAsset(request) : refreshableAsset(request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_LOADED_ASSETS" || !Array.isArray(event.data.urls)) return;
  try {
    if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  } catch {
    return;
  }
  // Registration happens after hydration; warm assets loaded before SW control too.
  const urls = event.data.urls
    .filter((value) => typeof value === "string" && assetUrl(value))
    .slice(0, 80);
  event.waitUntil(Promise.allSettled([...new Set(urls)].map(cacheAsset)));
});
