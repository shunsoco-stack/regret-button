import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PRESS_MS, useButtonGesture } from "../src/hooks/use-button-gesture";
import type { PressKind } from "../src/lib/regret";

// jsdom does not implement real pointer capture. Keep this adapter at the DOM
// boundary; all gesture recognition, timers, and callbacks are production code.
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;
  readonly pointerType: string;

  constructor(type: string, options: PointerEventInit = {}) {
    super(type, options);
    this.pointerId = options.pointerId ?? 0;
    this.isPrimary = options.isPrimary ?? false;
    this.pointerType = options.pointerType ?? "touch";
  }
}

function GestureButton({ onPress, onStart }: {
  onPress: (kind: PressKind) => void;
  onStart: () => void;
}) {
  const { pressed, holding, handlers } = useButtonGesture(onPress, onStart);
  return <button type="button" {...handlers} data-pressed={pressed} data-holding={holding}>後悔ボタン</button>;
}

const pointer = { pointerId: 1, isPrimary: true, button: 0, clientX: 200, clientY: 200 };

function setup() {
  const onPress = vi.fn<(kind: PressKind) => void>();
  const onStart = vi.fn();
  const view = render(<GestureButton onPress={onPress} onStart={onStart} />);
  const button = screen.getByRole("button", { name: "後悔ボタン" });
  const captured = new Set<number>();
  Object.defineProperties(button, {
    setPointerCapture: { configurable: true, value: (id: number) => captured.add(id) },
    hasPointerCapture: { configurable: true, value: (id: number) => captured.has(id) },
    releasePointerCapture: { configurable: true, value: (id: number) => captured.delete(id) },
  });
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 200, 200));
  return { ...view, button, onPress, onStart };
}

function advance(milliseconds: number) {
  act(() => { vi.advanceTimersByTime(milliseconds); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("PointerEvent", TestPointerEvent);
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pointer activation", () => {
  it("commits once on release, not touch-down, and ignores the following native click", () => {
    const { button, onPress, onStart } = setup();
    fireEvent.pointerDown(button, pointer);
    expect(button.getAttribute("data-pressed")).toBe("true");
    expect(onPress).not.toHaveBeenCalled();
    advance(LONG_PRESS_MS - 1);
    expect(onPress).not.toHaveBeenCalled();

    fireEvent.pointerUp(button, pointer);
    fireEvent.click(button, { detail: 1 });
    advance(LONG_PRESS_MS);

    expect(onPress.mock.calls).toEqual([["normal"]]);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("data-pressed")).toBe("false");
    expect(button.getAttribute("data-holding")).toBe("false");
  });

  it("commits exactly one deep press at 1200ms, even after a long hold, release, and click", () => {
    const { button, onPress } = setup();
    fireEvent.pointerDown(button, pointer);
    advance(1199);
    expect(onPress).not.toHaveBeenCalled();
    advance(1);
    expect(onPress.mock.calls).toEqual([["deep"]]);
    expect(button.getAttribute("data-pressed")).toBe("true");
    expect(button.getAttribute("data-holding")).toBe("false");

    advance(20_000);
    fireEvent.pointerUp(button, pointer);
    fireEvent.click(button, { detail: 1 });
    expect(onPress.mock.calls).toEqual([["deep"]]);
    expect(button.getAttribute("data-pressed")).toBe("false");
  });

  it.each([
    ["right mouse button", { ...pointer, button: 2 }],
    ["middle mouse button", { ...pointer, button: 1 }],
    ["secondary touch", { ...pointer, pointerId: 2, isPrimary: false }],
  ])("ignores %s", (_name, input) => {
    const { button, onPress, onStart } = setup();
    fireEvent.pointerDown(button, input);
    advance(LONG_PRESS_MS);
    fireEvent.pointerUp(button, input);
    expect(onStart).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("does not let a second pointer's movement or release finish the primary gesture", () => {
    const { button, onPress, onStart } = setup();
    fireEvent.pointerDown(button, pointer);
    fireEvent.pointerDown(button, { ...pointer, pointerId: 2, isPrimary: false });
    fireEvent.pointerMove(button, { ...pointer, pointerId: 2, clientX: 500 });
    fireEvent.pointerUp(button, { ...pointer, pointerId: 2 });
    expect(onPress).not.toHaveBeenCalled();

    fireEvent.pointerUp(button, pointer);
    expect(onPress.mock.calls).toEqual([["normal"]]);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("accepts a small amount of movement beyond the visual edge", () => {
    const { button, onPress } = setup();
    fireEvent.pointerDown(button, pointer);
    fireEvent.pointerMove(button, { ...pointer, clientX: 310 });
    fireEvent.pointerUp(button, { ...pointer, clientX: 310 });
    expect(onPress.mock.calls).toEqual([["normal"]]);
  });

  it.each([
    ["left", { clientX: 87 }],
    ["right", { clientX: 313 }],
    ["top", { clientY: 87 }],
    ["bottom", { clientY: 313 }],
  ])("cancels when dragged outside the %s edge, without counting on release", (_edge, coordinates) => {
    const { button, onPress } = setup();
    fireEvent.pointerDown(button, pointer);
    advance(500);
    fireEvent.pointerMove(button, { ...pointer, ...coordinates });
    advance(LONG_PRESS_MS);
    fireEvent.pointerUp(button, pointer);
    fireEvent.click(button, { detail: 1 });
    expect(onPress).not.toHaveBeenCalled();
    expect(button.getAttribute("data-pressed")).toBe("false");
  });

  it.each(["pointerCancel", "lostPointerCapture", "buttonBlur", "windowBlur", "hidden"] as const)(
    "cancels an incomplete gesture after %s", (reason) => {
      const { button, onPress } = setup();
      fireEvent.pointerDown(button, pointer);
      advance(500);
      if (reason === "pointerCancel") fireEvent.pointerCancel(button, pointer);
      if (reason === "lostPointerCapture") fireEvent.lostPointerCapture(button, pointer);
      if (reason === "buttonBlur") fireEvent.blur(button);
      if (reason === "windowBlur") fireEvent(window, new Event("blur"));
      if (reason === "hidden") {
        vi.spyOn(document, "hidden", "get").mockReturnValue(true);
        fireEvent(document, new Event("visibilitychange"));
      }
      advance(LONG_PRESS_MS);
      fireEvent.pointerUp(button, pointer);
      expect(onPress).not.toHaveBeenCalled();
      expect(button.getAttribute("data-pressed")).toBe("false");
      expect(button.getAttribute("data-holding")).toBe("false");
    },
  );

  it("does not cancel simply because the page becomes visible", () => {
    const { button, onPress } = setup();
    fireEvent.pointerDown(button, pointer);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    fireEvent.pointerUp(button, pointer);
    expect(onPress.mock.calls).toEqual([["normal"]]);
  });

  it("allows a fresh tap after cancellation", () => {
    const { button, onPress } = setup();
    fireEvent.pointerDown(button, pointer);
    fireEvent.pointerCancel(button, pointer);
    fireEvent.pointerDown(button, pointer);
    fireEvent.pointerUp(button, pointer);
    advance(LONG_PRESS_MS);
    expect(onPress.mock.calls).toEqual([["normal"]]);
  });

  it("cleans up the hold timer when the component unmounts", () => {
    const { button, onPress, unmount } = setup();
    fireEvent.pointerDown(button, pointer);
    advance(500);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    advance(LONG_PRESS_MS);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("keyboard and assistive activation", () => {
  it.each([" ", "Enter"])("commits %j once on release and suppresses the browser default", (key) => {
    const { button, onPress, onStart } = setup();
    expect(fireEvent.keyDown(button, { key })).toBe(false);
    fireEvent.keyDown(button, { key, repeat: true });
    fireEvent.keyDown(button, { key, repeat: true });
    expect(onPress).not.toHaveBeenCalled();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(fireEvent.keyUp(button, { key })).toBe(false);
    advance(LONG_PRESS_MS);
    expect(onPress.mock.calls).toEqual([["normal"]]);
  });

  it.each([" ", "Enter"])("recognizes a long %j key hold only once", (key) => {
    const { button, onPress, onStart } = setup();
    fireEvent.keyDown(button, { key });
    advance(LONG_PRESS_MS);
    fireEvent.keyDown(button, { key, repeat: true });
    advance(LONG_PRESS_MS * 3);
    fireEvent.keyUp(button, { key });
    expect(onPress.mock.calls).toEqual([["deep"]]);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("keeps real keyboard event sequences from synthesizing a duplicate activation", async () => {
    // No hold timing is involved here. Real timers also let testing-library's
    // asynchronous event wrapper drain its own task queue normally.
    vi.useRealTimers();
    try {
      const user = userEvent.setup();
      const { button, onPress } = setup();
      button.focus();
      await user.keyboard("{Enter} ");
      expect(onPress.mock.calls).toEqual([["normal"], ["normal"]]);
    } finally {
      vi.useFakeTimers();
    }
  });

  it("does not let a different key release finish an active hold", () => {
    const { button, onPress } = setup();
    fireEvent.keyDown(button, { key: " " });
    fireEvent.keyUp(button, { key: "Enter" });
    expect(onPress).not.toHaveBeenCalled();
    fireEvent.keyUp(button, { key: " " });
    expect(onPress.mock.calls).toEqual([["normal"]]);
  });

  it("ignores unrelated keys and orphaned repeat events", () => {
    const { button, onPress, onStart } = setup();
    for (const key of ["Tab", "Escape", "a"]) {
      fireEvent.keyDown(button, { key });
      fireEvent.keyUp(button, { key });
    }
    fireEvent.keyDown(button, { key: " ", repeat: true });
    fireEvent.keyUp(button, { key: " " });
    advance(LONG_PRESS_MS);
    expect(onStart).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("supports an assistive click that has no pointer or keyboard sequence", () => {
    const { button, onPress, onStart } = setup();
    fireEvent.click(button, { detail: 0 });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onPress.mock.calls).toEqual([["normal"]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not count a synthetic click while a gesture is still active", () => {
    const { button, onPress, onStart } = setup();
    fireEvent.keyDown(button, { key: " " });
    fireEvent.click(button, { detail: 0 });
    expect(onPress).not.toHaveBeenCalled();
    fireEvent.keyUp(button, { key: " " });
    expect(onPress.mock.calls).toEqual([["normal"]]);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
