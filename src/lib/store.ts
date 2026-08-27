"use client";

import { useSyncExternalStore } from "react";
import {
  STORAGE_KEY,
  createInitialRecord,
  defaultPreferences,
  normalizeRecord,
  recordPress,
  resetRecord,
  type Preferences,
  type PressKind,
  type RegretRecord,
} from "./regret";

export type RegretStoreSnapshot = {
  record: RegretRecord;
  ready: boolean;
  storageError: string | null;
};

const STORAGE_ERROR =
  "このブラウザでは記録を保存できません。この画面では続けられますが、再読み込みすると失われる場合があります。";
const INVALID_STORAGE_ERROR =
  "保存した記録を読み込めませんでした。新しい記録で続けられます。";
const preferenceKeys = Object.keys(defaultPreferences) as (keyof Preferences)[];

// A single cached snapshot is shared by SSR and the first hydration render.
// The literal day also avoids differences between server and browser time zones.
const serverSnapshot: RegretStoreSnapshot = {
  record: { ...createInitialRecord(new Date(0)), day: "1970-01-01" },
  ready: false,
  storageError: null,
};

let snapshot = serverSnapshot;
let lastStoredValue: string | null | undefined;
let pendingWrite = false;
let clockInterval: number | undefined;
const listeners = new Set<() => void>();

function sameRecord(left: RegretRecord, right: RegretRecord): boolean {
  return (
    left.total === right.total &&
    left.day === right.day &&
    left.today === right.today &&
    left.lastPressedAt === right.lastPressedAt &&
    left.deepPresses === right.deepPresses &&
    left.undoUsed === right.undoUsed &&
    preferenceKeys.every((key) => left.preferences[key] === right.preferences[key])
  );
}

function publish(
  record: RegretRecord,
  storageError: string | null,
  ready = true,
): void {
  if (
    snapshot.ready === ready &&
    snapshot.storageError === storageError &&
    sameRecord(snapshot.record, record)
  ) {
    return;
  }

  snapshot = { record, ready, storageError };
  for (const listener of listeners) listener();
}

function refreshDay(): void {
  if (!snapshot.ready) return;
  publish(normalizeRecord(snapshot.record), snapshot.storageError);
}

/**
 * Read before a user action to include changes from other tabs. A failed save
 * makes memory authoritative until it has been saved successfully: rereading
 * the old value would otherwise silently discard the user's unsaved presses.
 */
function refreshFromStorage(): void {
  if (typeof window === "undefined") return;

  if (pendingWrite) {
    refreshDay();
    return;
  }

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    publish(normalizeRecord(snapshot.record), STORAGE_ERROR);
    return;
  }

  if (snapshot.ready && raw === lastStoredValue && snapshot.storageError === null) {
    refreshDay();
    return;
  }

  lastStoredValue = raw;

  if (raw === null) {
    publish(createInitialRecord(), null);
    return;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    publish(normalizeRecord(parsed), null);
  } catch {
    publish(createInitialRecord(), INVALID_STORAGE_ERROR);
  }
}

function persist(record: RegretRecord): void {
  pendingWrite = true;

  try {
    const raw = JSON.stringify(record);
    window.localStorage.setItem(STORAGE_KEY, raw);
    lastStoredValue = raw;
    pendingWrite = false;
    publish(record, null);
  } catch {
    publish(record, STORAGE_ERROR);
  }
}

function onStorage(event: StorageEvent): void {
  if (event.key !== STORAGE_KEY && event.key !== null) return;

  // Session storage events use the same event type but are not our records.
  try {
    if (event.storageArea !== null && event.storageArea !== window.localStorage) return;
  } catch {
    publish(normalizeRecord(snapshot.record), STORAGE_ERROR);
    return;
  }

  // Read the latest value, not a possibly delayed event.newValue.
  refreshFromStorage();
}

function onVisibilityChange(): void {
  refreshDay();
  if (document.visibilityState === "visible") refreshFromStorage();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    clockInterval = window.setInterval(refreshDay, 30_000);
    refreshFromStorage();
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (clockInterval !== undefined) window.clearInterval(clockInterval);
      clockInterval = undefined;
    }
  };
}

/** Must stay free of storage reads and return a cached reference for React. */
export function getSnapshot(): RegretStoreSnapshot {
  return snapshot;
}

function getServerSnapshot(): RegretStoreSnapshot {
  return serverSnapshot;
}

export function useRegretStore(): RegretStoreSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function pressRegret(kind: PressKind): RegretRecord {
  if (typeof window === "undefined") return snapshot.record;
  refreshFromStorage();
  const next = recordPress(snapshot.record, kind);
  persist(next);
  return next;
}

export function setPreference(key: keyof Preferences, value: boolean): void {
  if (
    typeof window === "undefined" ||
    typeof value !== "boolean" ||
    !preferenceKeys.includes(key)
  ) {
    return;
  }

  refreshFromStorage();
  if (snapshot.record.preferences[key] === value && !pendingWrite) return;

  persist({
    ...snapshot.record,
    preferences: { ...snapshot.record.preferences, [key]: value },
  });
}

/** A harmless, one-time joke. It never decrements a count. */
export function attemptUndo(): boolean {
  if (typeof window === "undefined") return false;
  refreshFromStorage();
  if (snapshot.record.total === 0 || snapshot.record.undoUsed) return false;

  persist({ ...snapshot.record, undoUsed: true });
  return true;
}

export function resetRegrets(): void {
  if (typeof window === "undefined") return;
  refreshFromStorage();
  // Only this application's key is written; other storage is never touched.
  persist(resetRecord(snapshot.record));
}
