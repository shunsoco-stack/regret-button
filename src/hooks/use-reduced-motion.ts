"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
function subscribe(callback: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const getSnapshot = () => window.matchMedia(QUERY).matches;
const getServerSnapshot = () => true;

export function useReducedMotion() { return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot); }
