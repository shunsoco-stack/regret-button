// @vitest-environment node

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://regret-button.example";
const CURRENT_CACHE = "regret-button-v1";
const script = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const shell = `<!doctype html><html><head>
  <link href="/_next/static/css/app-a123.css" rel="stylesheet">
  <script src="/_next/static/chunks/app-b456.js"></script>
  <script src="https://external.example/other.js"></script>
  <script src="/_vercel/insights/script.js"></script>
  <link href="/api/not-an-asset" rel="preload">
</head><body>後悔ボタン</body></html>`;

type RequestLike = { url: string; method: string; mode: string; headers: Headers };
type CacheKey = string | RequestLike | Request;
type WorkerEvent = {
  request?: RequestLike;
  data?: unknown;
  source?: { url: string };
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (promise: Promise<Response>) => void;
};

function urlOf(value: CacheKey) {
  return new URL(typeof value === "string" ? value : value.url, ORIGIN).href;
}

function htmlResponse(value = shell, status = 200, headers: Record<string, string> = {}) {
  return new Response(value, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

function request(path: string, options: Partial<RequestLike> = {}): RequestLike {
  return { url: new URL(path, ORIGIN).href, method: "GET", mode: "cors", headers: new Headers(), ...options };
}

function createWorker() {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const store = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name)!;
  };
  const cacheStorage = {
    open: vi.fn(async (name: string) => ({
      match: async (key: CacheKey) => store(name).get(urlOf(key))?.clone(),
      put: async (key: CacheKey, response: Response) => { store(name).set(urlOf(key), response.clone()); },
    })),
    keys: vi.fn(async () => [...stores.keys()]),
    delete: vi.fn(async (name: string) => stores.delete(name)),
  };
  const fetch = vi.fn(async (input: CacheKey) => {
    const url = new URL(urlOf(input));
    if (url.pathname === "/") return htmlResponse();
    if (url.pathname.endsWith(".css")) {
      return new Response("@font-face{src:url('/_next/static/media/font-c789.woff2')}body{color:white}", {
        headers: { "content-type": "text/css" },
      });
    }
    return new Response("asset", { headers: { "content-type": "application/octet-stream" } });
  });
  const skipWaiting = vi.fn(async () => {});
  const claim = vi.fn(async () => {});
  const context = createContext({
    self: {
      location: { origin: ORIGIN },
      clients: { claim },
      skipWaiting,
      addEventListener: (name: string, listener: (event: WorkerEvent) => void) => { listeners.set(name, listener); },
    },
    caches: cacheStorage,
    fetch,
    URL,
    Request,
    Response,
    Headers,
  });
  runInContext(script, context, { filename: "sw.js" });

  async function dispatch(type: string, fields: Partial<WorkerEvent> = {}) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    const event: WorkerEvent = {
      ...fields,
      waitUntil: (promise) => { pending.push(promise); },
      respondWith: (promise) => { response = promise; },
    };
    listeners.get(type)?.(event);
    const resolved = response ? await response : undefined;
    await Promise.all(pending);
    return resolved;
  }

  function seed(path: string, response: Response, cacheName = CURRENT_CACHE) {
    store(cacheName).set(urlOf(path), response);
  }

  return { dispatch, fetch, cacheStorage, seed, stores, skipWaiting, claim };
}

describe("service worker", () => {
  it("prepares HTML, initial Next assets, CSS fonts, and icons on the very first online visit", async () => {
    const worker = createWorker();
    await worker.dispatch("install");
    const saved = worker.stores.get(CURRENT_CACHE)!;
    expect(saved.has(`${ORIGIN}/`)).toBe(true);
    expect(saved.has(`${ORIGIN}/_next/static/chunks/app-b456.js`)).toBe(true);
    expect(saved.has(`${ORIGIN}/_next/static/css/app-a123.css`)).toBe(true);
    expect(saved.has(`${ORIGIN}/_next/static/media/font-c789.woff2`)).toBe(true);
    expect(saved.has(`${ORIGIN}/manifest.webmanifest`)).toBe(true);
    expect(saved.has(`${ORIGIN}/icon.svg`)).toBe(true);
    expect(saved.has(`${ORIGIN}/icons/icon-192.png`)).toBe(true);
    expect(saved.has(`${ORIGIN}/icons/icon-512.png`)).toBe(true);
    const fetched = worker.fetch.mock.calls.map(([input]) => urlOf(input));
    expect(fetched.some((url) => url.includes("external.example") || url.includes("/_vercel/") || url.includes("/api/"))).toBe(false);
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });

  it("uses fresh online HTML, then returns that same app when offline", async () => {
    const worker = createWorker();
    worker.seed("/", htmlResponse("older shell"));
    worker.fetch.mockResolvedValueOnce(htmlResponse("latest shell"));
    const online = await worker.dispatch("fetch", { request: request("/", { mode: "navigate" }) });
    expect(await online?.text()).toBe("latest shell");
    worker.fetch.mockRejectedValue(new TypeError("Offline"));
    const offline = await worker.dispatch("fetch", { request: request("/?from=home", { mode: "navigate" }) });
    expect(await offline?.text()).toBe("latest shell");
    expect(offline?.status).toBe(200);
  });

  it("serves saved immutable assets without the network and remembers new ones", async () => {
    const worker = createWorker();
    worker.seed("/_next/static/chunks/cached-123.js", new Response("cached asset"));
    const cached = await worker.dispatch("fetch", { request: request("/_next/static/chunks/cached-123.js") });
    expect(await cached?.text()).toBe("cached asset");
    expect(worker.fetch).not.toHaveBeenCalled();
    const fetched = await worker.dispatch("fetch", { request: request("/_next/static/chunks/new-456.js") });
    expect(await fetched?.text()).toBe("asset");
    expect(worker.stores.get(CURRENT_CACHE)?.has(`${ORIGIN}/_next/static/chunks/new-456.js`)).toBe(true);
  });

  it("refreshes a manifest online and falls back to the saved one offline", async () => {
    const worker = createWorker();
    worker.seed("/manifest.webmanifest", new Response("old manifest"));
    worker.fetch.mockResolvedValueOnce(new Response("new manifest"));
    const online = await worker.dispatch("fetch", { request: request("/manifest.webmanifest") });
    expect(await online?.text()).toBe("new manifest");
    worker.fetch.mockRejectedValue(new TypeError("Offline"));
    const offline = await worker.dispatch("fetch", { request: request("/manifest.webmanifest") });
    expect(await offline?.text()).toBe("new manifest");
  });

  it.each([
    request("https://external.example/_next/static/chunks/test-123.js"),
    request("/", { method: "POST", mode: "navigate" }),
    request("/_vercel/insights/script.js"),
    request("/_vercel/insights/event", { method: "POST" }),
    request("/api/private"),
    request("/api/private", { mode: "navigate" }),
    request("/?_rsc=abc"),
    request("/", { mode: "navigate", headers: new Headers({ RSC: "1" }) }),
    request("/arbitrary-file.json"),
  ])("does not intercept external, API, analytics, POST, or RSC requests: $url", async (req) => {
    const worker = createWorker();
    expect(await worker.dispatch("fetch", { request: req })).toBeUndefined();
    expect(worker.fetch).not.toHaveBeenCalled();
    expect(worker.cacheStorage.open).not.toHaveBeenCalled();
  });

  it("only deletes old caches belonging to this app during activation", async () => {
    const worker = createWorker();
    worker.seed("/", htmlResponse(), "unrelated-app-v1");
    worker.seed("/", htmlResponse(), "regret-button-old");
    worker.seed("/", htmlResponse());
    await worker.dispatch("activate");
    expect([...worker.stores.keys()].sort()).toEqual([CURRENT_CACHE, "unrelated-app-v1"].sort());
    expect(worker.cacheStorage.delete).toHaveBeenCalledExactlyOnceWith("regret-button-old");
    expect(worker.claim).toHaveBeenCalledOnce();
  });

  it("validates both the source and asset list when warming resources loaded before control", async () => {
    const worker = createWorker();
    const data = {
      type: "CACHE_LOADED_ASSETS",
      urls: ["/_next/static/chunks/late-123.js", "/_vercel/insights/script.js", "/api/private", "https://external.example/icon.png", null],
    };
    await worker.dispatch("message", { data, source: { url: "https://external.example/" } });
    expect(worker.fetch).not.toHaveBeenCalled();
    await worker.dispatch("message", { data, source: { url: `${ORIGIN}/` } });
    expect(worker.fetch.mock.calls.map(([input]) => urlOf(input))).toEqual([`${ORIGIN}/_next/static/chunks/late-123.js`]);
  });

  it("does not overwrite the good shell with server errors or no-store responses", async () => {
    const worker = createWorker();
    worker.seed("/", htmlResponse("good shell"));
    worker.fetch.mockResolvedValueOnce(htmlResponse("server error", 500));
    const error = await worker.dispatch("fetch", { request: request("/", { mode: "navigate" }) });
    expect(await error?.text()).toBe("good shell");
    worker.fetch.mockResolvedValueOnce(htmlResponse("private response", 200, { "cache-control": "no-store" }));
    await worker.dispatch("fetch", { request: request("/", { mode: "navigate" }) });
    expect(await worker.stores.get(CURRENT_CACHE)?.get(`${ORIGIN}/`)?.clone().text()).toBe("good shell");
  });

  it("does not cache HTML masquerading as an asset or redirected assets", async () => {
    const worker = createWorker();
    worker.fetch.mockResolvedValueOnce(htmlResponse("not JavaScript"));
    await worker.dispatch("fetch", { request: request("/_next/static/chunks/not-found-123.js") });
    const redirected = new Response("redirected");
    Object.defineProperty(redirected, "redirected", { value: true });
    worker.fetch.mockResolvedValueOnce(redirected);
    await worker.dispatch("fetch", { request: request("/_next/static/chunks/redirected-456.js") });
    expect(worker.stores.get(CURRENT_CACHE)?.size || 0).toBe(0);
  });

  it("keeps an online response usable if cache storage is unavailable", async () => {
    const worker = createWorker();
    worker.cacheStorage.open.mockRejectedValue(new Error("Storage denied"));
    worker.fetch.mockResolvedValueOnce(htmlResponse("usable without storage"));
    const response = await worker.dispatch("fetch", { request: request("/", { mode: "navigate" }) });
    expect(await response?.text()).toBe("usable without storage");
  });

  it("explains the online-first requirement if no offline shell exists", async () => {
    const worker = createWorker();
    worker.fetch.mockRejectedValue(new TypeError("Offline"));
    const response = await worker.dispatch("fetch", { request: request("/", { mode: "navigate" }) });
    expect(response?.status).toBe(503);
    expect(await response?.text()).toContain("初回はオンライン");
  });
});
