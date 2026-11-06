"use client";

import { useEffect, useState } from "react";

/** Counts up to `target` once when it first arrives (0.7s, fast start, soft landing). Skipped for reduced motion. */
export function useCountUp(target: number | null, duration = 700): number | null {
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    if (target === null) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target === 0) {
      const id = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(id);
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setValue(Math.round((target * eased) / 100) * 100);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return target === null ? null : (value ?? 0);
}
