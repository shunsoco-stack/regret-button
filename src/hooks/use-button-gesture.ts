"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import type { PressKind } from "@/lib/regret";

export const LONG_PRESS_MS = 1200;

export function useButtonGesture(onPress: (kind: PressKind) => void, onStart: () => void) {
  const [pressed, setPressed] = useState(false);
  const [holding, setHolding] = useState(false);
  const gesture = useRef<{ source: "pointer" | "keyboard"; pointerId?: number; key?: string; deep: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function cancel() {
    clearTimer();
    gesture.current = null;
    setPressed(false);
    setHolding(false);
  }

  function start(source: "pointer" | "keyboard", id: number | string) {
    if (gesture.current) return;
    onStart();
    gesture.current = { source, ...(source === "pointer" ? { pointerId: id as number } : { key: id as string }), deep: false };
    setPressed(true);
    setHolding(true);
    timer.current = setTimeout(() => {
      if (!gesture.current) return;
      gesture.current.deep = true;
      setHolding(false);
      onPress("deep");
    }, LONG_PRESS_MS);
  }

  function finish() {
    const current = gesture.current;
    if (!current) return;
    cancel();
    if (!current.deep) onPress("normal");
  }

  useEffect(() => {
    const abort = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      gesture.current = null;
      setPressed(false);
      setHolding(false);
    };
    const onVisibility = () => { if (document.hidden) abort(); };
    window.addEventListener("blur", abort);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("blur", abort);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return {
    pressed, holding,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (event.button !== 0 || !event.isPrimary || gesture.current) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        start("pointer", event.pointerId);
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        if (gesture.current?.source !== "pointer" || gesture.current.pointerId !== event.pointerId) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left - 12 || event.clientX > rect.right + 12 || event.clientY < rect.top - 12 || event.clientY > rect.bottom + 12) cancel();
      },
      onPointerUp(event: PointerEvent<HTMLButtonElement>) {
        if (gesture.current?.source !== "pointer" || gesture.current.pointerId !== event.pointerId) return;
        finish();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (!event.repeat) start("keyboard", event.key);
      },
      onKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
        if (gesture.current?.source !== "keyboard" || event.key !== gesture.current.key) return;
        event.preventDefault();
        finish();
      },
      onBlur: cancel,
      onContextMenu(event: MouseEvent<HTMLButtonElement>) { event.preventDefault(); },
      onClick(event: MouseEvent<HTMLButtonElement>) {
        // Pointer and keyboard gestures already commit on release. detail=0 also
        // supports assistive technology's synthetic activation without a pointer.
        if (event.detail === 0 && !gesture.current) { onStart(); onPress("normal"); }
      },
    },
  };
}
