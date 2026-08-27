"use client";

import { Analytics } from "@vercel/analytics/react";
import { track, type BeforeSendEvent } from "@vercel/analytics";
import { getSnapshot, useRegretStore } from "@/lib/store";

function isAllowed() {
  const snapshot = getSnapshot();
  return snapshot.ready && snapshot.record.preferences.analytics && navigator.doNotTrack !== "1";
}

export function trackRegret(event: "button_press" | "long_press" | "share" | "milestone", properties?: { milestone?: number; method?: string }) {
  if (!isAllowed()) return;
  try { track(event, properties); } catch { /* Analytics is never required to play. */ }
}

function beforeSend(event: BeforeSendEvent) {
  if (!isAllowed()) return null;
  // Query strings and fragments never belong in this app's analytics.
  const url = new URL(event.url);
  return { ...event, url: `${url.origin}${url.pathname}` };
}

export function PrivateAnalytics() {
  const { ready, record } = useRegretStore();
  if (!ready || !record.preferences.analytics) return null;
  if (navigator.doNotTrack === "1") return null;
  return <Analytics route="/" path="/" beforeSend={beforeSend} debug={false} />;
}
