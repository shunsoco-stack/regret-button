"use client";

import { useEffect, useRef, type PointerEvent, type RefObject } from "react";

/** A tiny, critically damped spring; the hit area stays stationary and usable. */
export function useButtonSpring(visualRef: RefObject<HTMLSpanElement | null>, enabled: boolean) {
  const target = useRef({ x: 0, y: 0 });
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    const element = visualRef.current;
    if (!element) return;
    if (!enabled) { element.style.transform = "none"; target.current = { x: 0, y: 0 }; return; }
    let frame = 0;
    let previous = 0;
    const point = { x: 0, y: 0, vx: 0, vy: 0 };
    function step(now: number) {
      frame = 0;
      const delta = previous ? Math.min((now - previous) / 1000, 0.032) : 1 / 60;
      previous = now;
      point.vx += ((target.current.x - point.x) * 220 - point.vx * 30) * delta;
      point.vy += ((target.current.y - point.y) * 220 - point.vy * 30) * delta;
      point.x += point.vx * delta;
      point.y += point.vy * delta;
      if (element) element.style.transform = `translate3d(${point.x.toFixed(2)}px,${point.y.toFixed(2)}px,0)`;
      if (Math.abs(target.current.x - point.x) + Math.abs(target.current.y - point.y) + Math.abs(point.vx) + Math.abs(point.vy) > 0.015) {
        frame = requestAnimationFrame(step);
      } else { previous = 0; }
    }
    wake.current = () => { if (!frame) frame = requestAnimationFrame(step); };
    return () => { cancelAnimationFrame(frame); wake.current = () => {}; element.style.transform = "none"; };
  }, [enabled, visualRef]);

  return {
    reset: () => { target.current = { x: 0, y: 0 }; wake.current(); },
    move(event: PointerEvent<HTMLDivElement>) {
      if (!enabled || event.pointerType !== "mouse" || event.buttons !== 0 || document.activeElement?.matches(".regret-button")) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = event.clientY - rect.top - rect.height / 2;
      const distance = Math.hypot(x, y);
      const strength = Math.max(0, 1 - distance / 210) * 7;
      target.current = { x: -x / Math.max(distance, 1) * strength, y: -y / Math.max(distance, 1) * strength };
      wake.current();
    },
  };
}
