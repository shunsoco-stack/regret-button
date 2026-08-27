import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY, createInitialRecord, type Preferences, type RegretRecord } from "../src/lib/regret";
import { SITE_URL } from "../src/lib/site";

// Keep the real UI, store, settings, dialogs, gesture recognition, and analytics
// privacy guard. Only external telemetry and hardware feedback are substituted.
const external = vi.hoisted(() => ({ track: vi.fn(), analyticsRender: vi.fn(), prepareAudio: vi.fn(), playFeedback: vi.fn() }));
vi.mock("@vercel/analytics", () => ({ track: external.track }));
vi.mock("@vercel/analytics/react", () => ({ Analytics: (props: unknown) => { external.analyticsRender(props); return null; } }));
vi.mock("@/lib/feedback", () => ({ prepareAudio: external.prepareAudio, playFeedback: external.playFeedback }));

const now = new Date(2026, 7, 27, 12, 34, 56);
let RegretLab: typeof import("../src/components/regret-lab")["RegretLab"];
const navigatorProperties = ["share", "clipboard", "doNotTrack"] as const;
const navigatorDescriptors = new Map(navigatorProperties.map((key) => [key, Object.getOwnPropertyDescriptor(navigator, key)]));
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

function browserProperty(key: typeof navigatorProperties[number], value: unknown) {
  Object.defineProperty(navigator, key, { configurable: true, value });
}

function restoreProperty(target: object, key: PropertyKey, descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

function record(total = 0, preferences: Partial<Preferences> = {}): RegretRecord {
  const initial = createInitialRecord(now);
  return {
    ...initial,
    total,
    today: total,
    lastPressedAt: total > 0 ? now.toISOString() : null,
    preferences: { ...initial.preferences, ...preferences },
  };
}

function persisted(): RegretRecord {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!);
}

function renderLab(saved?: RegretRecord) {
  if (saved) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  const view = render(<RegretLab />);
  const mainButton = screen.getByRole("button", { name: "押さないでください" });
  expect((mainButton as HTMLButtonElement).disabled).toBe(false);
  return { ...view, mainButton };
}

function pressMain() {
  // A detail=0 activation is the real accessible click path. Physical pointer
  // and keyboard event sequences are covered independently in gesture.test.tsx.
  fireEvent.click(screen.getByRole("button", { name: "押さないでください" }), { detail: 0 });
}

function openSettings() {
  fireEvent.click(screen.getByRole("button", { name: "設定を開く" }));
  return screen.getByRole("dialog", { name: "あなたのペースで。" });
}

function deepButton() {
  return screen.getByRole("button", { name: "長押しせずに、より深い後悔を体験する" });
}

async function shareFromPage() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "この後悔を共有" }));
  });
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  localStorage.clear();
  for (const key of navigatorProperties) browserProperty(key, undefined);
  vi.stubGlobal("matchMedia", vi.fn((media: string) => ({
    media,
    matches: false,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  })));

  // jsdom has no top layer. Model the native open/close state and close event;
  // focus trapping and visual stacking remain browser-verification concerns.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        if (!this.isConnected) throw new DOMException("Dialog is detached", "InvalidStateError");
        this.open = true;
        this.querySelector<HTMLButtonElement>("button")?.focus();
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement, returnValue = "") {
        if (!this.open) return;
        this.open = false;
        this.returnValue = returnValue;
        this.dispatchEvent(new Event("close"));
      },
    },
  });
  ({ RegretLab } = await import("../src/components/regret-lab"));
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of navigatorProperties) restoreProperty(navigator, key, navigatorDescriptors.get(key));
  restoreProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  restoreProperty(HTMLDialogElement.prototype, "close", originalClose);
});

describe("the experiment and device-local records", () => {
  it("starts quiet, shows the initial state, then saves and displays the first press", () => {
    renderLab();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("押しても、何も起きません。");
    expect(screen.getByText("まだ、引き返せます。")).toBeTruthy();
    expect(screen.getByTestId("total-count").getAttribute("aria-label")).toBe("0回");
    expect(screen.getByTestId("today-count").getAttribute("aria-label")).toBe("0回");
    expect(screen.getByText("まだ押していません")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^1回だけ取り消す/ })).toBeNull();
    expect(external.prepareAudio).not.toHaveBeenCalled();
    expect(external.playFeedback).not.toHaveBeenCalled();
    expect(external.track).not.toHaveBeenCalled();
    expect(external.analyticsRender).toHaveBeenCalled();

    pressMain();

    expect(screen.getByText("本当に押したんですね")).toBeTruthy();
    expect(screen.getByTestId("total-count").getAttribute("aria-label")).toBe("1回");
    expect(screen.getByTestId("today-count").getAttribute("aria-label")).toBe("1回");
    expect(screen.getByTestId("last-pressed").textContent).toBe("12:34:56");
    expect(persisted()).toMatchObject({ total: 1, today: 1, lastPressedAt: now.toISOString() });
    expect(external.prepareAudio).not.toHaveBeenCalled();
    expect(external.track.mock.calls).toEqual([["button_press", undefined]]);
  });

  it("offers the one-time undo joke without decrementing records", () => {
    renderLab();
    pressMain();
    fireEvent.click(screen.getByRole("button", { name: /^1回だけ取り消す/ }));

    expect(screen.getByText("取り消せません")).toBeTruthy();
    expect(screen.getByText("これは演出です。本当のリセットは、設定からどうぞ。")).toBeTruthy();
    expect(screen.getByTestId("total-count").getAttribute("aria-label")).toBe("1回");
    expect(persisted()).toMatchObject({ total: 1, today: 1, undoUsed: true });
    expect(screen.queryByRole("button", { name: /^1回だけ取り消す/ })).toBeNull();
    expect(external.track).toHaveBeenCalledTimes(1);

    pressMain();
    expect(screen.getByText("戻ることはできません")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^1回だけ取り消す/ })).toBeNull();
    expect(persisted()).toMatchObject({ total: 2, undoUsed: true });
  });

  it("requires reset confirmation and really clears records while retaining preferences", () => {
    const saved = record(12, { sound: true, haptics: false, escapeButton: false, reduceMotion: true, analytics: false });
    saved.deepPresses = 3;
    saved.undoUsed = true;
    localStorage.setItem("unrelated-app", "keep this");
    renderLab(saved);
    const settings = openSettings();
    fireEvent.click(within(settings).getByRole("button", { name: "記録をリセットする" }));
    expect(within(settings).getByRole("alert").textContent).toContain("消した記録は戻せません");
    expect(persisted().total).toBe(12);
    fireEvent.click(within(settings).getByRole("button", { name: "キャンセル" }));
    expect(persisted().total).toBe(12);

    fireEvent.click(within(settings).getByRole("button", { name: "記録をリセットする" }));
    fireEvent.click(within(settings).getByRole("button", { name: "記録をリセット" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("まだ、引き返せます。")).toBeTruthy();
    expect(screen.getByTestId("total-count").getAttribute("aria-label")).toBe("0回");
    expect(screen.getByTestId("today-count").getAttribute("aria-label")).toBe("0回");
    expect(persisted()).toMatchObject({ total: 0, today: 0, lastPressedAt: null, deepPresses: 0, undoUsed: false });
    expect(persisted().preferences).toEqual(saved.preferences);
    expect(localStorage.getItem("unrelated-app")).toBe("keep this");
    expect(screen.getByText("記録をリセットしました。まっさらな後悔を、どうぞ。")).toBeTruthy();
    const reopened = openSettings();
    expect(within(reopened).getByRole("switch", { name: "サウンド" }).getAttribute("aria-checked")).toBe("true");
    expect(within(reopened).getByRole("switch", { name: "匿名の利用状況を送る" }).getAttribute("aria-checked")).toBe("false");
  });

  it.each(["hint", "settings"] as const)("offers the same one-count deep experience from the %s alternative", (location) => {
    const { container } = renderLab();
    if (location === "settings") {
      const settings = openSettings();
      fireEvent.click(within(settings).getByRole("button", { name: /^長押しせずに/ }));
    } else fireEvent.click(deepButton());

    expect(screen.getByText("より深い後悔へようこそ")).toBeTruthy();
    expect(container.querySelector(".lab-app")?.classList.contains("is-deep")).toBe(true);
    expect(persisted()).toMatchObject({ total: 1, today: 1, deepPresses: 1 });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(external.track.mock.calls).toEqual([["long_press", undefined]]);
    expect(external.playFeedback).toHaveBeenCalledWith("deep", persisted().preferences, null);

    pressMain();
    expect(persisted()).toMatchObject({ total: 2, deepPresses: 1 });
    expect(container.querySelector(".lab-app")?.classList.contains("is-deep")).toBe(false);
  });
});

describe("milestone celebrations", () => {
  it.each([
    [100, "100回の、小さな後悔。"],
    [500, "後悔も、ここまで来ました。"],
    [1000, "何も起きない、伝説へ。"],
  ] as const)("celebrates crossing %i exactly once with the correct heading", (milestone, heading) => {
    renderLab(record(milestone - 1));
    expect(screen.queryByRole("dialog")).toBeNull();
    pressMain();
    const celebration = screen.getByRole("dialog", { name: heading });
    expect(within(celebration).getByRole("heading", { name: heading, level: 2 })).toBeTruthy();
    expect(screen.getByTestId("total-count").getAttribute("aria-label")).toBe(`${milestone}回`);
    expect(external.track.mock.calls).toEqual([["button_press", undefined], ["milestone", { milestone }]]);

    fireEvent.click(within(celebration).getByRole("button", { name: "実験室に戻る" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    pressMain();
    expect(persisted().total).toBe(milestone + 1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(external.track.mock.calls.filter(([event]) => event === "milestone")).toHaveLength(1);
  });
});

describe("sharing", () => {
  it("does not copy or track when the user cancels native sharing", async () => {
    const nativeShare = vi.fn().mockRejectedValue(new DOMException("User cancelled", "AbortError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserProperty("share", nativeShare);
    browserProperty("clipboard", { writeText });
    renderLab(record(7));
    await shareFromPage();

    expect(nativeShare).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    expect(external.track).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByRole("button", { name: "この後悔を共有" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("tracks one successful native share and prevents overlapping requests", async () => {
    let finishShare!: () => void;
    const nativeShare = vi.fn(() => new Promise<void>((resolve) => { finishShare = resolve; }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserProperty("share", nativeShare);
    browserProperty("clipboard", { writeText });
    renderLab(record(7));
    const button = screen.getByRole("button", { name: "この後悔を共有" }) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(nativeShare).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(external.track).not.toHaveBeenCalled();

    await act(async () => { finishShare(); });
    expect(nativeShare).toHaveBeenCalledWith({
      title: "後悔ボタン",
      text: "『後悔ボタン』を7回押しました。特に何も起きませんでした。",
      url: SITE_URL,
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(external.track.mock.calls).toEqual([["share", { method: "native" }]]);
    expect(screen.getByText("小さな後悔を、共有しました。")).toBeTruthy();
    expect(button.disabled).toBe(false);
  });

  it.each(["unavailable", "failed"] as const)("copies the text and canonical URL if native sharing is %s", async (nativeState) => {
    if (nativeState === "failed") browserProperty("share", vi.fn().mockRejectedValue(new Error("Native sharing unavailable")));
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserProperty("clipboard", { writeText });
    renderLab(record(7));
    await shareFromPage();
    expect(writeText).toHaveBeenCalledWith(`『後悔ボタン』を7回押しました。特に何も起きませんでした。\n${SITE_URL}`);
    expect(external.track.mock.calls).toEqual([["share", { method: "clipboard" }]]);
    expect(screen.getByText("共有文とURLをコピーしました。")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shares a suitable invitation before any button presses", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserProperty("clipboard", { writeText });
    renderLab();
    await shareFromPage();
    expect(writeText).toHaveBeenCalledWith(`押しても何も起きないのに、押したくなる。『後悔ボタン』\n${SITE_URL}`);
    expect(screen.getByTestId("total-count").getAttribute("aria-label")).toBe("0回");
  });

  it("offers manual copy on failure and tracks only the user's completion acknowledgement", async () => {
    browserProperty("clipboard", { writeText: vi.fn().mockRejectedValue(new Error("Clipboard denied")) });
    renderLab(record(7));
    await shareFromPage();
    const manual = screen.getByRole("dialog", { name: "小さな後悔を、おすそわけ。" });
    const text = within(manual).getByRole("textbox", { name: "共有する文章とURL" }) as HTMLTextAreaElement;
    expect(text.readOnly).toBe(true);
    expect(text.value).toBe(`『後悔ボタン』を7回押しました。特に何も起きませんでした。\n${SITE_URL}`);
    expect(external.track).not.toHaveBeenCalled();
    fireEvent.click(within(manual).getByRole("button", { name: "完了" }));
    expect(external.track.mock.calls).toEqual([["share", { method: "manual" }]]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("allows the manual dialog to be dismissed without claiming a share", async () => {
    renderLab(record(7));
    await shareFromPage();
    const manual = screen.getByRole("dialog", { name: "小さな後悔を、おすそわけ。" });
    fireEvent.click(within(manual).getByRole("button", { name: "共有を閉じる" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(external.track).not.toHaveBeenCalled();
  });
});

describe("analytics preferences", () => {
  it("stops all four event types immediately when disabled in settings", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    browserProperty("clipboard", { writeText });
    renderLab(record(99));
    const settings = openSettings();
    fireEvent.click(within(settings).getByRole("switch", { name: "匿名の利用状況を送る" }));
    expect(persisted().preferences.analytics).toBe(false);
    fireEvent.click(within(settings).getByRole("button", { name: "設定を閉じる" }));
    pressMain(); // button_press + milestone
    const celebration = screen.getByRole("dialog", { name: "100回の、小さな後悔。" });
    fireEvent.click(within(celebration).getByRole("button", { name: "実験室に戻る" }));
    fireEvent.click(deepButton()); // long_press
    await shareFromPage(); // share
    expect(persisted().total).toBe(101);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(external.track).not.toHaveBeenCalled();
  });

  it("respects Do Not Track even when the local analytics preference is enabled", () => {
    browserProperty("doNotTrack", "1");
    renderLab(record(99));
    pressMain();
    expect(screen.getByRole("dialog", { name: "100回の、小さな後悔。" })).toBeTruthy();
    expect(persisted().preferences.analytics).toBe(true);
    expect(external.track).not.toHaveBeenCalled();
    expect(external.analyticsRender).not.toHaveBeenCalled();
  });
});
