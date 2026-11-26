"use client";

import { Analytics } from "@vercel/analytics/react";
import { track, type BeforeSendEvent } from "@vercel/analytics";
import { getSnapshot, useRegretStore } from "@/lib/store";

function isAllowed() {
  const snapshot = getSnapshot();
  return snapshot.ready && snapshot.record.preferences.analytics && navigator.doNotTrack !== "1";
}

function vercelAnalyticsEnabled() {
  // Vercel serves /_vercel/insights/script.js. Other production hosts do not,
  // so skip the script there instead of logging a failed load. Development
  // and tests keep the existing privacy guard.
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT !== "0";
}

export function trackRegret(event: "button_press" | "long_press" | "share" | "milestone", properties?: { milestone?: number; method?: string }) {
  if (!isAllowed() || !vercelAnalyticsEnabled()) return;
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
  if (!vercelAnalyticsEnabled()) return null;
  if (!ready || !record.preferences.analytics) return null;
  if (navigator.doNotTrack === "1") return null;
  return <Analytics route="/" path="/" beforeSend={beforeSend} debug={false} />;
}
