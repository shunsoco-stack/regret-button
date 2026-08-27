import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY, createInitialRecord, type RegretRecord } from "../src/lib/regret";

type StoreModule = typeof import("../src/lib/store");
let store: StoreModule;
const now = new Date(2026, 7, 27, 12, 0, 0);

function savedRecord(overrides: Partial<RegretRecord> = {}): RegretRecord {
  return {
    ...createInitialRecord(now),
    total: 7,
    today: 3,
    deepPresses: 2,
    lastPressedAt: new Date(2026, 7, 27, 10, 0, 0).toISOString(),
    ...overrides,
  };
}

function putRecord(record: RegretRecord): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

function storedRecord(): RegretRecord {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
}

function storageEvent(key: string | null = STORAGE_KEY, newValue: string | null = null): void {
  window.dispatchEvent(new StorageEvent("storage", { key, newValue }));
}

beforeEach(async () => {
  vi.resetModules();
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  store = await import("../src/lib/store");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("hydration and subscriptions", () => {
  it("keeps getSnapshot pure and cached before the first subscription", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const first = store.getSnapshot();

    expect(store.getSnapshot()).toBe(first);
    expect(first.ready).toBe(false);
    expect(first.record.day).toBe("1970-01-01");
    expect(getItem).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hydrates from the fixed server snapshot before restoring local counts", () => {
    putRecord(savedRecord());
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    function SnapshotView() {
      const snapshot = store.useRegretStore();
      return createElement("span", null, `${snapshot.ready}:${snapshot.record.total}`);
    }

    const element = createElement(SnapshotView);
    const html = renderToString(element);
    expect(html).toBe("<span>false:0</span>");
    expect(getItem).not.toHaveBeenCalled();

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    let root: ReturnType<typeof hydrateRoot>;

    act(() => {
      root = hydrateRoot(container, element);
    });

    expect(container.textContent).toBe("true:7");
    expect(consoleError).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
  });

  it("shares one set of listeners and removes it when the last subscriber leaves", () => {
    const addWindow = vi.spyOn(window, "addEventListener");
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const addDocument = vi.spyOn(document, "addEventListener");
    const removeDocument = vi.spyOn(document, "removeEventListener");
    const first = renderHook(store.useRegretStore);
    const second = renderHook(store.useRegretStore);

    expect(addWindow.mock.calls.filter(([event]) => event === "storage")).toHaveLength(1);
    expect(addDocument.mock.calls.filter(([event]) => event === "visibilitychange")).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);

    first.unmount();
    expect(removeWindow.mock.calls.filter(([event]) => event === "storage")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(1);

    second.unmount();
    expect(removeWindow.mock.calls.filter(([event]) => event === "storage")).toHaveLength(1);
    expect(removeDocument.mock.calls.filter(([event]) => event === "visibilitychange")).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the snapshot reference stable when the record has not changed", () => {
    renderHook(store.useRegretStore);
    const original = store.getSnapshot();

    act(() => {
      storageEvent();
      vi.advanceTimersByTime(30_000);
    });

    expect(store.getSnapshot()).toBe(original);
  });
});

describe("persistence and actions", () => {
  it("restores valid persisted records on subscription", () => {
    const saved = savedRecord({ undoUsed: true });
    saved.preferences.sound = true;
    putRecord(saved);
    const { result } = renderHook(store.useRegretStore);

    expect(result.current).toEqual({ record: saved, ready: true, storageError: null });
  });

  it("saves normal and deep presses and restores them after the module reloads", async () => {
    const first = renderHook(store.useRegretStore);
    act(() => {
      store.pressRegret("normal");
      store.pressRegret("deep");
      store.setPreference("sound", true);
    });

    expect(storedRecord()).toMatchObject({ total: 2, today: 2, deepPresses: 1 });
    expect(storedRecord().preferences.sound).toBe(true);
    first.unmount();

    vi.resetModules();
    const reloaded = await import("../src/lib/store");
    const next = renderHook(reloaded.useRegretStore);

    expect(next.result.current.record).toEqual(storedRecord());
    expect(next.result.current.ready).toBe(true);
  });

  it("rereads another tab's latest count before a press even without an event", () => {
    putRecord(savedRecord());
    renderHook(store.useRegretStore);
    putRecord(savedRecord({ total: 20, today: 10 }));
    let next: RegretRecord;

    act(() => {
      next = store.pressRegret("normal");
    });

    expect(next!.total).toBe(21);
    expect(storedRecord().today).toBe(11);
  });

  it("offers the pretend undo only once without changing any counts", () => {
    renderHook(store.useRegretStore);
    expect(store.attemptUndo()).toBe(false);
    act(() => store.pressRegret("normal"));
    const before = store.getSnapshot().record;

    act(() => {
      expect(store.attemptUndo()).toBe(true);
    });

    expect(store.getSnapshot().record).toEqual({ ...before, undoUsed: true });
    expect(storedRecord().undoUsed).toBe(true);
    act(() => {
      expect(store.attemptUndo()).toBe(false);
      store.pressRegret("normal");
      expect(store.attemptUndo()).toBe(false);
    });
  });

  it("resets only its own key and retains preferences while truly clearing activity", () => {
    putRecord(savedRecord({ undoUsed: true }));
    window.localStorage.setItem("another-app", "keep me");
    renderHook(store.useRegretStore);
    act(() => {
      store.setPreference("sound", true);
      store.setPreference("reduceMotion", true);
      store.setPreference("analytics", false);
    });
    const preferences = store.getSnapshot().record.preferences;
    const clear = vi.spyOn(Storage.prototype, "clear");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    act(() => store.resetRegrets());

    expect(store.getSnapshot().record).toEqual({ ...createInitialRecord(now), preferences });
    expect(storedRecord()).toEqual(store.getSnapshot().record);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0][0]).toBe(STORAGE_KEY);
    expect(clear).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("another-app")).toBe("keep me");

    act(() => {
      store.pressRegret("normal");
      expect(store.attemptUndo()).toBe(true);
    });
  });

  it.each(["{bad json", "null", "[]", '{"schemaVersion":99,"total":80}'])(
    "recovers safely from untrusted stored JSON: %s",
    (value) => {
      window.localStorage.setItem(STORAGE_KEY, value);
      const { result } = renderHook(store.useRegretStore);
      expect(result.current.ready).toBe(true);
      expect(result.current.record.total).toBe(0);

      act(() => store.pressRegret("normal"));
      expect(storedRecord().total).toBe(1);
      expect(result.current.storageError).toBeNull();
    },
  );
});

describe("storage failures", () => {
  it("keeps unsaved counts in memory and never rolls back to old storage after quota errors", () => {
    putRecord(savedRecord());
    const { result } = renderHook(store.useRegretStore);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    act(() => {
      store.pressRegret("normal");
      store.pressRegret("deep");
      storageEvent();
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.record.total).toBe(9);
    expect(result.current.record.deepPresses).toBe(3);
    expect(result.current.storageError).toContain("保存できません");
    expect(storedRecord().total).toBe(7);

    setItem.mockRestore();
    act(() => store.pressRegret("normal"));

    expect(result.current.record.total).toBe(10);
    expect(storedRecord().total).toBe(10);
    expect(result.current.storageError).toBeNull();
  });

  it("keeps settings, fake undo, and real reset usable during a failed save", () => {
    putRecord(savedRecord());
    const { result } = renderHook(store.useRegretStore);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    act(() => {
      store.setPreference("sound", true);
      expect(store.attemptUndo()).toBe(true);
      expect(store.attemptUndo()).toBe(false);
      store.resetRegrets();
    });

    expect(result.current.record.total).toBe(0);
    expect(result.current.record.undoUsed).toBe(false);
    expect(result.current.record.preferences.sound).toBe(true);
    expect(result.current.storageError).not.toBeNull();

    act(() => store.pressRegret("normal"));
    expect(result.current.record.total).toBe(1);
    expect(storedRecord().total).toBe(7);
  });

  it("reports read failures while keeping the last known record available", () => {
    putRecord(savedRecord());
    const { result } = renderHook(store.useRegretStore);
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Access denied", "SecurityError");
    });

    act(() => storageEvent());
    expect(result.current.record.total).toBe(7);
    expect(result.current.storageError).toContain("保存できません");

    getItem.mockRestore();
    act(() => store.pressRegret("normal"));
    expect(result.current.record.total).toBe(8);
    expect(result.current.storageError).toBeNull();
  });

  it("works in memory when accessing localStorage itself throws SecurityError", () => {
    const blockedStorage = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Access denied", "SecurityError");
    });
    const { result } = renderHook(store.useRegretStore);

    expect(result.current.ready).toBe(true);
    expect(result.current.storageError).not.toBeNull();
    act(() => {
      store.pressRegret("normal");
      store.pressRegret("deep");
    });

    expect(result.current.record.total).toBe(2);
    expect(result.current.record.deepPresses).toBe(1);

    blockedStorage.mockRestore();
    act(() => store.pressRegret("normal"));
    expect(result.current.record.total).toBe(3);
    expect(storedRecord().total).toBe(3);
    expect(result.current.storageError).toBeNull();
  });
});

describe("external changes and the local calendar", () => {
  it("reflects another tab's record and reset without reloading", () => {
    const { result } = renderHook(store.useRegretStore);
    const saved = savedRecord();

    act(() => {
      putRecord(saved);
      storageEvent();
    });
    expect(result.current.record).toEqual(saved);

    const reset = createInitialRecord(now);
    reset.preferences.sound = true;
    act(() => {
      putRecord(reset);
      storageEvent();
    });
    expect(result.current.record).toEqual(reset);
  });

  it("uses current storage instead of an outdated storage event payload", () => {
    const saved = savedRecord();
    putRecord(saved);
    const { result } = renderHook(store.useRegretStore);
    act(() => store.pressRegret("normal"));
    const current = result.current;

    act(() => storageEvent(STORAGE_KEY, JSON.stringify(saved)));

    expect(result.current).toBe(current);
    expect(result.current.record.total).toBe(8);
  });

  it("handles a key removal or a browser-wide storage clear from another tab", () => {
    putRecord(savedRecord());
    const { result } = renderHook(store.useRegretStore);

    act(() => {
      window.localStorage.removeItem(STORAGE_KEY);
      storageEvent();
    });
    expect(result.current.record.total).toBe(0);

    act(() => store.pressRegret("normal"));
    act(() => {
      window.localStorage.clear();
      storageEvent(null);
    });
    expect(result.current.record.total).toBe(0);
  });

  it("ignores unrelated keys and session storage events", () => {
    const { result } = renderHook(store.useRegretStore);
    const initial = result.current;
    putRecord(savedRecord());

    act(() => {
      storageEvent("another-app");
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEY, storageArea: window.sessionStorage }),
      );
    });

    expect(result.current).toBe(initial);
  });

  it("clears today's count after midnight and counts the next press as today's first", () => {
    vi.setSystemTime(new Date(2026, 7, 27, 23, 59, 50));
    putRecord(savedRecord());
    const { result } = renderHook(store.useRegretStore);
    const previousTime = result.current.record.lastPressedAt;

    act(() => vi.advanceTimersByTime(30_000));

    expect(result.current.record).toMatchObject({ total: 7, today: 0, day: "2026-08-28" });
    expect(result.current.record.lastPressedAt).toBe(previousTime);
    act(() => store.pressRegret("normal"));
    expect(result.current.record).toMatchObject({ total: 8, today: 1, day: "2026-08-28" });
  });

  it("refreshes the day immediately when visibility changes", () => {
    putRecord(savedRecord());
    const { result } = renderHook(store.useRegretStore);

    act(() => {
      vi.setSystemTime(new Date(2026, 7, 28, 12, 0, 0));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.record).toMatchObject({ total: 7, today: 0, day: "2026-08-28" });
  });

  it("refreshes persisted state when a subscriber returns after all listeners were removed", () => {
    const first = renderHook(store.useRegretStore);
    first.unmount();
    putRecord(savedRecord());

    const next = renderHook(store.useRegretStore);
    expect(next.result.current.record.total).toBe(7);
  });
});
