"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator) ||
      (window.location.protocol !== "https:" && !local)
    ) {
      return;
    }

    let active = true;
    let worker: ServiceWorker | null = null;
    const warmLoadedAssets = () => {
      if (!active) return;
      const target = navigator.serviceWorker.controller || worker;
      if (!target) return;
      const loaded = performance.getEntriesByType("resource").map((entry) => entry.name);
      const linked = [...document.querySelectorAll<HTMLLinkElement>("link[href]")].map((link) => link.href);
      const scripts = [...document.querySelectorAll<HTMLScriptElement>("script[src]")].map((script) => script.src);
      const urls = [...new Set([...loaded, ...linked, ...scripts])].filter((value) => {
        try {
          const url = new URL(value, window.location.origin);
          return (
            url.origin === window.location.origin &&
            (url.pathname.startsWith("/_next/static/") ||
              url.pathname.startsWith("/icons/") ||
              ["/manifest.webmanifest", "/favicon.ico", "/icon.svg"].includes(url.pathname))
          );
        } catch {
          return false;
        }
      });
      try {
        target.postMessage({ type: "CACHE_LOADED_ASSETS", urls: urls.slice(0, 80) });
      } catch {
        // An updating or terminated worker can be replaced between these steps.
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", warmLoadedAssets);
    window.addEventListener("load", warmLoadedAssets);
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        if (!active) return;
        worker = registration.active;
        warmLoadedAssets();
      })
      .catch(() => {
        // Offline support is an enhancement. Registration failure stays non-blocking.
      });

    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener("controllerchange", warmLoadedAssets);
      window.removeEventListener("load", warmLoadedAssets);
    };
  }, []);

  return null;
}
